/**
 * Split calculation utility — pure functions for expense split math.
 *
 * All amounts are rounded to 2 decimal places to avoid floating-point drift.
 * These functions are unit-testable without any database dependencies.
 */

import { AppError } from './errors.js';

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
 * Calculate percentage splits — each member pays `totalAmount * percentage / 100`.
 *
 * Defensively re-checks that `splits` sums to 100% before computing amounts —
 * a caller passing a filtered subset (e.g. by participantIds) that does not
 * represent the full 100% would otherwise have one element silently absorb
 * an unfair share of the remainder.
 *
 * Uses the largest-remainder method (Hamilton apportionment), computed in
 * integer cents, to distribute the rounding remainder: unlike a scheme where
 * a single element absorbs the entire remainder, this cannot push any
 * participant's amount negative, and the cent(s) left over after flooring
 * every share go to whichever participants were closest to rounding up —
 * not to whoever happens to be last in the array.
 *
 * @param {number} totalAmount — total expense amount
 * @param {Array<{ userId: string, percentage: number }>} splits — percentages must sum to 100
 * @returns {Array<{ userId: string, amount: number, percentage: number }>}
 * @throws {AppError} INVALID_SPLITS — when the percentages don't sum to 100
 */
export function calculatePercentageSplits(totalAmount, splits) {
  if (!splits || splits.length === 0) {
    return [];
  }

  const epsilon = 0.01; // tolerance for floating-point rounding (mirrors validateSplits)
  const percentageSum = splits.reduce((sum, s) => sum + s.percentage, 0);
  if (Math.abs(percentageSum - 100) > epsilon) {
    throw new AppError(
      'INVALID_SPLITS',
      400,
      'Split percentages must sum to 100',
    );
  }

  const totalCents = Math.round(totalAmount * 100);

  const exactCents = splits.map((s) => (totalCents * s.percentage) / 100);
  const floorCents = exactCents.map((c) => Math.floor(c));
  const remainders = exactCents.map((c, i) => c - floorCents[i]);

  const distributedFloor = floorCents.reduce((sum, c) => sum + c, 0);
  const leftoverCents = totalCents - distributedFloor;

  // Rank indices by remainder descending; on a tie, the earlier original
  // index wins, keeping the output deterministic regardless of engine
  // sort-stability guarantees.
  const order = splits
    .map((_, i) => i)
    .sort((a, b) => remainders[b] - remainders[a] || a - b);

  const bumped = new Set(order.slice(0, leftoverCents));

  return splits.map((s, i) => ({
    userId: s.userId,
    amount: (floorCents[i] + (bumped.has(i) ? 1 : 0)) / 100,
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
 * Calculate COLLECTIVE splits — each participant owes their item amount
 * plus an equal share of the shared costs.
 *
 * The last participant absorbs any rounding remainder to ensure
 * the total of all splits equals `totalAmount` exactly.
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

  const participantCount = participantIds.length;
  const sharedPerPerson = Math.round((sharedCosts / participantCount) * 100) / 100;
  const distributedShared = sharedPerPerson * (participantCount - 1);
  const lastShared = Math.round((sharedCosts - distributedShared) * 100) / 100;

  // Build a map of userId -> item amount for quick lookup
  const itemMap = new Map(items.map((item) => [item.userId, item.amount]));

  return participantIds.map((userId, i) => {
    const itemAmount = itemMap.get(userId) || 0;
    const share = i < participantIds.length - 1 ? sharedPerPerson : lastShared;
    return {
      userId,
      amount: Math.round((itemAmount + share) * 100) / 100,
    };
  });
}
