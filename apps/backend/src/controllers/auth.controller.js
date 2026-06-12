import * as authService from '../services/auth.service.js';
import { signToken } from '../utils/jwt.js';
import { sendPasswordResetEmail } from '../lib/email.js';

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
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
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
 * If an inviteToken is provided and valid, the new user is automatically
 * added to the group as an ACTIVE member.
 */
export async function register(req, res) {
  const { email, nickName, password, inviteToken } = req.body;
  const user = await authService.register({ email, nickName, password, inviteToken });

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
 * If the email is registered, generates a reset token and sends it via email.
 * The raw token is never exposed in the API response.
 */
export async function forgotPassword(req, res) {
  const { email } = req.body;
  const result = await authService.generateResetToken(email);

  if (result) {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetUrl = `${baseUrl}/reset-password?token=${result.rawToken}`;
    await sendPasswordResetEmail(result.userEmail, resetUrl);
  }

  res.status(200).json({
    message: 'If the email is registered, a reset link has been sent',
  });
}

/**
 * POST /auth/reset-password
 *
 * Validates the reset token and sets a new password.
 * Token must be valid and not expired. Clears token on success.
 */
export async function resetPassword(req, res) {
  const { token, password } = req.body;
  await authService.resetPassword(token, password);
  res.status(200).json({
    message: 'Password reset successfully. You can now sign in with your new password.',
  });
}
