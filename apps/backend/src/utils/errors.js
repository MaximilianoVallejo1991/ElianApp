/**
 * AppError — custom error class for domain-specific error codes.
 *
 * Usage:
 *   throw new AppError('EMAIL_EXISTS', 400, 'Email already registered');
 *   throw new AppError('NOT_FOUND', 404, 'Group not found');
 *
 * Error codes:
 *   EMAIL_EXISTS, NICKNAME_EXISTS, INVALID_CREDENTIALS, UNAUTHORIZED,
 *   FORBIDDEN, NOT_FOUND, NOT_MEMBER, ALREADY_MEMBER, USER_NOT_FOUND,
 *   NOT_PENDING, CANNOT_REMOVE_OWNER, CANNOT_LEAVE_AS_OWNER,
 *   INVALID_SPLITS, EXPENSE_NOT_FOUND, PAYMENT_NOT_FOUND,
 *   STATIC_GROUP_BALANCE,
 *   INVALID_TOKEN, TOKEN_EXPIRED,
 *   COLLECTIVE_NOT_FOUND, ITEM_NOT_FOUND, NOT_PARTICIPANT,
 *   CANNOT_UPDATE_AFTER_ITEMS, CANNOT_DELETE_WITH_ITEMS,
 *   NOT_CREATOR, ITEMS_LOCKED, ALREADY_REPORTED
 */

export class AppError extends Error {
  /**
   * @param {string} code    — machine-readable error code (e.g. 'EMAIL_EXISTS')
   * @param {number} status  — HTTP status code
   * @param {string} message — human-readable error message
   */
  constructor(code, status, message) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = 'AppError';
    // Ensures instanceof works correctly in ESM
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Type guard: returns true if the value is an AppError instance.
 *
 * @param {unknown} err
 * @returns {err is AppError}
 */
export function isAppError(err) {
  return err instanceof AppError;
}
