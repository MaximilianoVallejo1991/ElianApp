import crypto from 'node:crypto';
import prisma from '../lib/prisma.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { AppError } from '../utils/errors.js';
import * as inviteService from './invite.service.js';

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
 * The RAW token is returned to the caller (real system would email it).
 * Only a SHA-256 HASH is stored in the database so a leaked DB dump
 * does not expose valid reset tokens.
 *
 * @param {string} email
 * @returns {Promise<string | null>} the raw token, or null if email not found
 */
export async function generateResetToken(email) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    // Security: never reveal whether the email exists
    return null;
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordResetToken: hashedToken },
  });

  return rawToken;
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
