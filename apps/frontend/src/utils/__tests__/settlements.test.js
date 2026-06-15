import { describe, it, expect } from 'vitest';
import { computeSettlements } from '../settlements.js';

describe('computeSettlements', () => {
  it('computes optimal settlement for 3 users (maxi, lean, ale)', () => {
    const balances = [
      { userId: 'maxi', user: { id: 'maxi', nickName: 'maxi', email: 'maxi@test.com' }, netBalance: 44666.67 },
      { userId: 'ale', user: { id: 'ale', nickName: 'ale', email: 'ale@test.com' }, netBalance: -41333.33 },
      { userId: 'lean', user: { id: 'lean', nickName: 'lean', email: 'lean@test.com' }, netBalance: -3333.34 },
    ];

    const settlements = computeSettlements(balances);

    // Expected: ale pays maxi 41333.33, lean pays maxi 3333.34
    expect(settlements).toHaveLength(2);

    const aleToMaxi = settlements.find(
      (s) => s.from.userId === 'ale' && s.to.userId === 'maxi'
    );
    expect(aleToMaxi).toBeDefined();
    expect(aleToMaxi.amount).toBe(41333.33);

    const leanToMaxi = settlements.find(
      (s) => s.from.userId === 'lean' && s.to.userId === 'maxi'
    );
    expect(leanToMaxi).toBeDefined();
    expect(leanToMaxi.amount).toBe(3333.34);
  });

  it('returns empty array when all balances are zero', () => {
    const balances = [
      { userId: 'a', user: { id: 'a', nickName: 'A' }, netBalance: 0 },
      { userId: 'b', user: { id: 'b', nickName: 'B' }, netBalance: 0 },
    ];

    const settlements = computeSettlements(balances);
    expect(settlements).toHaveLength(0);
  });

  it('handles two users owing each other', () => {
    const balances = [
      { userId: 'a', user: { id: 'a', nickName: 'A' }, netBalance: 50 },
      { userId: 'b', user: { id: 'b', nickName: 'B' }, netBalance: -50 },
    ];

    const settlements = computeSettlements(balances);

    expect(settlements).toHaveLength(1);
    expect(settlements[0].from.userId).toBe('b');
    expect(settlements[0].to.userId).toBe('a');
    expect(settlements[0].amount).toBe(50);
  });

  it('handles partial payments (debtor pays multiple creditors)', () => {
    const balances = [
      { userId: 'a', user: { id: 'a', nickName: 'A' }, netBalance: 80 },
      { userId: 'b', user: { id: 'b', nickName: 'B' }, netBalance: -30 },
      { userId: 'c', user: { id: 'c', nickName: 'C' }, netBalance: -50 },
    ];

    const settlements = computeSettlements(balances);

    // B pays A 30, C pays A 50 = 80 total to A
    expect(settlements).toHaveLength(2);
    const totalToA = settlements
      .filter((s) => s.to.userId === 'a')
      .reduce((sum, s) => sum + s.amount, 0);
    expect(totalToA).toBe(80);
  });

  it('rounds to 2 decimal places', () => {
    const balances = [
      { userId: 'a', user: { id: 'a', nickName: 'A' }, netBalance: 33.33 },
      { userId: 'b', user: { id: 'b', nickName: 'B' }, netBalance: -33.33 },
    ];

    const settlements = computeSettlements(balances);

    expect(settlements).toHaveLength(1);
    expect(settlements[0].amount).toBe(33.33);
  });
});