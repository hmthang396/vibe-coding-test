## 1. Dependencies & Environment

- [x] 1.1 Install new packages: `ioredis`, `@nestjs/typeorm`, `typeorm`, `pg`, `@nestjs/jwt`, `bcrypt`, `cookie-parser`
- [x] 1.2 Install type packages: `@types/bcrypt`, `@types/cookie-parser`
- [x] 1.3 Add new env vars to `.env.example`: `REDIS_HOST`, `REDIS_PORT`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`, `JWT_ACCESS_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN`, `JWT_PENDING_SECRET`, `JWT_PENDING_EXPIRES_IN`

## 2. Redis Module

- [x] 2.1 Create `src/redis/redis.module.ts` — global module exporting an ioredis `IORedis` provider configured from `REDIS_HOST` / `REDIS_PORT` env vars
- [x] 2.2 Register `RedisModule` in `AppModule` imports

## 3. Mail Module

- [x] 3.1 Create `src/mail/mail.module.ts` and `src/mail/mail.service.ts`
- [x] 3.2 Implement `MailService.sendOtp(email: string, code: string)` using nodemailer with SMTP env vars (`MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`)
- [x] 3.3 Email body includes OTP code, "expires in 5 minutes" notice, and subject "Your verification code"
- [x] 3.4 Wrap `transporter.sendMail` in try/catch — log errors, do not throw

## 4. Users Module

- [x] 4.1 Create `src/users/user.entity.ts` with TypeORM entity: `id` (uuid, primary), `email` (unique), `passwordHash`, `createdAt`
- [x] 4.2 Create `src/users/users.service.ts` with `findByEmail(email)` and `create(email, passwordHash)` methods
- [x] 4.3 Create `src/users/users.module.ts`, export `UsersService`
- [x] 4.4 Configure TypeORM in `AppModule` with `TypeOrmModule.forRoot` using DB env vars, `synchronize: false`, and the `User` entity

## 5. Database Migration

- [x] 5.1 Generate TypeORM migration to create `users` table with `id`, `email`, `password_hash`, `created_at` columns
- [ ] 5.2 Run migration and verify table is created

## 6. OTP Module

- [x] 6.1 Create `src/otp/otp.service.ts` with `send(email: string)` method:
  - Check `otp:{email}:ratelimit` key — if exists, throw 429
  - Generate 6-digit numeric code via `crypto.randomInt(100000, 999999)`
  - Store `otp:{email}:code` as JSON `{ code, attempts: 0 }` with TTL 300s
  - Set `otp:{email}:ratelimit` with `SET NX EX 60`
  - Call `MailService.sendOtp`
- [x] 6.2 Create `src/otp/otp.service.ts` `verify(email: string, code: string)` method:
  - GET `otp:{email}:code` — if nil, throw 410
  - Increment attempts
  - If attempts > 3: DEL key, throw 429
  - Compare codes with `crypto.timingSafeEqual` — if mismatch: update attempts using `SET ... KEEPTTL`, throw 401 with `attemptsRemaining`
  - If match: DEL key, return true
- [x] 6.3 Create `src/otp/otp.module.ts`, import `RedisModule` and `MailModule`, export `OtpService`
- [x] 6.4 Replace existing placeholder `OtpModule` reference in `AppModule` with the real implementation

## 7. Auth Guards

- [x] 7.1 Create `src/auth/guards/jwt-auth.guard.ts` — reads `access_token` cookie, verifies with `JWT_ACCESS_SECRET`, attaches `req.user`
- [x] 7.2 Create `src/auth/guards/pending-2fa.guard.ts` — reads `Authorization: Bearer` header, verifies with `JWT_PENDING_SECRET`, checks `payload.stage === 'pending_2fa'`

## 8. Auth DTOs

- [x] 8.1 Create `src/auth/dto/register.dto.ts` — `email` (IsEmail), `password` (MinLength 8)
- [x] 8.2 Create `src/auth/dto/login.dto.ts` — `email` (IsEmail), `password` (IsString)
- [x] 8.3 Create `src/auth/dto/verify-otp.dto.ts` — `code` (IsString, Length 6, Matches `/^\d{6}$/`)

## 9. Auth Service

- [x] 9.1 Create `src/auth/auth.service.ts` with `register(email, password)`:
  - Call `UsersService.findByEmail` — always return same response regardless of result (anti-enumeration)
  - If user not found: hash password with bcrypt (rounds: 10), call `UsersService.create`
- [x] 9.2 Implement `login(email, password)` in `AuthService`:
  - Find user; if not found, compare against dummy hash to prevent timing leak, then throw 401
  - `bcrypt.compare` password; if mismatch, throw 401
  - Sign pending JWT `{ sub: userId, email, stage: 'pending_2fa' }` with `JWT_PENDING_SECRET`, expiry 10 min
  - Call `OtpService.send(email)`
  - Return `{ pendingToken }`
- [x] 9.3 Implement `verifyOtp(userId, email, code, res)` in `AuthService`:
  - Call `OtpService.verify(email, code)` (throws on failure)
  - Sign `access_token` JWT `{ sub: userId }` with `JWT_ACCESS_SECRET`
  - Sign `refresh_token` JWT `{ sub: userId }` with `JWT_REFRESH_SECRET`
  - SHA-256 hash the refresh token, store as `refresh:{userId}` in Redis with TTL 7 days
  - Set both tokens as `HttpOnly`, `Secure`, `SameSite=Strict` cookies on `res`
- [x] 9.4 Implement `refresh(userId, rawRefreshToken, res)` in `AuthService`:
  - Verify JWT signature; get `userId` from payload
  - SHA-256 hash incoming token; compare against `refresh:{userId}` in Redis — mismatch → 401
  - Issue new access + refresh token pair
  - Overwrite `refresh:{userId}` with new hash, reset TTL
  - Set new cookies on `res`
- [x] 9.5 Implement `logout(userId, res)` in `AuthService`:
  - DEL `refresh:{userId}` from Redis (if exists)
  - Clear both cookies (set Max-Age: 0)

## 10. Auth Controller

- [x] 10.1 Create `src/auth/auth.controller.ts` with `POST /auth/register` → `AuthService.register`, return 201
- [x] 10.2 Add `POST /auth/login` → `AuthService.login`, return 200 `{ pendingToken }`
- [x] 10.3 Add `POST /auth/verify-otp` (guarded by `PendingTwoFactorGuard`) → `AuthService.verifyOtp`, return 200 + set cookies
- [x] 10.4 Add `POST /auth/refresh` → `AuthService.refresh`, reads `refresh_token` from cookies, return 200 + set new cookies
- [x] 10.5 Add `POST /auth/logout` → `AuthService.logout`, return 200
- [x] 10.6 Add `GET /auth/me` (guarded by `JwtAuthGuard`) → return `{ id, email, createdAt }` from `req.user`

## 11. App Bootstrap

- [x] 11.1 Register `cookie-parser` middleware in `src/main.ts` (`app.use(cookieParser())`)
- [x] 11.2 Enable global `ValidationPipe` in `src/main.ts` with `whitelist: true`, `forbidNonWhitelisted: true`
- [x] 11.3 Create `src/auth/auth.module.ts`, import `UsersModule`, `OtpModule`, `JwtModule`, export `AuthService`
- [x] 11.4 Register `AuthModule` in `AppModule`

## 12. Tests

- [x] 12.1 Write unit tests for `OtpService.send` — rate limit path (429), success path, Redis key assertions
- [x] 12.2 Write unit tests for `OtpService.verify` — expired (410), correct code (200), wrong code (401 with attemptsRemaining), max attempts (429), TTL preservation
- [x] 12.3 Write unit tests for `AuthService.login` — invalid credentials (401), valid credentials (200 + pendingToken)
- [x] 12.4 Write unit tests for `AuthService.verifyOtp` — delegates to OtpService, issues tokens, sets cookies
- [x] 12.5 Write unit tests for `AuthService.refresh` — token mismatch (401), successful rotation
- [ ] 12.6 Write e2e tests for the full flow: register → login → verify-otp → GET /auth/me → refresh → logout
