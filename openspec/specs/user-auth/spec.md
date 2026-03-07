# Capability: user-auth

## Purpose

Handles user registration, password-based login with 2FA initiation, OTP verification to issue session tokens, access token authentication for protected routes, refresh token rotation, and logout.

## Requirements

### Requirement: User registration
The system SHALL allow a new user to register with a unique email address and a password. The password SHALL be hashed with bcrypt before storage. The system SHALL return an identical 201 response regardless of whether the email already exists, to prevent email enumeration.

#### Scenario: Successful registration
- **WHEN** a POST request is made to `/auth/register` with a valid, previously unused email and a password of at least 8 characters
- **THEN** the system stores the user with a bcrypt-hashed password and responds with HTTP 201 and `{ message: "Registered successfully" }`

#### Scenario: Duplicate email registration
- **WHEN** a POST request is made to `/auth/register` with an email that already exists
- **THEN** the system responds with HTTP 201 and `{ message: "Registered successfully" }` (identical to success — no enumeration)

#### Scenario: Invalid registration input
- **WHEN** a POST request is made to `/auth/register` with a missing email, invalid email format, or password shorter than 8 characters
- **THEN** the system responds with HTTP 400 and a validation error describing the failing field(s)

---

### Requirement: Password-based login initiates 2FA
The system SHALL validate a user's email and password. On success, it SHALL trigger OTP delivery and return a short-lived pending 2FA JWT. The pending token SHALL NOT grant access to protected resources.

#### Scenario: Successful login with valid credentials
- **WHEN** a POST request is made to `/auth/login` with a registered email and correct password
- **THEN** the system sends a 6-digit OTP to the user's email, and responds with HTTP 200 and `{ pendingToken: "<jwt>" }`

#### Scenario: Login with incorrect password
- **WHEN** a POST request is made to `/auth/login` with a registered email and wrong password
- **THEN** the system responds with HTTP 401 and `{ message: "Invalid credentials" }`

#### Scenario: Login with unregistered email
- **WHEN** a POST request is made to `/auth/login` with an email that does not exist
- **THEN** the system responds with HTTP 401 and `{ message: "Invalid credentials" }` (same as wrong password — no enumeration)

#### Scenario: Invalid login input
- **WHEN** a POST request is made to `/auth/login` with a missing or malformed email or password
- **THEN** the system responds with HTTP 400 and a validation error

---

### Requirement: OTP verification issues session tokens
The system SHALL accept a valid pending 2FA JWT (in the `Authorization: Bearer` header) and a 6-digit OTP code. On success, it SHALL issue an `access_token` and `refresh_token` as `HttpOnly`, `Secure`, `SameSite=Strict` cookies and invalidate the OTP.

#### Scenario: Successful OTP verification
- **WHEN** a POST request is made to `/auth/verify-otp` with a valid, unexpired pending JWT in the Authorization header and the correct 6-digit OTP code in the body
- **THEN** the system responds with HTTP 200, sets `access_token` (Max-Age: 15 min) and `refresh_token` (Max-Age: 7 days) cookies, and deletes the OTP from Redis

#### Scenario: Verify-OTP without pending token
- **WHEN** a POST request is made to `/auth/verify-otp` without an `Authorization` header or with a token whose `stage` is not `"pending_2fa"`
- **THEN** the system responds with HTTP 401

#### Scenario: Verify-OTP with expired pending token
- **WHEN** a POST request is made to `/auth/verify-otp` with a pending JWT that has expired (> 10 minutes old)
- **THEN** the system responds with HTTP 401

---

### Requirement: Access token authenticates protected routes
The system SHALL validate the `access_token` cookie on protected endpoints. Requests without a valid, unexpired token SHALL be rejected.

#### Scenario: Accessing protected route with valid token
- **WHEN** a GET request is made to `/auth/me` with a valid, unexpired `access_token` cookie
- **THEN** the system responds with HTTP 200 and the authenticated user's profile (`{ id, email, createdAt }`)

#### Scenario: Accessing protected route without token
- **WHEN** a GET request is made to `/auth/me` without an `access_token` cookie
- **THEN** the system responds with HTTP 401

#### Scenario: Accessing protected route with expired token
- **WHEN** a GET request is made to `/auth/me` with an expired `access_token` cookie
- **THEN** the system responds with HTTP 401

---

### Requirement: Refresh token rotation
The system SHALL accept a valid `refresh_token` cookie, verify it against the stored hash in Redis, and issue a new `access_token` + `refresh_token` pair. The previous refresh token SHALL be invalidated immediately.

#### Scenario: Successful token refresh
- **WHEN** a POST request is made to `/auth/refresh` with a valid, unexpired `refresh_token` cookie whose hash matches the Redis entry
- **THEN** the system responds with HTTP 200, sets new `access_token` and `refresh_token` cookies, and replaces the Redis entry with the new token's hash

#### Scenario: Refresh with invalid or missing token
- **WHEN** a POST request is made to `/auth/refresh` without a `refresh_token` cookie, or with a token that fails JWT signature verification
- **THEN** the system responds with HTTP 401

#### Scenario: Refresh with already-rotated token (reuse detection)
- **WHEN** a POST request is made to `/auth/refresh` with a refresh token that has already been rotated (its hash no longer matches Redis)
- **THEN** the system responds with HTTP 401

---

### Requirement: Logout clears session
The system SHALL clear the `access_token` and `refresh_token` cookies and delete the refresh token hash from Redis.

#### Scenario: Successful logout
- **WHEN** a POST request is made to `/auth/logout` with a valid `refresh_token` cookie
- **THEN** the system deletes the Redis entry for the user's refresh token, clears both cookies (Max-Age: 0), and responds with HTTP 200 and `{ message: "Logged out" }`

#### Scenario: Logout without refresh token
- **WHEN** a POST request is made to `/auth/logout` without a `refresh_token` cookie
- **THEN** the system responds with HTTP 200 (idempotent — no error if already logged out)
