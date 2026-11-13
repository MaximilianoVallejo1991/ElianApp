import { describe, it, expect } from 'vitest';
import { canEditExpense, canDeleteExpense, canUnlockExpense } from '../expensePermissions.js';

const group = { ownerId: 'owner-1' };

describe('canEditExpense', () => {
  it('allows a payer who is neither creator nor group owner (payer OR creator OR owner)', () => {
    const expense = { payerId: 'user-2', createdById: 'user-1' };
    expect(canEditExpense(expense, group, 'user-2')).toBe(true);
  });
});

describe('canDeleteExpense', () => {
  it('rejects a payer who is not the creator and not the group owner', () => {
    const expense = { payerId: 'user-2', createdById: 'user-1' };
    expect(canDeleteExpense(expense, group, 'user-2')).toBe(false);
  });

  it('allows the creator', () => {
    const expense = { payerId: 'user-2', createdById: 'user-1' };
    expect(canDeleteExpense(expense, group, 'user-1')).toBe(true);
  });
});

describe('canUnlockExpense', () => {
  it('allows the creator when the expense is COLLECTIVE and COMPLETED', () => {
    const expense = { createdById: 'user-1', splitType: 'COLLECTIVE', status: 'COMPLETED' };
    expect(canUnlockExpense(expense, group, 'user-1')).toBe(true);
  });

  it('rejects the creator when the expense is still PENDING', () => {
    const expense = { createdById: 'user-1', splitType: 'COLLECTIVE', status: 'PENDING' };
    expect(canUnlockExpense(expense, group, 'user-1')).toBe(false);
  });
});
