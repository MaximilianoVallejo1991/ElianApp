import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

/**
 * Hash a plaintext password using bcrypt with cost factor 12.
 *
 * @param {string} plain — the plaintext password
 * @returns {Promise<string>} the hashed password
 */
export async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/**
 * Compare a plaintext password against a bcrypt hash.
 *
 * @param {string} plain — the plaintext password to check
 * @param {string} hash  — the stored bcrypt hash
 * @returns {Promise<boolean>} true if they match
 */
export async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}
