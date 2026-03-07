import {
  GoneException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import { MailService } from '../mail/mail.service';
import { REDIS_CLIENT } from '../redis/redis.module';

interface OtpRecord {
  code: string;
  attempts: number;
}

@Injectable()
export class OtpService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly mail: MailService,
  ) {}

  async send(email: string): Promise<void> {
    const rateLimitKey = `otp:${email}:ratelimit`;
    const set = await this.redis.set(rateLimitKey, '1', 'EX', 60, 'NX');
    if (set === null) {
      throw new HttpException(
        'Rate limit exceeded. Try again in 60 seconds.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = String(crypto.randomInt(100000, 1000000)).padStart(6, '0');
    const record: OtpRecord = { code, attempts: 0 };
    await this.redis.set(`otp:${email}:code`, JSON.stringify(record), 'EX', 300);

    await this.mail.sendOtp(email, code);
  }

  async verify(email: string, submittedCode: string): Promise<void> {
    const codeKey = `otp:${email}:code`;
    const raw = await this.redis.get(codeKey);
    if (!raw) {
      throw new GoneException('OTP expired or not found. Request a new one.');
    }

    const record: OtpRecord = JSON.parse(raw) as OtpRecord;
    record.attempts += 1;

    if (record.attempts > 3) {
      await this.redis.del(codeKey);
      throw new HttpException(
        'Too many failed attempts. Request a new OTP.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const storedBuf = Buffer.from(record.code.padEnd(6));
    const submittedBuf = Buffer.from(submittedCode.padEnd(6));
    const match =
      storedBuf.length === submittedBuf.length &&
      crypto.timingSafeEqual(storedBuf, submittedBuf);

    if (!match) {
      const ttl = await this.redis.ttl(codeKey);
      await this.redis.set(codeKey, JSON.stringify(record), 'EX', ttl > 0 ? ttl : 1);
      throw new UnauthorizedException({
        message: 'Invalid OTP',
        attemptsRemaining: 3 - record.attempts,
      });
    }

    await this.redis.del(codeKey);
  }
}
