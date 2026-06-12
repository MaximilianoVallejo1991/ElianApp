import { z } from 'zod';

/**
 * POST /auth/register
 *
 * Required fields: email, nickName, password
 *   - email: valid email format
 *   - nickName: 3-30 chars, alphanumeric + underscores
 *   - password: min 8 chars
 *   - inviteToken: optional, consumed to auto-join a group with ACTIVE status
 */
export const registerSchema = z.object({
  email: z
    .string()
    .email('Invalid email address'),
  nickName: z
    .string()
    .min(3, 'Nickname must be at least 3 characters')
    .max(30, 'Nickname must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Nickname can only contain letters, numbers, and underscores'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters'),
  inviteToken: z
    .string()
    .uuid('Invalid invite token format')
    .optional(),
});

/**
 * POST /auth/login
 *
 * Required fields: email, password
 */
export const loginSchema = z.object({
  email: z
    .string()
    .email('Invalid email address'),
  password: z
    .string()
    .min(1, 'Password is required'),
});

/**
 * POST /auth/forgot-password
 *
 * Required fields: email
 */
export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .email('Invalid email address'),
});

/**
 * POST /auth/reset-password
 *
 * Required fields: token (from reset link), password (min 8 chars)
 */
export const resetPasswordSchema = z.object({
  token: z
    .string()
    .min(1, 'Reset token is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters'),
});
