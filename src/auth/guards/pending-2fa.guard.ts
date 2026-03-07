import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

interface PendingPayload {
  sub: string;
  email: string;
  stage: string;
  iat: number;
  exp: number;
}

@Injectable()
export class PendingTwoFactorGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<Request & { pendingUser: PendingPayload }>();
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedException();

    const token = authHeader.slice(7);
    try {
      const payload = this.jwt.verify<PendingPayload>(token, {
        secret: this.config.get<string>('JWT_PENDING_SECRET'),
      });
      if (payload.stage !== 'pending_2fa') throw new UnauthorizedException();
      req.pendingUser = payload;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
