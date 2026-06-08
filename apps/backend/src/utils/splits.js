/**
 * Split calculation utility — pure functions for expense split math.
 *
 * All amounts are rounded to 2 decimal places to avoid floating-point drift.
 * These functions are unit-testable without any database dependencies.
 */

/**
 * Calculate equal splits — each member pays the same share.
 *
 * The last member may receive a slightly different amount due to rounding
 * so the total always sums exactly to `totalAmount`.
 *
 * @param {number} totalAmount — positive expense amount
 * @param {string[]} memberIds — array of user IDs to split among
 * @returns {Array<{ userId: string, amount: number }>}
 */
export function calculateEqualSplits(totalAmount, memberIds) {
  if (!memberIds || memberIds.length === 0) {
    return [];
  }

  const share = Math.round((totalAmount / memberIds.length) * 100) / 100;
  const distributed = share * (memberIds.length - 1);
  const lastShare = Math.round((totalAmount - distributed) * 100) / 100;

  return memberIds.map((userId, i) => ({
    userId,
    amount: i < memberIds.length - 1 ? share : lastShare,
  }));
}

/**
 * Calculate exact splits — each member pays the amount explicitly provided.
 *
 * The caller MUST validate that amounts sum to `totalAmount` before calling.
 * This function applies rounding and returns the splits as-is.
 *
 * @param {number} totalAmount — total expense amount (unused except for documentation)
 * @param {Array<{ userId: string, amount: number }>} splits — pre-validated exact amounts
 * @returns {Array<{ userId: string, amount: number }>}
 */
export function calculateExactSplits(totalAmount, splits) {
  // Caller has already validated the sum; apply rounding for safety
  return splits.map((s) => ({
    userId: s.userId,
    amount: Math.round(s.amount * 100) / 100,
  }));
}

/**
 * Calculate percentage splits — each member pays `totalAmount * percentage / 100`.
 *
 * The caller MUST validate that percentages sum to 100 before calling.
 * Resulting amounts are rounded to 2 decimal places.
 *
 * @param {number} totalAmount — total expense amount
 * @param {Array<{ userId: string, percentage: number }>} splits — percentages must sum to 100
 * @returns {Array<{ userId: string, amount: number, percentage: number }>}
 */
export function calculatePercentageSplits(totalAmount, splits) {
  return splits.map((s) => ({
    userId: s.userId,
    amount: Math.round((totalAmount * s.percentage / 100) * 100) / 100,
    percentage: s.percentage,
  }));
}
