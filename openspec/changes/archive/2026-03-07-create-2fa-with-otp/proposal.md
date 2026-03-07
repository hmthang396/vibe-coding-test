## Why

The application currently has no authentication system. To protect user accounts and sensitive operations, we need integrated two-factor authentication (2FA) using time-limited OTPs delivered via email — a user logs in with their password, receives a 6-digit OTP, and must verify it before receiving session tokens.

## What Changes

- **New**: User registration endpoint (`POST /auth/register`) with password hashing (bcrypt)
- **New**: Password-based login endpoint (`POST /auth/login`) that validates credentials and triggers OTP delivery, returning a short-lived "pending 2FA" JWT
- **New**: OTP verification endpoint (`POST /auth/verify-otp`) that accepts the pending JWT + OTP code, issues `access_token` + `refresh_token` as `HttpOnly` cookies on success
- **New**: Token refresh endpoint (`POST /auth/refresh`) with refresh token rotation — each use invalidates the old token and issues a new pair
- **New**: Logout endpoint (`POST /auth/logout`) that clears cookies and invalidates the refresh token in Redis
- **New**: Protected profile endpoint (`GET /auth/me`) demonstrating JWT guard usage
- **New**: Email OTP delivery via nodemailer (SMTP) with rate limiting (1 send/min per email), 6-digit numeric codes, 5-minute expiry, and max 3 verification attempts before invalidation
- **New**: Redis-backed OTP and refresh token stores with TTL-based expiry
- **New**: PostgreSQL `users` table (email, passwordHash, createdAt) via TypeORM

## Capabilities

### New Capabilities

- `user-auth`: Full authentication lifecycle — register, login (password), 2FA verify, refresh, logout, and protected route access using JWT cookies
- `otp-verification`: OTP generation, Redis storage, email delivery, and verification with rate limiting and attempt tracking
- `email-notification`: Transactional email delivery via nodemailer/SMTP for OTP codes

### Modified Capabilities

*(none — no existing specs)*

## Impact

**New source modules:**
- `src/redis/` — global ioredis provider
- `src/mail/` — nodemailer wrapper service
- `src/otp/` — OTP send/verify logic (referenced but not yet implemented in `AppModule`)
- `src/users/` — user entity and lookup service
- `src/auth/` — controllers, service, guards, DTOs

**New dependencies:**
- `ioredis` + `@types/ioredis` — Redis client
- `@nestjs/typeorm` + `typeorm` + `pg` — PostgreSQL ORM
- `@nestjs/jwt` + `@types/passport-jwt` — JWT signing/verification
- `bcrypt` + `@types/bcrypt` — password hashing
- `cookie-parser` + `@types/cookie-parser` — cookie parsing middleware

**Environment variables added:**
- `REDIS_HOST`, `REDIS_PORT`
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`
- `JWT_ACCESS_SECRET`, `JWT_ACCESS_EXPIRES_IN`
- `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN`
- `JWT_PENDING_SECRET`, `JWT_PENDING_EXPIRES_IN`

**Affected teams:** Backend, Security, DevOps (new Redis + PostgreSQL infra required)

**Rollback plan:** The `OtpModule` import in `AppModule` is the only existing hook. Removing it and deleting `src/auth/`, `src/otp/`, `src/users/`, `src/mail/`, `src/redis/` fully reverts the application to its current state with no data loss (users table can be dropped via migration rollback). No existing public APIs are modified.
