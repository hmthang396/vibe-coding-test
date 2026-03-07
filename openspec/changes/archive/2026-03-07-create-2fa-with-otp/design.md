## Context

The application is a fresh NestJS 11 skeleton with no auth system. `nodemailer` is already installed and SMTP env vars are defined. `AppModule` already imports `OtpModule` (placeholder). The goal is to implement integrated 2FA where password login is step 1 and email OTP is step 2, with JWT session tokens issued only after both steps succeed.

## Goals / Non-Goals

**Goals:**
- Integrated 2FA: password login → email OTP → JWT cookies
- Pending 2FA token to cryptographically bind step 1 to step 2
- HttpOnly cookie delivery of access + refresh tokens
- Refresh token rotation with Redis invalidation
- OTP rate limiting (1/min), attempt limiting (3 max), TTL (5 min)
- Protected route example (`GET /auth/me`)

**Non-Goals:**
- OAuth / social login
- TOTP/authenticator app support
- Email templates (plain text OTP email is sufficient)
- Role-based access control
- Account lockout beyond OTP attempt limits

## Decisions

### 1. ORM: TypeORM over Prisma

**Choice:** TypeORM via `@nestjs/typeorm`

**Rationale:** First-class NestJS integration, decorator-based entities match the project's class-based style, and the schema is minimal (one `User` entity). Prisma's advantages (type-safe client, schema.prisma) don't outweigh the additional setup for a single entity.

**Alternative considered:** Prisma — better DX at scale, but requires a separate build step and manual NestJS provider wiring.

---

### 2. Pending 2FA Token pattern

**Choice:** Short-lived JWT with `stage: "pending_2fa"` claim, returned as a JSON response body (not a cookie) after successful password login.

```
POST /auth/login → 200 { pendingToken: "<jwt>" }

pendingToken payload: {
  sub: userId,
  email: "user@example.com",
  stage: "pending_2fa"
}
TTL: 10 minutes
```

**Rationale:** Proves the caller completed step 1 (password validation) before being allowed to call step 2 (OTP verification). A `PendingTwoFactorGuard` checks both signature validity and `stage === "pending_2fa"`, blocking direct calls to `/auth/verify-otp` without prior login.

**Alternative considered:** Stateless (just use email as implicit state) — simpler, but allows skipping password login if an attacker can trigger OTP sends independently.

**Why not a cookie for the pending token?** The pending token is pre-authentication state. Keeping it in the response body (Bearer pattern) avoids polluting the cookie jar with a partial-auth credential, making the two states clearly distinct.

---

### 3. Redis key schema

```
otp:{email}:code        → JSON { code, attempts }    TTL: 300s (5 min)
otp:{email}:ratelimit   → "1"                        TTL: 60s  (1 min)
refresh:{userId}        → hashed refresh token       TTL: 604800s (7 days)
```

**Rationale:** Separate keys for OTP and rate limit allow independent TTLs. Hashing the refresh token in Redis means a Redis dump cannot be used to forge sessions — only the raw token (in the cookie) can be validated.

**Hash algorithm for refresh token:** SHA-256 (no salt needed — tokens are already high-entropy random JWTs).

---

### 4. Refresh Token Rotation

**Choice:** On every `POST /auth/refresh`, issue a new access + refresh token pair, invalidate the previous refresh token in Redis, and set a new `refresh:{userId}` entry.

**Flow:**
```
1. Read refresh_token cookie
2. Verify JWT signature
3. Hash token → compare against Redis refresh:{userId}
4. If match: delete old key, sign new pair, store new hash, set cookies
5. If mismatch: 401 (possible token reuse attack)
```

**Rationale:** Token reuse detection — if an attacker steals a refresh token and uses it after the legitimate user has already rotated, the mismatch triggers a 401. This is the standard defence against refresh token theft.

**Trade-off:** A user making concurrent requests near expiry could self-invalidate. Acceptable for this use case; a small grace period can be added later if needed.

---

### 5. Cookie configuration

```
access_token:  HttpOnly, Secure, SameSite=Strict, Max-Age=900    (15 min)
refresh_token: HttpOnly, Secure, SameSite=Strict, Max-Age=604800 (7 days)
```

**Rationale:** `HttpOnly` prevents XSS token theft. `SameSite=Strict` prevents CSRF. `Secure` ensures cookies are only sent over HTTPS. Values are configurable via env vars (`JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`).

---

### 6. Module structure

```
src/
├── redis/
│   └── redis.module.ts          ← Global ioredis provider (REDIS_HOST, REDIS_PORT)
├── mail/
│   ├── mail.module.ts
│   └── mail.service.ts          ← nodemailer transporter, sendOtp(email, code)
├── otp/
│   ├── otp.module.ts
│   └── otp.service.ts           ← send(), verify(), uses Redis + MailService
├── users/
│   ├── users.module.ts
│   ├── users.service.ts         ← findByEmail(), create()
│   └── user.entity.ts           ← id (uuid), email (unique), passwordHash, createdAt
└── auth/
    ├── auth.module.ts
    ├── auth.controller.ts       ← register, login, verify-otp, refresh, logout, me
    ├── auth.service.ts          ← orchestrates UsersService + OtpService + JWT
    ├── dto/
    │   ├── register.dto.ts      ← email, password (class-validator)
    │   ├── login.dto.ts         ← email, password
    │   └── verify-otp.dto.ts    ← code (6-digit string)
    └── guards/
        ├── jwt-auth.guard.ts         ← validates access_token cookie
        └── pending-2fa.guard.ts      ← validates pendingToken + stage claim
```

`RedisModule` is registered as `global: true` so all modules can inject the Redis client without re-importing.

---

### 7. OTP attempt logic (state machine)

```
verify attempt N:
  1. GET otp:{email}:code  → if nil → 410 Gone (expired/not found)
  2. Parse { code, attempts }
  3. attempts++
  4. If attempts > 3 → DEL key → 429 Too Many Requests
  5. If code mismatch → SET key with updated attempts (preserve TTL) → 401
  6. If code match → DEL key → proceed to token issuance → 200
```

On step 5, the remaining TTL is fetched before write and re-applied (`SET ... KEEPTTL` or `EXPIRE`) to prevent TTL reset on each failed attempt.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Redis unavailability blocks all auth | Accept for now (Redis is required infra); add health check endpoint |
| SMTP delivery delay causes OTP to expire | 10-min pending token window > 5-min OTP window; user can re-request |
| Refresh token stolen from cookie | `HttpOnly` + `Secure` + rotation detection limits blast radius |
| Timing attack on OTP comparison | Use constant-time string comparison (`crypto.timingSafeEqual`) |
| Email enumeration on register | Return identical 201 response whether email is new or already exists |
| Concurrent refresh requests cause self-invalidation | Known trade-off; acceptable for v1 |

## Migration Plan

1. Install new dependencies (`ioredis`, `typeorm`, `pg`, `@nestjs/typeorm`, `@nestjs/jwt`, `bcrypt`, `cookie-parser`)
2. Provision Redis instance and PostgreSQL database; populate env vars
3. Run TypeORM migration to create `users` table
4. Deploy new modules (`redis`, `mail`, `otp`, `users`, `auth`)
5. Smoke test: register → login → verify OTP → access `/auth/me` → refresh → logout

**Rollback:** Delete new module directories, revert `AppModule` imports, run `DROP TABLE users` migration. No existing endpoints are affected.

## Open Questions

- Should the `users` table include an `isVerified` or `isActive` flag for email verification flows in future? (Deferring — not in scope for 2FA MVP)
- Should failed OTP attempts be logged/audited to a DB table? (Deferring — Redis attempt counter is sufficient for now)
