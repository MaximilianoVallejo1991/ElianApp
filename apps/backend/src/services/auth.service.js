import crypto from 'node:crypto';
import prisma from '../lib/prisma.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { AppError } from '../utils/errors.js';
import * as inviteService from './invite.service.js';

const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

// ---------------------------------------------------------------------------
//  Auth Service
// ---------------------------------------------------------------------------
//  Domain logic for user registration, login, password-reset token generation,
//  and user lookups. Every function is an async named export — no classes,
//  no instantiation, matching the existing utils pattern.
// ---------------------------------------------------------------------------

/**
 * Register a new user.
 *
 * Checks email and nickName uniqueness explicitly so the caller receives
 * specific, human-readable error codes rather than relying on Prisma P2002
 * fallback handling alone.
 *
 * If an inviteToken is provided, it is validated and consumed: the new user
 * is automatically added to the group as an ACTIVE member. If the token is
 * invalid or expired, the registration is rejected BEFORE the user is created.
 *
 * @param {{ email: string, nickName: string, password: string, inviteToken?: string }} input
 * @returns {Promise<{ id: string, email: string, nickName: string }>}
 * @throws {AppError} EMAIL_EXISTS | NICKNAME_EXISTS | INVALID_TOKEN | TOKEN_EXPIRED | ALREADY_MEMBER
 */
export async function register({ email, nickName, password, inviteToken }) {
  // -- Uniqueness checks ----------------------------------------------------
  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) {
    throw new AppError('EMAIL_EXISTS', 400, 'Email already registered');
  }

  const existingNick = await prisma.user.findUnique({ where: { nickName } });
  if (existingNick) {
    throw new AppError('NICKNAME_EXISTS', 400, 'Nickname already taken');
  }

  // -- Hash & persist -------------------------------------------------------
  const hashed = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email,
      nickName,
      hashedPassword: hashed,
    },
    select: {
      id: true,
      email: true,
      nickName: true,
    },
  });

  // -- Consume invite token (AFTER user creation) ---------------------------
  if (inviteToken) {
    await inviteService.consumeInviteToken(inviteToken, user.id);
  }

  return user;
}

/**
 * Authenticate a user with email + password.
 *
 * Returns the user object WITHOUT the token — the controller owns
 * token creation and cookie setting.
 *
 * @param {{ email: string, password: string }} input
 * @returns {Promise<{ id: string, email: string, nickName: string }>}
 * @throws {AppError} INVALID_CREDENTIALS
 */
export async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    throw new AppError('INVALID_CREDENTIALS', 401, 'Invalid credentials');
  }

  const valid = await comparePassword(password, user.hashedPassword);
  if (!valid) {
    throw new AppError('INVALID_CREDENTIALS', 401, 'Invalid credentials');
  }

  return {
    id: user.id,
    email: user.email,
    nickName: user.nickName,
  };
}

/**
 * Generate a cryptographically-secure password-reset token.
 *
 * The RAW token is returned to the caller (the controller will email it).
 * Only a SHA-256 HASH is stored in the database so a leaked DB dump
 * does not expose valid reset tokens.
 *
 * The token expires after 1 hour.
 *
 * @param {string} email
 * @returns {Promise<{ rawToken: string, userEmail: string } | null>}
 *    null if email not found (never reveal whether the email exists)
 */
export async function generateResetToken(email) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    // Security: never reveal whether the email exists
    return null;
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: hashedToken,
      passwordResetExpires: expiresAt,
    },
  });

  return { rawToken, userEmail: user.email };
}

/**
 * Reset a user's password using a valid reset token.
 *
 * Looks up the user by HASHING the provided raw token, checks expiry,
 * updates the password, and clears the token so it cannot be reused.
 *
 * @param {string} rawToken — the token from the reset link
 * @param {string} newPassword — the new password
 * @throws {AppError} INVALID_TOKEN | TOKEN_EXPIRED
 */
export async function resetPassword(rawToken, newPassword) {
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

  const user = await prisma.user.findFirst({
    where: { passwordResetToken: hashedToken },
  });

  if (!user) {
    throw new AppError('INVALID_TOKEN', 400, 'Invalid or expired reset link');
  }

  if (!user.passwordResetExpires || new Date() > user.passwordResetExpires) {
    // Clear the expired token so it can't be used later
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: null, passwordResetExpires: null },
    });
    throw new AppError('TOKEN_EXPIRED', 410, 'Reset link has expired. Request a new one.');
  }

  const hashed = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      hashedPassword: hashed,
      passwordResetToken: null,
      passwordResetExpires: null,
    },
  });
}

/**
 * Look up a user by their primary key.
 *
 * @param {string} userId
 * @returns {Promise<{ id: string, email: string, nickName: string } | null>}
 */
export async function getUserById(userId) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      nickName: true,
    },
  });
}
