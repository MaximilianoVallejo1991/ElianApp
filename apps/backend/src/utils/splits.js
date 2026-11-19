/**
 * Split calculation utility — pure functions for expense split math.
 *
 * All amounts are rounded to 2 decimal places to avoid floating-point drift.
 * These functions are unit-testable without any database dependencies.
 */

import { AppError } from './errors.js';

/**
 * Apportion `totalCents` across `weights` by the largest-remainder (Hamilton)
 * method: floor each exact share, then give the leftover cents to the largest
 * fractional remainders, ties broken by lowest original index.
 *
 * Precondition, held by every caller in this file: `weights` is non-empty,
 * every weight is a finite number >= 0, `sum(weights) > 0`, `totalCents >= 0`.
 * Module-private so that precondition cannot be broken from outside.
 *
 * @param {number} totalCents — integer cents to distribute
 * @param {number[]} weights — relative shares; any positive scale works
 * @returns {number[]} integer cents, same length/order, summing exactly to totalCents
 */
function apportionCents(totalCents, weights) {
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  const exact = weights.map((w) => (totalCents * w) / weightSum);
  const floors = exact.map((c) => Math.floor(c));
  const remainders = exact.map((c, i) => c - floors[i]);

  const leftover = totalCents - floors.reduce((sum, c) => sum + c, 0);

  // Earlier original index wins a remainder tie, so the output is deterministic
  // regardless of the engine's sort-stability guarantees.
  const order = weights
    .map((_, i) => i)
    .sort((a, b) => remainders[b] - remainders[a] || a - b);
  const bumped = new Set(order.slice(0, leftover));

  return floors.map((c, i) => c + (bumped.has(i) ? 1 : 0));
}

/**
 * Calculate equal splits — each member pays the same share.
 *
 * Uses the largest-remainder method (see `apportionCents`) to distribute the
 * rounding remainder, so the total always sums exactly to `totalAmount` and
 * no member's amount can go negative.
 *
 * @param {number} totalAmount — positive expense amount
 * @param {string[]} memberIds — array of user IDs to split among
 * @returns {Array<{ userId: string, amount: number }>}
 */
export function calculateEqualSplits(totalAmount, memberIds) {
  if (!memberIds || memberIds.length === 0) {
    return [];
  }

  const cents = apportionCents(Math.round(totalAmount * 100), memberIds.map(() => 1));
  return memberIds.map((userId, i) => ({ userId, amount: cents[i] / 100 }));
}

/**
 * Calculate percentage splits — each member pays `totalAmount * percentage / 100`.
 *
 * Defensively re-checks that `splits` sums to 100% before computing amounts —
 * a caller passing a filtered subset (e.g. by participantIds) that does not
 * represent the full 100% would otherwise have one element silently absorb
 * an unfair share of the remainder. An empty array or non-numeric percentage
 * also fails this check — there is no valid "empty" or "NaN" 100%-summing
 * percentage set, so both are rejected rather than silently producing `[]`
 * or `NaN` amounts. Each individual percentage must also be a finite number
 * `>= 0` — a negative/positive pair that sums to 100 (e.g. -10 and 110)
 * would otherwise pass the sum check and produce a negative `amount` for
 * the negative-percentage participant, the exact defect this function
 * exists to prevent.
 *
 * Uses the largest-remainder method (see `apportionCents`), fed the raw
 * (non-normalized) percentages as weights: `apportionCents` divides by their
 * sum internally, so percentages within epsilon tolerance of 100 (e.g.
 * 100.0066) distribute correctly without a separate rescale step. Unlike a
 * scheme where a single element absorbs the entire remainder, this cannot
 * push any participant's amount negative, and the cent(s) left over after
 * flooring every share go to whichever participants were closest to
 * rounding up — not to whoever happens to be last in the array.
 *
 * @param {number} totalAmount — total expense amount
 * @param {Array<{ userId: string, percentage: number }>} splits — percentages must sum to 100
 * @returns {Array<{ userId: string, amount: number, percentage: number }>}
 * @throws {AppError} INVALID_SPLITS — when the percentages don't sum to 100,
 *   are missing/non-numeric, are negative, or `splits` is empty
 */
export function calculatePercentageSplits(totalAmount, splits) {
  const epsilon = 0.01; // tolerance for floating-point rounding (mirrors validateSplits)
  const percentageSum = (splits || []).reduce((sum, s) => sum + s.percentage, 0);
  const hasNegativePercentage = (splits || []).some(
    (s) => !Number.isFinite(s.percentage) || s.percentage < 0,
  );
  if (
    !Number.isFinite(percentageSum) ||
    Math.abs(percentageSum - 100) > epsilon ||
    hasNegativePercentage
  ) {
    throw new AppError(
      'INVALID_SPLITS',
      400,
      'Split percentages must sum to 100',
    );
  }

  const cents = apportionCents(
    Math.round(totalAmount * 100),
    splits.map((s) => s.percentage),
  );

  return splits.map((s, i) => ({
    userId: s.userId,
    amount: cents[i] / 100,
    percentage: s.percentage,
  }));
}

/**
 * Compute COLLECTIVE expense status based on items sum and total.
 *
 * @param {number} itemsSum — sum of all item amounts
 * @param {number} sharedCosts — shared costs amount
 * @param {number} total — total expense amount
 * @returns {'COMPLETED' | 'MISMATCH'}
 */
export function computeCollectiveStatus(itemsSum, sharedCosts, total) {
  const epsilon = 0.01;
  if (Math.abs(itemsSum + sharedCosts - total) <= epsilon) {
    return 'COMPLETED';
  }
  return 'MISMATCH';
}

/**
 * Assert that generated splits sum to the expense total (±0.01).
 *
 * Extracted from expense.service.js's computeSplits (Cycle 1 ADR-6) so EVERY
 * split-generating path carries the same backstop — the COLLECTIVE path had
 * none, which is how orphaned items silently under-split a COMPLETED
 * expense. Deliberately a REJECT, not a rescale: reinterpreting how much
 * each person owes is a money decision the server must not make
 * unilaterally.
 *
 * @param {Array<{ amount: number }>} splits
 * @param {number} totalAmount
 * @throws {AppError} VALIDATION_ERROR 400
 */
export function assertSplitsSumToTotal(splits, totalAmount) {
  const computedTotal = (splits || []).reduce((sum, s) => sum + s.amount, 0);
  if (Math.abs(computedTotal - totalAmount) > 0.01) {
    throw new AppError('VALIDATION_ERROR', 400, 'Split amounts must sum to expense amount');
  }
}

/**
 * Calculate COLLECTIVE splits — each participant owes their item amount
 * plus an equal share of the shared costs.
 *
 * Uses the largest-remainder method (see `apportionCents`) to distribute the
 * shared-cost rounding remainder, so no participant's amount can go negative.
 *
 * @param {Array<{ userId: string, amount: number }>} items — each participant's item
 * @param {number} sharedCosts — shared costs amount to split among participants
 * @param {string[]} participantIds — ordered list of participant IDs
 * @returns {Array<{ userId: string, amount: number }>}
 */
export function calculateCollectiveSplits(items, sharedCosts, participantIds) {
  if (!participantIds || participantIds.length === 0) {
    return [];
  }

  const sharedCents = apportionCents(
    Math.round(sharedCosts * 100),
    participantIds.map(() => 1),
  );

  // Build a map of userId -> item amount for quick lookup
  const itemMap = new Map(items.map((item) => [item.userId, item.amount]));

  return participantIds.map((userId, i) => {
    const itemAmount = itemMap.get(userId) || 0;
    return {
      userId,
      amount: Math.round((itemAmount + sharedCents[i] / 100) * 100) / 100,
    };
  });
}
