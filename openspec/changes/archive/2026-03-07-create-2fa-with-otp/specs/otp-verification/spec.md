## ADDED Requirements

### Requirement: OTP generation and storage
The system SHALL generate a cryptographically random 6-digit numeric OTP, store it in Redis under `otp:{email}:code` as JSON `{ code, attempts: 0 }` with a TTL of 300 seconds (5 minutes).

#### Scenario: OTP generated and stored on send
- **WHEN** the OTP service is instructed to send an OTP to a given email
- **THEN** a 6-digit numeric code is generated, stored in Redis with a 300s TTL, and passed to the mail service for delivery

#### Scenario: New OTP overwrites existing OTP
- **WHEN** an OTP send is triggered for an email that already has an active OTP in Redis
- **THEN** the new code replaces the old one, the attempt counter resets to 0, and the TTL is reset to 300s

---

### Requirement: OTP send rate limiting
The system SHALL enforce a maximum of 1 OTP send per email address per 60 seconds using a Redis key `otp:{email}:ratelimit` with a TTL of 60 seconds and `SET NX` semantics.

#### Scenario: First OTP send within rate limit window
- **WHEN** an OTP send is requested for an email and no `otp:{email}:ratelimit` key exists in Redis
- **THEN** the OTP is generated and sent, and the ratelimit key is set with a 60s TTL

#### Scenario: Repeated OTP send within rate limit window
- **WHEN** an OTP send is requested for an email and `otp:{email}:ratelimit` key already exists in Redis
- **THEN** the system rejects the request with HTTP 429 and `{ message: "Rate limit exceeded. Try again in 60 seconds." }` without generating or sending an OTP

#### Scenario: OTP send after rate limit window expires
- **WHEN** an OTP send is requested for an email after the 60s ratelimit key has expired
- **THEN** the system proceeds normally: generates a new OTP, sends it, and sets a new ratelimit key

---

### Requirement: OTP verification with attempt tracking
The system SHALL verify a submitted code against the stored OTP. Each failed attempt SHALL increment the attempt counter. After 3 failed attempts the OTP SHALL be invalidated. Verification SHALL use constant-time comparison to prevent timing attacks.

#### Scenario: Correct OTP on first attempt
- **WHEN** a POST request is made to `/auth/verify-otp` with a code that matches the stored OTP and attempts < 3
- **THEN** the Redis key `otp:{email}:code` is deleted, and the system proceeds to issue session tokens

#### Scenario: Incorrect OTP, attempts remaining
- **WHEN** a POST request is made to `/auth/verify-otp` with an incorrect code and the current attempt count is less than 3
- **THEN** the attempt counter is incremented and saved back (preserving the remaining TTL), and the system responds with HTTP 401 and `{ message: "Invalid OTP", attemptsRemaining: N }`

#### Scenario: Incorrect OTP, max attempts reached
- **WHEN** a POST request is made to `/auth/verify-otp` with an incorrect code and the attempt count reaches 3
- **THEN** the Redis key `otp:{email}:code` is deleted and the system responds with HTTP 429 and `{ message: "Too many failed attempts. Request a new OTP." }`

#### Scenario: OTP verification after expiry
- **WHEN** a POST request is made to `/auth/verify-otp` and the `otp:{email}:code` key does not exist in Redis (expired or never created)
- **THEN** the system responds with HTTP 410 and `{ message: "OTP expired or not found. Request a new one." }`

#### Scenario: Timing-safe comparison
- **WHEN** any OTP code comparison is performed
- **THEN** the system SHALL use `crypto.timingSafeEqual` (or equivalent constant-time method) to compare codes, ensuring response time does not leak code validity

---

### Requirement: OTP TTL preservation on failed attempt
The system SHALL NOT reset the OTP TTL when updating the attempt counter after a failed verification. The original expiry time SHALL be maintained.

#### Scenario: TTL preserved after failed attempt
- **WHEN** a failed OTP verification increments the attempt counter and writes the updated record back to Redis
- **THEN** the remaining TTL of the `otp:{email}:code` key is unchanged (using `KEEPTTL` or equivalent)
