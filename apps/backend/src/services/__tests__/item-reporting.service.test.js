import { vi, describe, it, expect, beforeEach } from 'vitest';

// Vitest auto-mock convention: `src/lib/__mocks__/prisma.js` is substituted
// in for every import of `../../lib/prisma.js` below.
vi.mock('../../lib/prisma.js');

import prisma from '../../lib/prisma.js';
import { reportItem } from '../item-reporting.service.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('reportItem — participant guard (Bug 3, Fix B)', () => {
  const expenseId = 'expense-1';

  it('allows a listed participant to report their own item', async () => {
    prisma.expense.findUnique.mockResolvedValue({
      id: expenseId,
      splitType: 'COLLECTIVE',
      isLocked: false,
      participantIds: ['user-1', 'user-2'],
      amount: 100,
      sharedCosts: 0,
      items: [],
    });
    prisma.expenseItem.upsert.mockResolvedValue({
      id: 'item-1',
      expenseId,
      userId: 'user-1',
      amount: 40,
    });
    prisma.expense.update.mockResolvedValue({ id: expenseId, status: 'MISMATCH' });

    const result = await reportItem(expenseId, 'user-1', 40, 'lunch');

    expect(prisma.expenseItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { expenseId_userId: { expenseId, userId: 'user-1' } },
      }),
    );
    expect(result.item.id).toBe('item-1');
  });

  it('rejects a non-participant with NOT_PARTICIPANT and never calls the upsert', async () => {
    prisma.expense.findUnique.mockResolvedValue({
      id: expenseId,
      splitType: 'COLLECTIVE',
      isLocked: false,
      participantIds: ['user-1', 'user-2'],
    });

    await expect(reportItem(expenseId, 'intruder', 40, 'lunch')).rejects.toMatchObject({
      code: 'NOT_PARTICIPANT',
      status: 403,
    });
    expect(prisma.expenseItem.upsert).not.toHaveBeenCalled();
    expect(prisma.expense.update).not.toHaveBeenCalled();
  });

  it('rejects a non-participant with NOT_PARTICIPANT even when the expense is also locked (NOT_PARTICIPANT wins over EXPENSE_LOCKED)', async () => {
    prisma.expense.findUnique.mockResolvedValue({
      id: expenseId,
      splitType: 'COLLECTIVE',
      isLocked: true,
      participantIds: ['user-1', 'user-2'],
    });

    await expect(reportItem(expenseId, 'intruder', 40, 'lunch')).rejects.toMatchObject({
      code: 'NOT_PARTICIPANT',
      status: 403,
    });
    expect(prisma.expenseItem.upsert).not.toHaveBeenCalled();
  });
});
