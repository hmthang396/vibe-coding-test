import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Response } from 'express';
import Redis from 'ioredis';
import { OtpService } from '../otp/otp.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { UsersService } from '../users/users.service';

const DUMMY_HASH =
  '$2b$10$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly otp: OtpService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async register(email: string, password: string): Promise<void> {
    const existing = await this.users.findByEmail(email);
    if (!existing) {
      const passwordHash = await bcrypt.hash(password, 10);
      await this.users.create(email, passwordHash);
    }
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ pendingToken: string }> {
    const user = await this.users.findByEmail(email);
    const hash = user?.passwordHash ?? DUMMY_HASH;
    const valid = await bcrypt.compare(password, hash);
    if (!user || !valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const pendingToken = this.jwt.sign(
      { sub: user.id, email: user.email, stage: 'pending_2fa' },
      {
        secret: this.config.get<string>('JWT_PENDING_SECRET'),
        expiresIn: this.config.get<number>('JWT_PENDING_EXPIRES_IN', 600),
      },
    );

    await this.otp.send(email);
    return { pendingToken };
  }

  async verifyOtp(
    userId: string,
    email: string,
    code: string,
    res: Response,
  ): Promise<void> {
    await this.otp.verify(email, code);
    await this.issueTokens(userId, email, res);
  }

  async refresh(rawRefreshToken: string, res: Response): Promise<void> {
    let userId: string;
    let email: string;
    try {
      const payload = this.jwt.verify<{ sub: string; email: string }>(
        rawRefreshToken,
        {
          secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        },
      );
      userId = payload.sub;
      email = payload.email;
    } catch {
      throw new UnauthorizedException();
    }

    const stored = await this.redis.get(`refresh:${userId}`);
    const incoming = crypto
      .createHash('sha256')
      .update(rawRefreshToken)
      .digest('hex');

    if (!stored || stored !== incoming) {
      throw new UnauthorizedException();
    }

    await this.issueTokens(userId, email, res);
  }

  async logout(
    rawRefreshToken: string | undefined,
    res: Response,
  ): Promise<void> {
    if (rawRefreshToken) {
      try {
        const payload = this.jwt.verify<{ sub: string }>(rawRefreshToken, {
          secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        });
        await this.redis.del(`refresh:${payload.sub}`);
      } catch {
        // token invalid or expired — still clear cookies
      }
    }
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
  }

  private async issueTokens(
    userId: string,
    email: string,
    res: Response,
  ): Promise<void> {
    const accessToken = this.jwt.sign(
      { sub: userId, email },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<number>('JWT_ACCESS_EXPIRES_IN', 900),
      },
    );

    const refreshToken = this.jwt.sign(
      { sub: userId, email },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<number>('JWT_REFRESH_EXPIRES_IN', 604800),
      },
    );

    const refreshHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');
    await this.redis.set(
      `refresh:${userId}`,
      refreshHash,
      'EX',
      this.config.get<number>('JWT_REFRESH_EXPIRES_IN', 604800),
    );

    const cookieOpts = {
      httpOnly: true,
      secure: true,
      sameSite: 'strict' as const,
    };
    res.cookie('access_token', accessToken, {
      ...cookieOpts,
      maxAge: this.config.get<number>('JWT_ACCESS_EXPIRES_IN', 900) * 1000,
    });
    res.cookie('refresh_token', refreshToken, {
      ...cookieOpts,
      maxAge: this.config.get<number>('JWT_REFRESH_EXPIRES_IN', 604800) * 1000,
    });
  }
}
