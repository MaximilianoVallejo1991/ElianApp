# User Authentication Specification

## Purpose

Handles user registration, login, logout, and JWT-based authentication middleware for protected routes.

## Requirements

### Requirement: User Registration

The system MUST accept `email`, `nickName`, and `password` for new user registration. The system SHALL hash the password using bcrypt with cost factor 12 before storage. The system MUST reject registration when email already exists with HTTP 400. The system MUST reject registration when nickName already exists with HTTP 400.

#### Scenario: Successful registration

- GIVEN no user with email `alice@example.com` exists
- WHEN user submits `POST /auth/register` with `{ email: "alice@example.com", nickName: "alice", password: "Secret123" }`
- THEN system creates user with hashed password and returns HTTP 201 with `{ id, email, nickName }`

#### Scenario: Email already exists

- GIVEN user with email `alice@example.com` exists
- WHEN user submits `POST /auth/register` with `{ email: "alice@example.com", nickName: "bob", password: "Secret123" }`
- THEN system returns HTTP 400 with `{ error: "Email already registered", code: "EMAIL_EXISTS" }`

#### Scenario: nickName already exists

- GIVEN user with nickName `alice` exists
- WHEN user submits `POST /auth/register` with `{ email: "other@example.com", nickName: "alice", password: "Secret123" }`
- THEN system returns HTTP 400 with `{ error: "Nickname already taken", code: "NICKNAME_EXISTS" }`

### Requirement: User Login

The system MUST validate email and password credentials. The system SHALL issue a JWT cookie on successful login. The JWT MUST be stored in an httpOnly, secure cookie. The cookie MUST contain `{ userId, email }` as payload. The system MUST return HTTP 401 for invalid credentials.

#### Scenario: Successful login

- GIVEN user with email `alice@example.com` and password `Secret123` exists
- WHEN user submits `POST /auth/login` with `{ email: "alice@example.com", password: "Secret123" }`
- THEN system sets httpOnly JWT cookie and returns HTTP 200 with `{ id, email, nickName }`

#### Scenario: Invalid password

- GIVEN user with email `alice@example.com` exists with password `Secret123`
- WHEN user submits `POST /auth/login` with `{ email: "alice@example.com", password: "WrongPass" }`
- THEN system returns HTTP 401 with `{ error: "Invalid credentials", code: "INVALID_CREDENTIALS" }`

#### Scenario: Non-existent user

- GIVEN no user with email `alice@example.com` exists
- WHEN user submits `POST /auth/login` with `{ email: "alice@example.com", password: "Secret123" }`
- THEN system returns HTTP 401 with `{ error: "Invalid credentials", code: "INVALID_CREDENTIALS" }`

### Requirement: User Logout

The system MUST clear the JWT cookie on logout. The system SHALL return HTTP 200 on successful logout.

#### Scenario: Successful logout

- GIVEN user has valid JWT cookie
- WHEN user submits `POST /auth/logout`
- THEN system clears cookie and returns HTTP 200

### Requirement: Protected Route Access

The system MUST reject requests without valid JWT cookie with HTTP 401. The system MUST allow requests with valid JWT cookie and attach user info to request context.

#### Scenario: Missing cookie

- GIVEN no JWT cookie is present
- WHEN user requests `GET /groups`
- THEN system returns HTTP 401 with `{ error: "Authentication required", code: "UNAUTHORIZED" }`

#### Scenario: Valid cookie

- GIVEN user has valid JWT cookie for userId 1
- WHEN user requests `GET /groups`
- THEN system allows request and sets `req.user = { userId: 1, email: "alice@example.com" }`

#### Scenario: Expired or invalid cookie

- GIVEN JWT cookie is malformed or expired
- WHEN user requests `GET /groups`
- THEN system returns HTTP 401 with `{ error: "Authentication required", code: "UNAUTHORIZED" }`

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