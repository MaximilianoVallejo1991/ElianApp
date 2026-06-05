import * as authService from '../services/auth.service.js';
import { signToken } from '../utils/jwt.js';

// ---------------------------------------------------------------------------
//  Auth Controller
// ---------------------------------------------------------------------------
//  Request / response layer. Delegates to authService for domain logic.
//  Express 5 automatically forwards rejections from async handlers to the
//  error middleware — no manual try/catch required.
//
//  Cookie contract:
//    Name:    token
//    Flags:   httpOnly, secure, sameSite=lax
//    Max age: 7 days (604800000 ms)
// ---------------------------------------------------------------------------

/** Shared cookie base options (used for both set and clear). */
export const COOKIE_BASE = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
};

/** Full options used when setting the JWT cookie. */
const LOGIN_COOKIE = {
  ...COOKIE_BASE,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// ---------------------------------------------------------------------------
//  Handlers
// ---------------------------------------------------------------------------

/**
 * POST /auth/register
 *
 * Body validated by Zod middleware before this handler runs.
 */
export async function register(req, res) {
  const { email, nickName, password } = req.body;
  const user = await authService.register({ email, nickName, password });

  // Set JWT cookie so the user is logged in immediately after registration
  const token = signToken({ userId: user.id, email: user.email });
  res.cookie('token', token, LOGIN_COOKIE);

  res.status(201).json(user);
}

/**
 * POST /auth/login
 *
 * On success, sets the httpOnly 'token' cookie with a signed JWT.
 */
export async function login(req, res) {
  const { email, password } = req.body;
  const user = await authService.login({ email, password });

  const token = signToken({ userId: user.id, email: user.email });

  res.cookie('token', token, LOGIN_COOKIE);
  res.status(200).json(user);
}

/**
 * POST /auth/logout
 *
 * Synchronous — clears the auth cookie unconditionally.
 */
export function logout(_req, res) {
  res.clearCookie('token', COOKIE_BASE);
  res.status(200).json({ message: 'Logged out successfully' });
}

/**
 * GET /auth/me  (PROTECTED — auth middleware runs first)
 *
 * Returns the authenticated user's profile.  req.user is attached by the
 * authenticate middleware and guaranteed to be present here.
 */
export async function me(req, res) {
  const user = await authService.getUserById(req.user.userId);

  if (!user) {
    // JWT was valid but the user row was deleted — edge case
    return res.status(401).json({
      error: 'User no longer exists',
      code: 'UNAUTHORIZED',
    });
  }

  res.status(200).json(user);
}

/**
 * POST /auth/forgot-password
 *
 * Always returns 200 regardless of whether the email exists.
 * The generated token is NOT included in the response (in a real system
 * it would be emailed).  The raw token is returned internally by the
 * service but never exposed to the client.
 */
export async function forgotPassword(req, res) {
  const { email } = req.body;
  await authService.generateResetToken(email);
  res.status(200).json({
    message: 'If the email is registered, a reset token has been generated',
  });
}
