import { GoneException, HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from '../mail/mail.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { OtpService } from './otp.service';

const mockRedis = {
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  ttl: jest.fn(),
};

const mockMail = { sendOtp: jest.fn() };

describe('OtpService', () => {
  let service: OtpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: REDIS_CLIENT, useValue: mockRedis },
        { provide: MailService, useValue: mockMail },
      ],
    }).compile();
    service = module.get(OtpService);
    jest.clearAllMocks();
  });

  describe('send', () => {
    it('throws 429 when rate limit key exists', async () => {
      mockRedis.set.mockResolvedValueOnce(null); // SET NX returned null = already exists
      await expect(service.send('user@example.com')).rejects.toThrow(HttpException);
      expect(mockMail.sendOtp).not.toHaveBeenCalled();
    });

    it('generates and stores OTP, then sends email on success', async () => {
      mockRedis.set
        .mockResolvedValueOnce('OK') // ratelimit key set
        .mockResolvedValueOnce('OK'); // code key set
      mockMail.sendOtp.mockResolvedValueOnce(undefined);

      await service.send('user@example.com');

      expect(mockRedis.set).toHaveBeenCalledWith(
        'otp:user@example.com:ratelimit',
        '1',
        'EX',
        60,
        'NX',
      );
      expect(mockRedis.set).toHaveBeenCalledWith(
        'otp:user@example.com:code',
        expect.stringContaining('"attempts":0'),
        'EX',
        300,
      );
      expect(mockMail.sendOtp).toHaveBeenCalledWith(
        'user@example.com',
        expect.stringMatching(/^\d{6}$/),
      );
    });
  });

  describe('verify', () => {
    it('throws 410 when OTP key does not exist (expired)', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      await expect(service.verify('user@example.com', '123456')).rejects.toThrow(GoneException);
    });

    it('deletes key and resolves when code is correct', async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({ code: '123456', attempts: 0 }));
      mockRedis.del.mockResolvedValueOnce(1);

      await expect(service.verify('user@example.com', '123456')).resolves.toBeUndefined();
      expect(mockRedis.del).toHaveBeenCalledWith('otp:user@example.com:code');
    });

    it('throws 401 with attemptsRemaining when code is wrong', async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({ code: '999999', attempts: 0 }));
      mockRedis.ttl.mockResolvedValueOnce(250);
      mockRedis.set.mockResolvedValueOnce('OK');

      await expect(service.verify('user@example.com', '111111')).rejects.toMatchObject({
        response: expect.objectContaining({ attemptsRemaining: 2 }),
      });
    });

    it('preserves TTL when saving updated attempts on wrong code', async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({ code: '999999', attempts: 1 }));
      mockRedis.ttl.mockResolvedValueOnce(180);
      mockRedis.set.mockResolvedValueOnce('OK');

      await expect(service.verify('user@example.com', '111111')).rejects.toBeDefined();
      expect(mockRedis.set).toHaveBeenCalledWith(
        'otp:user@example.com:code',
        expect.any(String),
        'EX',
        180,
      );
    });

    it('throws 429 and deletes key when max attempts exceeded', async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({ code: '999999', attempts: 3 }));
      mockRedis.del.mockResolvedValueOnce(1);

      await expect(service.verify('user@example.com', '111111')).rejects.toThrow(HttpException);
      expect(mockRedis.del).toHaveBeenCalledWith('otp:user@example.com:code');
    });
  });
});
