import jwt from 'jsonwebtoken';

/**
 * Create a signed JWT token for the given payload.
 *
 * @param {{ userId: string, email: string }} payload
 * @returns {string} signed JWT
 */
export function signToken(payload) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

/**
 * Verify and decode a JWT token.
 *
 * @param {string} token — the JWT to verify
 * @returns {{ userId: string, email: string }} decoded payload
 * @throws {jwt.JsonWebTokenError} if token is invalid or expired
 */
export function verifyToken(token) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return jwt.verify(token, secret);
}
