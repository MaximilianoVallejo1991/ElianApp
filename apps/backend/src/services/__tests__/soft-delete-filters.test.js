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
