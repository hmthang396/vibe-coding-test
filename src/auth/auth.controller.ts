import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PendingTwoFactorGuard } from './guards/pending-2fa.guard';

interface JwtUser {
  sub: string;
  email: string;
}

interface PendingUser {
  sub: string;
  email: string;
  stage: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto): Promise<{ message: string }> {
    await this.auth.register(dto.email, dto.password);
    return { message: 'Registered successfully' };
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto): Promise<{ pendingToken: string }> {
    return this.auth.login(dto.email, dto.password);
  }

  @Post('verify-otp')
  @HttpCode(200)
  @UseGuards(PendingTwoFactorGuard)
  async verifyOtp(
    @Req() req: Request & { pendingUser: PendingUser },
    @Body() dto: VerifyOtpDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    await this.auth.verifyOtp(req.pendingUser.sub, req.pendingUser.email, dto.code, res);
    return { message: 'OTP verified' };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const token = req.cookies?.refresh_token as string | undefined;
    if (!token) throw new UnauthorizedException();
    await this.auth.refresh(token, res);
    return { message: 'Token refreshed' };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const token = req.cookies?.refresh_token as string | undefined;
    await this.auth.logout(token, res);
    return { message: 'Logged out' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(
    @Req() req: Request & { user: JwtUser },
  ): { id: string; email: string } {
    return { id: req.user.sub, email: req.user.email };
  }
}
