import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { OtpModule } from '../otp/otp.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PendingTwoFactorGuard } from './guards/pending-2fa.guard';

@Module({
  imports: [UsersModule, OtpModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, PendingTwoFactorGuard],
  exports: [AuthService],
})
export class AuthModule {}
