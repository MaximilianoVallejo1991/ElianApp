import { vi, describe, it, expect, beforeEach } from 'vitest';

// Vitest auto-mock convention: `src/lib/__mocks__/prisma.js` is substituted
// in for every import of `../../lib/prisma.js` below.
vi.mock('../../lib/prisma.js');

import prisma from '../../lib/prisma.js';
import {
  reportItem,
  updateItem,
  deleteItem,
  recomputeAndPersist,
  getItemStatus,
} from '../item-reporting.service.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('reportItem — participant guard (Bug 3, Fix B)', () => {
  const expenseId = 'expense-1';

  it('allows a listed participant to report their own item', async () => {
    prisma.expense.findUnique.mockResolvedValue({
      id: expenseId,
      splitType: 'COLLECTIVE',
      deletedAt: null,
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
      deletedAt: null,
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
      deletedAt: null,
      isLocked: true,
      participantIds: ['user-1', 'user-2'],
    });

    await expect(reportItem(expenseId, 'intruder', 40, 'lunch')).rejects.toMatchObject({
      code: 'NOT_PARTICIPANT',
      status: 403,
    });
    expect(prisma.expenseItem.upsert).not.toHaveBeenCalled();
  });

  it('rejects with EXPENSE_NOT_FOUND when the expense is soft-deleted', async () => {
    prisma.expense.findUnique.mockResolvedValue({
      id: expenseId,
      splitType: 'COLLECTIVE',
      deletedAt: new Date(),
      isLocked: false,
      participantIds: ['user-1'],
    });

    await expect(reportItem(expenseId, 'user-1', 40, 'lunch')).rejects.toMatchObject({
      code: 'EXPENSE_NOT_FOUND',
      status: 404,
    });
    expect(prisma.expenseItem.upsert).not.toHaveBeenCalled();
  });
});

describe('updateItem — deletedAt and orphan-participant guards (items 2/3)', () => {
  const itemId = 'item-1';
  const userId = 'user-1';

  it('rejects with EXPENSE_NOT_FOUND when the expense is soft-deleted', async () => {
    prisma.expenseItem.findUnique.mockResolvedValue({
      id: itemId,
      userId,
      expenseId: 'expense-1',
      expense: {
        deletedAt: new Date(),
        participantIds: [userId],
        isLocked: false,
        splitType: 'COLLECTIVE',
      },
    });

    await expect(updateItem(itemId, userId, 50)).rejects.toMatchObject({
      code: 'EXPENSE_NOT_FOUND',
      status: 404,
    });
    expect(prisma.expenseItem.update).not.toHaveBeenCalled();
  });

  it('rejects with NOT_PARTICIPANT once the owner is removed from participantIds, even when the expense is also locked', async () => {
    prisma.expenseItem.findUnique.mockResolvedValue({
      id: itemId,
      userId,
      expenseId: 'expense-1',
      expense: {
        deletedAt: null,
        participantIds: ['other-user'],
        isLocked: true,
        splitType: 'COLLECTIVE',
      },
    });

    await expect(updateItem(itemId, userId, 50)).rejects.toMatchObject({
      code: 'NOT_PARTICIPANT',
      status: 403,
    });
    expect(prisma.expenseItem.update).not.toHaveBeenCalled();
  });
});

describe('deleteItem — deletedAt and orphan-participant guards (items 2/3)', () => {
  const itemId = 'item-1';
  const userId = 'user-1';

  it('rejects with EXPENSE_NOT_FOUND when the expense is soft-deleted', async () => {
    prisma.expenseItem.findUnique.mockResolvedValue({
      id: itemId,
      userId,
      expenseId: 'expense-1',
      expense: {
        deletedAt: new Date(),
        participantIds: [userId],
        isLocked: false,
        splitType: 'COLLECTIVE',
      },
    });

    await expect(deleteItem(itemId, userId)).rejects.toMatchObject({
      code: 'EXPENSE_NOT_FOUND',
      status: 404,
    });
    expect(prisma.expenseItem.delete).not.toHaveBeenCalled();
  });

  it('rejects with NOT_PARTICIPANT once the owner is removed from participantIds, even when the expense is also locked', async () => {
    prisma.expenseItem.findUnique.mockResolvedValue({
      id: itemId,
      userId,
      expenseId: 'expense-1',
      expense: {
        deletedAt: null,
        participantIds: ['other-user'],
        isLocked: true,
        splitType: 'COLLECTIVE',
      },
    });

    await expect(deleteItem(itemId, userId)).rejects.toMatchObject({
      code: 'NOT_PARTICIPANT',
      status: 403,
    });
    expect(prisma.expenseItem.delete).not.toHaveBeenCalled();
  });
});

describe('getItemStatus — deletedAt guard (item 2)', () => {
  it('rejects with EXPENSE_NOT_FOUND when the expense is soft-deleted', async () => {
    prisma.expense.findUnique.mockResolvedValue({
      id: 'expense-1',
      deletedAt: new Date(),
      items: [],
    });

    await expect(getItemStatus('expense-1')).rejects.toMatchObject({
      code: 'EXPENSE_NOT_FOUND',
      status: 404,
    });
  });
});

describe('recomputeAndPersist — deletedAt guard and orphan-item sum fix (items 2/3, ADR-10)', () => {
  it('is inert — no status change, no mutation — when the expense is soft-deleted', async () => {
    prisma.expense.findUnique.mockResolvedValue({
      id: 'expense-1',
      deletedAt: new Date(),
      splitType: 'COLLECTIVE',
      items: [],
    });

    const result = await recomputeAndPersist('expense-1');

    expect(result).toBeNull();
    expect(prisma.expense.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('excludes an orphaned item (no longer in participantIds) from itemsSum, landing on MISMATCH instead of a falsely COMPLETED status with under-summed splits', async () => {
    // Repro from the discovery: total 150, participantIds [A,B], items
    // A=50 B=50, orphan D=50. Counting D would wrongly sum to 150 -> COMPLETED,
    // while generateSplits (via calculateCollectiveSplits) would still drop D,
    // persisting splits that sum to only 100.
    prisma.expense.findUnique.mockResolvedValue({
      id: 'expense-1',
      deletedAt: null,
      splitType: 'COLLECTIVE',
      amount: 150,
      sharedCosts: 0,
      participantIds: ['A', 'B'],
      items: [
        { userId: 'A', amount: 50 },
        { userId: 'B', amount: 50 },
        { userId: 'D', amount: 50 },
      ],
    });

    const result = await recomputeAndPersist('expense-1');

    expect(result).toBe('MISMATCH');
    expect(prisma.expenseSplit.createMany).not.toHaveBeenCalled();
    expect(prisma.expense.update).toHaveBeenCalledWith({
      where: { id: 'expense-1' },
      data: { status: 'MISMATCH', isLocked: false },
    });
  });
});
