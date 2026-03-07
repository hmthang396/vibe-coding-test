import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { OtpService } from '../otp/otp.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

jest.mock('bcrypt');

const mockUsers = { findByEmail: jest.fn(), create: jest.fn(), findById: jest.fn() };
const mockOtp = { send: jest.fn(), verify: jest.fn() };
const mockJwt = { sign: jest.fn(), verify: jest.fn() };
const mockRedis = { set: jest.fn(), get: jest.fn(), del: jest.fn() };
const mockConfig = { get: jest.fn((_key: string, def?: unknown) => def) };
const mockRes = { cookie: jest.fn(), clearCookie: jest.fn() };

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsers },
        { provide: OtpService, useValue: mockOtp },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();
    service = module.get(AuthService);
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('throws 401 when user not found', async () => {
      mockUsers.findByEmail.mockResolvedValueOnce(null);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);
      await expect(service.login('a@b.com', 'pass')).rejects.toThrow(UnauthorizedException);
    });

    it('throws 401 when password is wrong', async () => {
      mockUsers.findByEmail.mockResolvedValueOnce({
        id: '1',
        email: 'a@b.com',
        passwordHash: 'hash',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);
      await expect(service.login('a@b.com', 'wrong')).rejects.toThrow(UnauthorizedException);
    });

    it('returns pendingToken and sends OTP on valid credentials', async () => {
      mockUsers.findByEmail.mockResolvedValueOnce({
        id: 'uid1',
        email: 'a@b.com',
        passwordHash: 'hash',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
      mockJwt.sign.mockReturnValueOnce('pending.jwt.token');
      mockOtp.send.mockResolvedValueOnce(undefined);

      const result = await service.login('a@b.com', 'correct');
      expect(result).toEqual({ pendingToken: 'pending.jwt.token' });
      expect(mockOtp.send).toHaveBeenCalledWith('a@b.com');
    });
  });

  describe('verifyOtp', () => {
    it('calls OtpService.verify and issues tokens on success', async () => {
      mockOtp.verify.mockResolvedValueOnce(undefined);
      mockJwt.sign.mockReturnValue('signed.token');
      mockRedis.set.mockResolvedValueOnce('OK');

      await service.verifyOtp('uid1', 'a@b.com', '123456', mockRes as any);

      expect(mockOtp.verify).toHaveBeenCalledWith('a@b.com', '123456');
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'access_token',
        expect.any(String),
        expect.any(Object),
      );
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'refresh_token',
        expect.any(String),
        expect.any(Object),
      );
    });

    it('propagates error from OtpService.verify', async () => {
      mockOtp.verify.mockRejectedValueOnce(new UnauthorizedException('Invalid OTP'));
      await expect(
        service.verifyOtp('uid1', 'a@b.com', '000000', mockRes as any),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('throws 401 when stored hash does not match incoming token', async () => {
      mockJwt.verify.mockReturnValueOnce({ sub: 'uid1', email: 'a@b.com' });
      mockRedis.get.mockResolvedValueOnce('different-hash');

      await expect(service.refresh('raw.refresh.token', mockRes as any)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('issues new token pair when refresh token matches stored hash', async () => {
      const rawToken = 'raw.refresh.token';
      const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      mockJwt.verify.mockReturnValueOnce({ sub: 'uid1', email: 'a@b.com' });
      mockRedis.get.mockResolvedValueOnce(expectedHash);
      mockJwt.sign.mockReturnValue('new.signed.token');
      mockRedis.set.mockResolvedValueOnce('OK');

      await service.refresh(rawToken, mockRes as any);

      expect(mockRes.cookie).toHaveBeenCalledWith(
        'access_token',
        expect.any(String),
        expect.any(Object),
      );
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'refresh_token',
        expect.any(String),
        expect.any(Object),
      );
    });
  });
});
