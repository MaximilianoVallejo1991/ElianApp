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
    prisma.period.update.mockResolvedValue({ id: periodId, status: 'CLOSING' });

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
    prisma.period.update.mockResolvedValue({ id: periodId, status: 'CLOSED' });

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
    prisma.period.update.mockResolvedValue({ id: periodId, status: 'CLOSED' });
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
    prisma.period.update.mockResolvedValue({ id: periodId, status: 'FINAL' });
    prisma.group.update.mockResolvedValue({ id: groupId, status: 'CLOSED' });

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
    expect(prisma.payment.count).toHaveBeenCalledTimes(2);
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
