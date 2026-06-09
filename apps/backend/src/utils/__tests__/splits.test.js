import { describe, it, expect } from 'vitest';
import {
  calculateEqualSplits,
  calculatePercentageSplits,
} from '../splits.js';

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

  it('handles fractional percentages', () => {
    const result = calculatePercentageSplits(100, [
      { userId: 'u1', percentage: 33.33 },
      { userId: 'u2', percentage: 33.33 },
      { userId: 'u3', percentage: 33.34 },
    ]);
    expect(result).toHaveLength(3);
    expect(result[0].amount).toBe(33.33);
    expect(result[1].amount).toBe(33.33);
    expect(result[2].amount).toBe(33.34);
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

  it('handles empty splits array', () => {
    const result = calculatePercentageSplits(100, []);
    expect(result).toEqual([]);
  });
});
