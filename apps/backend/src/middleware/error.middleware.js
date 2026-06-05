import { isAppError } from '../utils/errors.js';

/**
 * Global error handler middleware (Express 4-argument signature).
 *
 * Must be registered LAST after all routes.
 *
 * Handles:
 *   - AppError  → structured JSON with code, status, message
 *   - Prisma P2002 (unique constraint) → 400 with EMAIL_EXISTS or NICKNAME_EXISTS
 *   - Unknown errors → 500 with generic message
 *
 * @param {Error} err
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  // --- AppError — our domain errors -------------------------------------------
  if (isAppError(err)) {
    return res.status(err.status).json({
      error: err.message,
      code: err.code,
    });
  }

  // --- Prisma unique constraint violation (P2002) ----------------------------
  if (err?.code === 'P2002' && err?.meta?.target) {
    const target = Array.isArray(err.meta.target)
      ? err.meta.target[0]
      : err.meta.target;

    const fieldMessages = {
      email: { code: 'EMAIL_EXISTS', message: 'Email already registered' },
      nickName: { code: 'NICKNAME_EXISTS', message: 'Nickname already taken' },
    };

    const known = fieldMessages[target];
    if (known) {
      return res.status(400).json({
        error: known.message,
        code: known.code,
      });
    }

    // Fallback for other unique constraints
    return res.status(400).json({
      error: 'A record with that value already exists',
      code: 'UNIQUE_CONSTRAINT',
    });
  }

  // --- Unknown / unexpected errors -------------------------------------------
  console.error('[unhandled error]', err);

  return res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  });
}
