import { describe, it, expect } from 'vitest';
import {
  calculateEqualSplits,
  calculatePercentageSplits,
  computeCollectiveStatus,
  calculateCollectiveSplits,
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

describe('computeCollectiveStatus', () => {
  it('returns COMPLETED when items + shared equals total', () => {
    expect(computeCollectiveStatus(30, 20, 50)).toBe('COMPLETED');
  });

  it('returns MISMATCH when items + shared does not equal total', () => {
    expect(computeCollectiveStatus(30, 20, 60)).toBe('MISMATCH');
  });

  it('handles near-equality within epsilon', () => {
    // 30.001 + 19.999 = 50, 50 - 50 = 0, within 0.01 epsilon
    expect(computeCollectiveStatus(30.001, 19.999, 50)).toBe('COMPLETED');
  });

  it('detects mismatch outside epsilon', () => {
    // 30 + 20 = 50, 50 - 50.02 = -0.02, outside 0.01 epsilon
    expect(computeCollectiveStatus(30, 20, 50.02)).toBe('MISMATCH');
  });

  it('handles zero values', () => {
    expect(computeCollectiveStatus(0, 0, 0)).toBe('COMPLETED');
  });
});

describe('calculateCollectiveSplits', () => {
  it('returns empty array when no participants', () => {
    expect(calculateCollectiveSplits([], 10, [])).toEqual([]);
    expect(calculateCollectiveSplits([], 10, null)).toEqual([]);
  });

  it('distributes shared costs equally among participants', () => {
    const result = calculateCollectiveSplits(
      [{ userId: 'u1', amount: 10 }, { userId: 'u2', amount: 20 }],
      30,
      ['u1', 'u2'],
    );
    // u1: 10 (item) + 15 (shared) = 25
    // u2: 20 (item) + 15 (shared) = 35
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ userId: 'u1', amount: 25 });
    expect(result[1]).toEqual({ userId: 'u2', amount: 35 });
  });

  it('last participant absorbs shared cost rounding remainder', () => {
    const result = calculateCollectiveSplits(
      [
        { userId: 'u1', amount: 10 },
        { userId: 'u2', amount: 10 },
        { userId: 'u3', amount: 10 },
      ],
      100, // shared costs to split among 3
      ['u1', 'u2', 'u3'],
    );
    // shared per person: 100/3 = 33.33, first two get 33.33, last gets 33.34
    expect(result[0].amount).toBe(43.33);  // 10 + 33.33
    expect(result[1].amount).toBe(43.33);  // 10 + 33.33
    expect(result[2].amount).toBe(43.34);  // 10 + 33.34
    const total = result.reduce((sum, s) => sum + s.amount, 0);
    expect(total).toBe(130);
  });

  it('assigns zero for participants not in items map', () => {
    const result = calculateCollectiveSplits(
      [{ userId: 'u1', amount: 15 }],
      50,
      ['u1', 'u2'],
    );
    // u1: 15 + 25 = 40, u2: 0 + 25 = 25
    expect(result[0]).toEqual({ userId: 'u1', amount: 40 });
    expect(result[1]).toEqual({ userId: 'u2', amount: 25 });
  });

  it('handles zero shared costs', () => {
    const result = calculateCollectiveSplits(
      [{ userId: 'u1', amount: 50 }, { userId: 'u2', amount: 50 }],
      0,
      ['u1', 'u2'],
    );
    expect(result[0].amount).toBe(50);
    expect(result[1].amount).toBe(50);
  });
});
