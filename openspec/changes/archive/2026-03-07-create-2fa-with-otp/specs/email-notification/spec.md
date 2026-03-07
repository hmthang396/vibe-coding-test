## ADDED Requirements

### Requirement: OTP email delivery
The system SHALL deliver OTP codes to users via email using nodemailer with an SMTP transport configured through environment variables. Email delivery SHALL be fire-and-forget from the caller's perspective — the send operation is triggered but the HTTP response does not wait for SMTP confirmation.

#### Scenario: OTP email sent successfully
- **WHEN** the mail service is called with a valid recipient email and a 6-digit OTP code
- **THEN** an email is sent via the configured SMTP transport with the OTP code visible in the message body

#### Scenario: SMTP configuration loaded from environment
- **WHEN** the mail service is initialized
- **THEN** it reads `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASS`, and `MAIL_FROM` from environment variables to configure the nodemailer transporter

---

### Requirement: OTP email content
The system SHALL send a plain-text email containing the 6-digit OTP code, a clear expiry notice (5 minutes), and a disclaimer that the code was not requested by the recipient if they did not initiate login.

#### Scenario: Email body includes OTP and expiry
- **WHEN** an OTP email is composed
- **THEN** the email body SHALL contain the 6-digit code, the text "expires in 5 minutes", and the sender address specified in `MAIL_FROM`

#### Scenario: Email subject is identifiable
- **WHEN** an OTP email is sent
- **THEN** the subject line SHALL be "Your verification code" or equivalent, making the purpose immediately clear in an inbox

---

### Requirement: SMTP transport resilience
The system SHALL not crash or hang if SMTP delivery fails. Errors during email sending SHALL be logged but SHALL NOT propagate to the HTTP response layer, as the OTP is already stored in Redis before email dispatch.

#### Scenario: SMTP delivery failure is logged, not surfaced
- **WHEN** the nodemailer transporter fails to deliver an email (e.g., SMTP timeout, auth failure)
- **THEN** the error is logged at the ERROR level and the calling service continues normally without throwing
