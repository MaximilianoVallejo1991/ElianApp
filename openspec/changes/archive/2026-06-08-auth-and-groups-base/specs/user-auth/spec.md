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

### Requirement: Password Reset Token

The system MUST generate a secure random token when user requests password reset. The system SHALL store the hashed token with user record for validation.

#### Scenario: Generate reset token

- GIVEN user with email `alice@example.com` exists
- WHEN user submits `POST /auth/password-reset` with `{ email: "alice@example.com" }`
- THEN system generates token, stores hashed version, and returns HTTP 200 (token not returned — would be emailed in real system)