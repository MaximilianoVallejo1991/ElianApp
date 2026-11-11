import { vi, describe, it, expect, beforeEach } from 'vitest';

// Vitest auto-mock convention: `src/lib/__mocks__/prisma.js` is substituted
// in for every import of `../../lib/prisma.js` below. See that file for the
// shared mock shape — this harness is reused by later service test files.
vi.mock('../../lib/prisma.js');

import prisma from '../../lib/prisma.js';
import {
  startClosure,
  completeClosure,
  partialClosure,
  finalClosure,
} from '../closure.service.js';
import { calculateGroupBalances } from '../balance.service.js';
import {
  listPeriods,
  getPeriodDetails,
  getPeriodBalances,
  getPeriodExpenses,
  getPeriodPayments,
} from '../period.service.js';
import { getGroupById } from '../group.service.js';
import { acceptPayment, rejectPayment } from '../payment.service.js';
import { AppError } from '../../utils/errors.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('soft-delete filters — Prisma mock harness', () => {
  it('provides a mocked prisma client with the expected model stubs', () => {
    expect(typeof prisma.payment.count).toBe('function');
    expect(typeof prisma.expense.findMany).toBe('function');
  });
});

describe('closure.service.js — soft-deleted payments excluded', () => {
  const groupId = 'group-1';
  const ownerId = 'owner-1';
  const periodId = 'period-1';

  it('startClosure excludes soft-deleted PENDING payments from the blocking count', async () => {
    prisma.group.findUnique.mockResolvedValue({
      id: groupId,
      ownerId,
      balanceMode: 'STATIC',
      status: 'ACTIVE',
    });
    prisma.period.findFirst.mockResolvedValue({ id: periodId, status: 'OPEN' });
    prisma.payment.count.mockResolvedValue(0);
    prisma.expense.count.mockResolvedValue(1);
    prisma.period.updateMany.mockResolvedValue({ count: 1 });
    prisma.period.findUnique.mockResolvedValue({ id: periodId, status: 'CLOSING' });

    await startClosure(groupId, ownerId);

    expect(prisma.payment.count).toHaveBeenCalledWith({
      where: { periodId, status: 'PENDING', deletedAt: null },
    });
  });

  it('completeClosure excludes soft-deleted PENDING payments and soft-deleted ACCEPTED payments from the zero-balance check', async () => {
    prisma.group.findUnique.mockResolvedValue({
      id: groupId,
      ownerId,
      balanceMode: 'STATIC',
      status: 'ACTIVE',
    });
    prisma.period.findFirst.mockResolvedValue({ id: periodId, status: 'CLOSING' });
    prisma.payment.count.mockResolvedValue(0);
    prisma.groupMember.findMany.mockResolvedValue([]);
    prisma.expense.findMany.mockResolvedValue([]);
    prisma.payment.findMany.mockResolvedValue([]);
    prisma.period.updateMany.mockResolvedValue({ count: 1 });
    prisma.period.findUnique.mockResolvedValue({ id: periodId, status: 'CLOSED' });

    await completeClosure(groupId, ownerId);

    expect(prisma.payment.count).toHaveBeenCalledWith({
      where: { periodId, status: 'PENDING', deletedAt: null },
    });
    expect(prisma.payment.findMany).toHaveBeenCalledWith({
      where: { periodId, status: 'ACCEPTED', deletedAt: null },
      select: { fromUserId: true, toUserId: true, amount: true },
    });
  });

  it('partialClosure excludes soft-deleted PENDING payments from the blocking count', async () => {
    prisma.group.findUnique.mockResolvedValue({
      id: groupId,
      ownerId,
      balanceMode: 'STATIC',
      status: 'ACTIVE',
    });
    prisma.period.findFirst.mockResolvedValue({ id: periodId, status: 'CLOSING' });
    prisma.payment.count.mockResolvedValue(0);
    prisma.groupMember.findMany.mockResolvedValue([]);
    prisma.expense.findMany.mockResolvedValue([]);
    prisma.payment.findMany.mockResolvedValue([]);
    prisma.period.updateMany.mockResolvedValue({ count: 1 });
    prisma.period.create.mockResolvedValue({ id: 'period-2', status: 'OPEN' });

    await partialClosure(groupId, ownerId);

    expect(prisma.payment.count).toHaveBeenCalledWith({
      where: { periodId, status: 'PENDING', deletedAt: null },
    });
  });

  it('finalClosure excludes soft-deleted PENDING payments from the blocking count', async () => {
    prisma.group.findUnique.mockResolvedValue({
      id: groupId,
      ownerId,
      balanceMode: 'STATIC',
      status: 'ACTIVE',
    });
    prisma.period.findFirst.mockResolvedValue({ id: periodId, status: 'CLOSING' });
    prisma.payment.count.mockResolvedValue(0);
    prisma.groupMember.findMany.mockResolvedValue([]);
    prisma.expense.findMany.mockResolvedValue([]);
    prisma.payment.findMany.mockResolvedValue([]);
    prisma.period.updateMany.mockResolvedValue({ count: 1 });
    prisma.group.update.mockResolvedValue({ id: groupId, status: 'CLOSED' });
    prisma.period.findUnique.mockResolvedValue({ id: periodId, status: 'FINAL' });

    await finalClosure(groupId, ownerId);

    expect(prisma.payment.count).toHaveBeenCalledWith({
      where: { periodId, status: 'PENDING', deletedAt: null },
    });
  });
});

describe('balance.service.js — soft-deleted payments excluded from paymentWhere', () => {
  const groupId = 'group-1';
  const userId = 'user-1';

  it('excludes soft-deleted ACCEPTED payments for a DYNAMIC group (no periodId)', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: groupId, balanceMode: 'DYNAMIC' });
    prisma.groupMember.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    prisma.groupMember.findMany.mockResolvedValue([]);
    prisma.expense.findMany.mockResolvedValue([]);
    prisma.payment.findMany.mockResolvedValue([]);

    await calculateGroupBalances(groupId, userId);

    expect(prisma.payment.findMany).toHaveBeenCalledWith({
      where: { groupId, status: 'ACCEPTED', deletedAt: null },
      select: { fromUserId: true, toUserId: true, amount: true },
    });
  });

  it('excludes soft-deleted ACCEPTED payments for a STATIC group with a periodId', async () => {
    const periodId = 'period-1';
    prisma.group.findUnique.mockResolvedValue({ id: groupId, balanceMode: 'STATIC' });
    prisma.groupMember.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    prisma.period.findUnique.mockResolvedValue({ id: periodId, status: 'OPEN' });
    prisma.groupMember.findMany.mockResolvedValue([]);
    prisma.expense.findMany.mockResolvedValue([]);
    prisma.payment.findMany.mockResolvedValue([]);

    await calculateGroupBalances(groupId, userId, periodId);

    expect(prisma.payment.findMany).toHaveBeenCalledWith({
      where: { groupId, status: 'ACCEPTED', deletedAt: null, periodId },
      select: { fromUserId: true, toUserId: true, amount: true },
    });
  });
});

describe('period.service.js — soft-deleted expenses and payments excluded', () => {
  const groupId = 'group-1';
  const periodId = 'period-1';
  const userId = 'user-1';

  it('listPeriods filters _count relations and excludes soft-deleted payments from settlement counts', async () => {
    prisma.groupMember.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    prisma.period.findMany.mockResolvedValue([
      {
        id: periodId,
        status: 'CLOSED',
        isCurrent: false,
        startedAt: null,
        closedAt: new Date(),
        createdAt: new Date(),
        _count: { expenses: 2, payments: 1 },
      },
    ]);
    prisma.payment.count.mockResolvedValue(0);

    await listPeriods(groupId, userId);

    expect(prisma.period.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          _count: {
            select: {
              expenses: { where: { deletedAt: null } },
              payments: { where: { deletedAt: null } },
            },
          },
        }),
      }),
    );

    for (const call of prisma.payment.count.mock.calls) {
      expect(call[0].where.periodId).toBe(periodId);
      expect(call[0].where.deletedAt).toBeNull();
    }
    // Only pendingCount is computed — rejectedCount was dead code (computed,
    // never read) and was removed.
    expect(prisma.payment.count).toHaveBeenCalledTimes(1);
    expect(prisma.payment.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'PENDING' }) }),
    );
  });

  it('getPeriodDetails filters _count relations to exclude soft-deleted records', async () => {
    prisma.groupMember.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    prisma.period.findFirst.mockResolvedValue({
      id: periodId,
      groupId,
      _count: { expenses: 0, payments: 0 },
    });

    await getPeriodDetails(periodId, groupId, userId);

    expect(prisma.period.findFirst).toHaveBeenCalledWith({
      where: { id: periodId, groupId },
      include: {
        _count: {
          select: {
            expenses: { where: { deletedAt: null } },
            payments: { where: { deletedAt: null } },
          },
        },
      },
    });
  });

  it('getPeriodBalances excludes soft-deleted ACCEPTED payments', async () => {
    prisma.groupMember.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    prisma.period.findFirst.mockResolvedValue({ id: periodId, groupId, status: 'OPEN' });
    prisma.groupMember.findMany.mockResolvedValue([]);
    prisma.expense.findMany.mockResolvedValue([]);
    prisma.payment.findMany.mockResolvedValue([]);

    await getPeriodBalances(periodId, groupId, userId);

    expect(prisma.payment.findMany).toHaveBeenCalledWith({
      where: { periodId, status: 'ACCEPTED', deletedAt: null },
      select: { fromUserId: true, toUserId: true, amount: true },
    });
  });

  it('getPeriodExpenses excludes soft-deleted expenses', async () => {
    prisma.groupMember.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    prisma.period.findFirst.mockResolvedValue({ id: periodId, groupId });
    prisma.expense.findMany.mockResolvedValue([]);

    await getPeriodExpenses(periodId, groupId, userId);

    expect(prisma.expense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { periodId, deletedAt: null } }),
    );
  });

  it('getPeriodPayments excludes soft-deleted payments', async () => {
    prisma.groupMember.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    prisma.period.findFirst.mockResolvedValue({ id: periodId, groupId });
    prisma.payment.findMany.mockResolvedValue([]);

    await getPeriodPayments(periodId, groupId, userId);

    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { periodId, deletedAt: null } }),
    );
  });
});

describe('group.service.js — soft-deleted expenses and payments excluded from group detail', () => {
  const groupId = 'group-1';

  it('getGroupById filters the expenses and payments includes on deletedAt: null', async () => {
    prisma.group.findUnique.mockResolvedValue({
      id: groupId,
      name: 'Trip',
      owner: { id: 'u1', email: 'u1@test.dev', nickName: 'u1' },
      members: [],
      expenses: [],
      payments: [],
    });

    await getGroupById(groupId);

    const callArg = prisma.group.findUnique.mock.calls[0][0];
    expect(callArg.include.expenses.where).toEqual({ deletedAt: null });
    expect(callArg.include.payments.where).toEqual({ deletedAt: null });
  });
});

describe('payment.service.js — acceptPayment/rejectPayment reject soft-deleted payments', () => {
  const paymentId = 'payment-1';
  const receiverId = 'user-2';

  function softDeletedPayment() {
    return {
      id: paymentId,
      toUserId: receiverId,
      status: 'PENDING',
      deletedAt: new Date('2026-01-01T00:00:00.000Z'),
      group: { id: 'group-1', ownerId: 'user-1', balanceMode: 'DYNAMIC', status: 'ACTIVE' },
    };
  }

  function activePayment() {
    return {
      id: paymentId,
      toUserId: receiverId,
      status: 'PENDING',
      deletedAt: null,
      group: { id: 'group-1', ownerId: 'user-1', balanceMode: 'DYNAMIC', status: 'ACTIVE' },
    };
  }

  it('acceptPayment throws PAYMENT_NOT_FOUND for a soft-deleted payment and never calls updateMany', async () => {
    prisma.payment.findUnique.mockResolvedValue(softDeletedPayment());

    await expect(acceptPayment(paymentId, receiverId)).rejects.toMatchObject({
      code: 'PAYMENT_NOT_FOUND',
      status: 404,
    });
    expect(prisma.payment.updateMany).not.toHaveBeenCalled();
  });

  it('acceptPayment still accepts a non-deleted PENDING payment (triangulation)', async () => {
    // Called twice: pre-check read (include: group), then the post-write
    // follow-up read (include: fromUser/toUser) inside the transaction.
    // `mockResolvedValueOnce` sequencing is mandatory here — a plain
    // `mockResolvedValue` would return the pre-check row for both calls and
    // silently drop fromUser/toUser with no test failing (design.md's
    // flagged gotcha for this change).
    prisma.payment.findUnique
      .mockResolvedValueOnce(activePayment())
      .mockResolvedValueOnce({
        id: paymentId,
        status: 'ACCEPTED',
        fromUser: { id: 'user-1' },
        toUser: { id: receiverId },
      });
    prisma.payment.updateMany.mockResolvedValue({ count: 1 });

    const result = await acceptPayment(paymentId, receiverId);

    expect(result).toEqual({
      id: paymentId,
      status: 'ACCEPTED',
      fromUser: { id: 'user-1' },
      toUser: { id: receiverId },
    });
    expect(prisma.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: paymentId, status: 'PENDING' },
        data: { status: 'ACCEPTED' },
      }),
    );
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it('rejectPayment throws PAYMENT_NOT_FOUND for a soft-deleted payment and never calls updateMany', async () => {
    prisma.payment.findUnique.mockResolvedValue(softDeletedPayment());

    await expect(rejectPayment(paymentId, receiverId)).rejects.toMatchObject({
      code: 'PAYMENT_NOT_FOUND',
      status: 404,
    });
    expect(prisma.payment.updateMany).not.toHaveBeenCalled();
  });

  it('rejectPayment still rejects a non-deleted PENDING payment (triangulation)', async () => {
    // Same double-findUnique sequencing gotcha as acceptPayment above.
    prisma.payment.findUnique
      .mockResolvedValueOnce(activePayment())
      .mockResolvedValueOnce({
        id: paymentId,
        status: 'REJECTED',
        rejectionReason: 'wrong amount',
        fromUser: { id: 'user-1' },
        toUser: { id: receiverId },
      });
    prisma.payment.updateMany.mockResolvedValue({ count: 1 });

    const result = await rejectPayment(paymentId, receiverId, 'wrong amount');

    expect(result).toEqual({
      id: paymentId,
      status: 'REJECTED',
      rejectionReason: 'wrong amount',
      fromUser: { id: 'user-1' },
      toUser: { id: receiverId },
    });
    expect(prisma.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: paymentId, status: 'PENDING' },
        data: { status: 'REJECTED', rejectionReason: 'wrong amount' },
      }),
    );
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it('acceptPayment and rejectPayment both reject using the AppError class', async () => {
    prisma.payment.findUnique.mockResolvedValue(softDeletedPayment());

    await expect(acceptPayment(paymentId, receiverId)).rejects.toBeInstanceOf(AppError);

    prisma.payment.findUnique.mockResolvedValue(softDeletedPayment());
    await expect(rejectPayment(paymentId, receiverId)).rejects.toBeInstanceOf(AppError);
  });
});
