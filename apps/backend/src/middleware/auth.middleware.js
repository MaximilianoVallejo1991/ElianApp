import { verifyToken } from '../utils/jwt.js';
import { AppError } from '../utils/errors.js';

/**
 * Authentication middleware.
 *
 * Reads JWT from the 'token' httpOnly cookie, verifies it, and attaches
 * `req.user = { userId, email }` for downstream handlers.
 *
 * Returns 401 UNAUTHORIZED if the cookie is missing, malformed, or expired.
 *
 * Usage:
 *   router.get('/me', authenticate, controller.me);
 */

const COOKIE_NAME = 'token';

export function authenticate(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME];

  if (!token) {
    return next(new AppError('UNAUTHORIZED', 401, 'Authentication required'));
  }

  try {
    const payload = verifyToken(token);
    req.user = {
      userId: payload.userId,
      email: payload.email,
    };
    next();
  } catch (_err) {
    // jwt.verify throws on expired, malformed, or invalid tokens
    return next(new AppError('UNAUTHORIZED', 401, 'Authentication required'));
  }
}
