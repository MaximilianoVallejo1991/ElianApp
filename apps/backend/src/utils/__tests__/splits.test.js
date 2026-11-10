import { describe, it, expect } from 'vitest';
import {
  calculateEqualSplits,
  calculatePercentageSplits,
} from '../splits.js';
import { AppError } from '../errors.js';

describe('calculateEqualSplits', () => {
  it('returns empty array when no members provided', () => {
    expect(calculateEqualSplits(100, [])).toEqual([]);
    expect(calculateEqualSplits(100, null)).toEqual([]);
  });

  it('returns correct splits for a single member', () => {
    const result = calculateEqualSplits(50, ['u1']);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ userId: 'u1', amount: 50 });
  });

  it('splits evenly among two members', () => {
    const result = calculateEqualSplits(100, ['u1', 'u2']);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ userId: 'u1', amount: 50 });
    expect(result[1]).toEqual({ userId: 'u2', amount: 50 });
  });

  it('handles rounding — last member absorbs the remainder', () => {
    const result = calculateEqualSplits(100, ['u1', 'u2', 'u3']);
    // 100 / 3 = 33.33..., so first two get 33.33, last gets 33.34
    expect(result).toHaveLength(3);
    expect(result[0].amount).toBe(33.33);
    expect(result[1].amount).toBe(33.33);
    expect(result[2].amount).toBe(33.34);

    // The sum must equal the original total exactly
    const total = result.reduce((sum, s) => sum + s.amount, 0);
    expect(total).toBe(100);
  });

  it('handles zero total amount', () => {
    const result = calculateEqualSplits(0, ['u1', 'u2', 'u3']);
    expect(result).toHaveLength(3);
    result.forEach((s) => expect(s.amount).toBe(0));
  });

  it('handles fractional amounts with many members', () => {
    const result = calculateEqualSplits(1, ['u1', 'u2', 'u3', 'u4', 'u5']);
    // 1 / 5 = 0.2 each, no rounding issue
    expect(result).toHaveLength(5);
    expect(result[0].amount).toBe(0.2);
    expect(result[4].amount).toBe(0.2);
    const total = result.reduce((sum, s) => sum + s.amount, 0);
    expect(total).toBe(1);
  });
});

describe('calculatePercentageSplits', () => {
  it('calculates amounts from percentages', () => {
    const result = calculatePercentageSplits(200, [
      { userId: 'u1', percentage: 50 },
      { userId: 'u2', percentage: 50 },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ userId: 'u1', amount: 100, percentage: 50 });
    expect(result[1]).toEqual({ userId: 'u2', amount: 100, percentage: 50 });
  });

  it('handles fractional percentages and sums exactly to the total', () => {
    const result = calculatePercentageSplits(10, [
      { userId: 'u1', percentage: 33.33 },
      { userId: 'u2', percentage: 33.33 },
      { userId: 'u3', percentage: 33.34 },
    ]);
    expect(result).toHaveLength(3);
    expect(result[0].amount).toBe(3.33);
    expect(result[1].amount).toBe(3.33);
    expect(result[2].amount).toBe(3.34);

    // The sum must equal the original total exactly — naive per-share
    // rounding undershoots to 9.99 without remainder absorption.
    const total = result.reduce((sum, s) => sum + s.amount, 0);
    expect(total).toBe(10);
  });

  it('absorbs an over-shooting remainder across the splits', () => {
    const result = calculatePercentageSplits(10, [
      { userId: 'u1', percentage: 16.67 },
      { userId: 'u2', percentage: 16.67 },
      { userId: 'u3', percentage: 66.66 },
    ]);
    // naive per-share rounding overshoots to 10.01 without remainder absorption.
    // Compare the raw total directly — rounding here would mask a real
    // off-by-one-cent regression (e.g. 10.01 collapsing to 10).
    const total = result.reduce((sum, s) => sum + s.amount, 0);
    expect(total).toBe(10);
  });

  it('largest-remainder method never produces a negative amount with many small percentages', () => {
    // Reviewer-found regression: the old "last element absorbs the entire
    // remainder" algorithm can push the last participant's amount negative
    // when many small per-item roundings accumulate (49 participants at
    // ~2.0406% + 1 at 0.01%, splitting $1000 — the old algorithm produced
    // amount: -0.09 for the last participant instead of their true ~$0.10).
    const splits = [];
    for (let i = 0; i < 49; i++) {
      splits.push({ userId: `u${i}`, percentage: 2.0406 });
    }
    splits.push({ userId: 'u49', percentage: 0.01 });

    const result = calculatePercentageSplits(1000, splits);

    expect(result).toHaveLength(50);
    result.forEach((s) => {
      expect(s.amount).toBeGreaterThanOrEqual(0);
    });

    // Sum exactly in cents to avoid IEEE-754 float accumulation noise across
    // 50 additions (unrelated to correctness — summing the integer cents
    // avoids that noise while still catching any real off-by-one-cent bug).
    const totalCents = result.reduce((sum, s) => sum + Math.round(s.amount * 100), 0);
    expect(totalCents).toBe(100000);
  });

  it('returns the percentage in each split', () => {
    const result = calculatePercentageSplits(500, [
      { userId: 'u1', percentage: 100 },
    ]);
    expect(result[0].percentage).toBe(100);
  });

  it('handles zero amount', () => {
    const result = calculatePercentageSplits(0, [
      { userId: 'u1', percentage: 60 },
      { userId: 'u2', percentage: 40 },
    ]);
    result.forEach((s) => expect(s.amount).toBe(0));
  });

  it('rescales percentages within epsilon tolerance so cents still sum exactly to the total', () => {
    // Reviewer-found regression: percentages summing to 100.0066 (within the
    // 0.01 epsilon tolerance, so the sum guard passes) must NOT feed raw
    // percentages into the cents math — that would make the distributed cents
    // overshoot totalCents and corrupt leftoverCents (potentially negative or
    // larger than splits.length, which `order.slice(0, leftoverCents)` would
    // silently mis-handle). Normalizing to exactly 100 first fixes this.
    const result = calculatePercentageSplits(10000, [
      { userId: 'u1', percentage: 60.0033 },
      { userId: 'u2', percentage: 40.0033 },
    ]);
    expect(result).toHaveLength(2);
    const total = result.reduce((sum, s) => sum + s.amount, 0);
    expect(total).toBe(10000);
    // Original (non-normalized) percentages are still reported to callers.
    expect(result[0].percentage).toBe(60.0033);
    expect(result[1].percentage).toBe(40.0033);
  });

  it('throws AppError INVALID_SPLITS when a percentage is missing or NaN', () => {
    // Reviewer-found regression: Math.abs(NaN - 100) > epsilon is always
    // false, so a non-numeric percentage silently bypassed the sum guard
    // and produced amount: NaN in the output.
    expect(() =>
      calculatePercentageSplits(100, [
        { userId: 'u1', percentage: 60 },
        { userId: 'u2' }, // missing percentage -> NaN
      ]),
    ).toThrow(AppError);
    expect(() =>
      calculatePercentageSplits(100, [
        { userId: 'u1', percentage: 60 },
        { userId: 'u2', percentage: NaN },
      ]),
    ).toThrow('Split percentages must sum to 100');
  });

  it('throws AppError INVALID_SPLITS for an empty splits array when totalAmount > 0', () => {
    // Reviewer-found regression: the special-cased empty-array early return
    // bypassed the percentage-sum guard entirely, silently returning [] for
    // a real, non-zero expense amount instead of surfacing the error.
    expect(() => calculatePercentageSplits(100, [])).toThrow(AppError);
    expect(() => calculatePercentageSplits(100, [])).toThrow(
      'Split percentages must sum to 100',
    );
  });

  it('throws AppError INVALID_SPLITS when the percentages do not sum to 100', () => {
    expect(() =>
      calculatePercentageSplits(100, [{ userId: 'u1', percentage: 50 }]),
    ).toThrow(AppError);
    expect(() =>
      calculatePercentageSplits(100, [{ userId: 'u1', percentage: 50 }]),
    ).toThrow('Split percentages must sum to 100');
  });

  it('regression: a filtered subset with percentage well below 100 must reject, not silently bill the full amount', () => {
    // Reviewer-found regression: a valid 3-way split (u1 33.33, u2 33.33,
    // u3 33.34) filtered down to participantIds=['u3'] must not reach this
    // function and silently return amount: 100 for u3 (the entire expense
    // billed to one person instead of their 33.34% share).
    expect(() =>
      calculatePercentageSplits(100, [{ userId: 'u3', percentage: 33.34 }]),
    ).toThrow(AppError);
  });
});
