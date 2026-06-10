# Delta for User Authentication

## MODIFIED Requirements

### Requirement: Forgot Password

The system MUST provide a forgot-password flow. The frontend MUST show a "Forgot password?" link on LoginPage that expands into a form accepting email. The frontend MUST submit via `POST /auth/forgot-password`. The system SHALL generate a secure random reset token, store the hashed token with the user record for validation, and return HTTP 200. The system MUST NOT reveal whether the email exists (same success response for existing and non-existing emails). Email delivery and password-reset consumption page are OUT OF SCOPE.

(Previously: Only a "Password Reset Token" endpoint at POST /auth/password-reset existed with no frontend UI; endpoint path changed to /auth/forgot-password, and frontend form added)

#### Scenario: User requests password reset

- GIVEN user enters email `alice@example.com` on forgot-password form
- WHEN user submits `POST /auth/forgot-password` with `{ email: "alice@example.com" }`
- THEN system generates token, stores hashed version with user record, and returns HTTP 200 with `{ message: "If an account with that email exists, a reset link has been sent" }`

#### Scenario: User requests reset for non-existent email

- GIVEN no user with email `nonexistent@example.com` exists
- WHEN user submits `POST /auth/forgot-password` with `{ email: "nonexistent@example.com" }`
- THEN system returns HTTP 200 with same message (no indication of whether email exists)