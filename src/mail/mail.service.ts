import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    this.from = config.get<string>('MAIL_FROM', 'OTP Service <noreply@example.com>');
    this.transporter = nodemailer.createTransport({
      host: config.get<string>('MAIL_HOST', 'smtp.gmail.com'),
      port: config.get<number>('MAIL_PORT', 587),
      secure: config.get<string>('MAIL_SECURE') === 'true',
      auth: {
        user: config.get<string>('MAIL_USER'),
        pass: config.get<string>('MAIL_PASS'),
      },
    });
  }

  async sendOtp(email: string, code: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: email,
        subject: 'Your verification code',
        text: [
          `Your verification code is: ${code}`,
          `This code expires in 5 minutes.`,
          `If you did not request this code, please ignore this email.`,
        ].join('\n\n'),
      });
    } catch (err) {
      this.logger.error(`Failed to send OTP email to ${email}: ${String(err)}`);
    }
  }
}
