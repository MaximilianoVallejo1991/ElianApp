import { vi, describe, it, expect, beforeEach } from 'vitest';

// Vitest auto-mock convention: `src/lib/__mocks__/prisma.js` is substituted
// in for every import of `../../lib/prisma.js` below. See that file for the
// shared mock shape (extended in PR 3 with expense.create/update and the
// expenseSplit model).
vi.mock('../../lib/prisma.js');

// Partial mock of the pure split-math module: only `calculatePercentageSplits`
// is wrapped in a `vi.fn()` (still delegating to the real implementation by
// default). This lets one test override it with `mockReturnValueOnce` to
// simulate "what if the pure function had a latent bug" — proving the
// service-layer defense-in-depth sum guard (Fix A) catches it independently
// of calculatePercentageSplits' own internal guard. Every other test in this
// file exercises the real split math untouched.
vi.mock('../../utils/splits.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    calculatePercentageSplits: vi.fn(actual.calculatePercentageSplits),
  };
});

import prisma from '../../lib/prisma.js';
import { calculatePercentageSplits } from '../../utils/splits.js';
import { createExpense, updateExpense } from '../expense.service.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createExpense — computeSplits re-validation (ADR-6, Fix A)', () => {
  const groupId = 'group-1';
  const userId = 'user-1';

  const baseGroup = { id: groupId, balanceMode: 'DYNAMIC', status: 'ACTIVE', ownerId: 'owner-1' };
  const activeMembership = { status: 'ACTIVE', isFrozen: false };

  it('rejects a PERCENTAGE expense when participantIds filters the splits below 100% (existing calculatePercentageSplits guard, PR 1)', async () => {
    prisma.group.findUnique.mockResolvedValue(baseGroup);
    prisma.groupMember.findUnique.mockResolvedValue(activeMembership);
    prisma.groupMember.findMany.mockResolvedValue([
      { userId: 'u1' },
      { userId: 'u2' },
      { userId: 'u3' },
      { userId: 'u4' },
    ]);

    const data = {
      amount: 1000,
      description: 'Dinner',
      category: 'FOOD',
      payerId: userId,
      splitType: 'PERCENTAGE',
      splits: [
        { userId: 'u1', percentage: 25 },
        { userId: 'u2', percentage: 25 },
        { userId: 'u3', percentage: 25 },
        { userId: 'u4', percentage: 25 },
      ],
      participantIds: ['u1', 'u2', 'u3'],
    };

    await expect(createExpense(groupId, data, userId)).rejects.toMatchObject({
      code: 'INVALID_SPLITS',
      status: 400,
    });
    expect(prisma.expense.create).not.toHaveBeenCalled();
  });

  it('rejects via the generic amount-sum guard when calculatePercentageSplits returns a mismatched sum (defense-in-depth, Fix A)', async () => {
    prisma.group.findUnique.mockResolvedValue(baseGroup);
    prisma.groupMember.findUnique.mockResolvedValue(activeMembership);

    calculatePercentageSplits.mockReturnValueOnce([
      { userId: 'u1', amount: 10, percentage: 50 },
      { userId: 'u2', amount: 10, percentage: 50 },
    ]);

    const data = {
      amount: 100,
      description: 'Dinner',
      category: 'FOOD',
      payerId: userId,
      splitType: 'PERCENTAGE',
      splits: [
        { userId: 'u1', percentage: 50 },
        { userId: 'u2', percentage: 50 },
      ],
    };

    await expect(createExpense(groupId, data, userId)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 400,
    });
    expect(prisma.expense.create).not.toHaveBeenCalled();
  });

  it('still creates a valid PERCENTAGE expense when the (unfiltered) splits correctly sum to the amount', async () => {
    prisma.group.findUnique.mockResolvedValue(baseGroup);
    prisma.groupMember.findUnique.mockResolvedValue(activeMembership);
    prisma.expense.create.mockResolvedValue({ id: 'expense-1' });

    const data = {
      amount: 100,
      description: 'Dinner',
      category: 'FOOD',
      payerId: userId,
      splitType: 'PERCENTAGE',
      splits: [
        { userId: 'u1', percentage: 50 },
        { userId: 'u2', percentage: 50 },
      ],
    };

    await createExpense(groupId, data, userId);

    expect(prisma.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          splits: {
            create: [
              { userId: 'u1', amount: 50, percentage: 50 },
              { userId: 'u2', amount: 50, percentage: 50 },
            ],
          },
        }),
      }),
    );
  });
});

describe('updateExpense — partial-update splits fallback (Fix A companion)', () => {
  const expenseId = 'expense-1';
  const groupId = 'group-1';
  const userId = 'payer-1';

  const baseExisting = {
    id: expenseId,
    groupId,
    payerId: userId,
    createdById: userId,
    deletedAt: null,
  };

  it("falls back to the expense's existing persisted percentage splits when data.splits is omitted, re-deriving them against the new amount", async () => {
    prisma.expense.findUnique.mockResolvedValue({
      ...baseExisting,
      amount: 100,
      splitType: 'PERCENTAGE',
    });
    prisma.group.findUnique.mockResolvedValue({ ownerId: 'owner-1' });
    prisma.expenseSplit.findMany.mockResolvedValue([
      { userId: 'u1', amount: 60, percentage: 60 },
      { userId: 'u2', amount: 40, percentage: 40 },
    ]);
    prisma.expenseSplit.deleteMany.mockResolvedValue({ count: 2 });
    prisma.expense.update.mockResolvedValue({ id: expenseId });

    await updateExpense(expenseId, { amount: 200 }, userId);

    expect(prisma.expenseSplit.findMany).toHaveBeenCalledWith({ where: { expenseId } });
    expect(prisma.expense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: expenseId },
        data: expect.objectContaining({
          amount: 200,
          splits: {
            create: [
              { userId: 'u1', amount: 120, percentage: 60 },
              { userId: 'u2', amount: 80, percentage: 40 },
            ],
          },
        }),
      }),
    );
  });

  it('does not fall back when data.splits is explicitly provided alongside a new amount', async () => {
    prisma.expense.findUnique.mockResolvedValue({
      ...baseExisting,
      amount: 100,
      splitType: 'PERCENTAGE',
    });
    prisma.group.findUnique.mockResolvedValue({ ownerId: 'owner-1' });
    prisma.expenseSplit.deleteMany.mockResolvedValue({ count: 0 });
    prisma.expense.update.mockResolvedValue({ id: expenseId });

    await updateExpense(
      expenseId,
      { amount: 50, splits: [{ userId: 'u9', percentage: 100 }] },
      userId,
    );

    expect(prisma.expenseSplit.findMany).not.toHaveBeenCalled();
    expect(prisma.expense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          splits: { create: [{ userId: 'u9', amount: 50, percentage: 100 }] },
        }),
      }),
    );
  });

  it('an amount-only update on an EQUAL expense still re-derives from active members (fallback split content is ignored for EQUAL)', async () => {
    prisma.expense.findUnique.mockResolvedValue({
      ...baseExisting,
      amount: 100,
      splitType: 'EQUAL',
    });
    prisma.group.findUnique.mockResolvedValue({ ownerId: 'owner-1' });
    prisma.expenseSplit.findMany.mockResolvedValue([
      { userId: 'u1', amount: 50, percentage: null },
      { userId: 'u2', amount: 50, percentage: null },
    ]);
    prisma.groupMember.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);
    prisma.expenseSplit.deleteMany.mockResolvedValue({ count: 2 });
    prisma.expense.update.mockResolvedValue({ id: expenseId });

    await updateExpense(expenseId, { amount: 300 }, userId);

    expect(prisma.groupMember.findMany).toHaveBeenCalledWith({
      where: { groupId, status: 'ACTIVE' },
      select: { userId: true },
    });
    expect(prisma.expense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          splits: {
            create: [
              { userId: 'u1', amount: 150, percentage: null },
              { userId: 'u2', amount: 150, percentage: null },
            ],
          },
        }),
      }),
    );
  });
});
