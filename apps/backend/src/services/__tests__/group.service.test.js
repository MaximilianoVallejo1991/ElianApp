import { vi, describe, it, expect, beforeEach } from 'vitest';

// Vitest auto-mock convention: `src/lib/__mocks__/prisma.js` is substituted
// in for every import of `../../lib/prisma.js` below. See that file for the
// shared mock shape (extended here with `group.delete` / `period.deleteMany`
// for `deleteGroup`'s new transaction — ADR-30).
vi.mock('../../lib/prisma.js');

import prisma from '../../lib/prisma.js';
import { deleteGroup } from '../group.service.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('deleteGroup', () => {
  const groupId = 'group-1';
  const ownerId = 'owner-1';

  function mockPreconditionsPass() {
    prisma.group.findUnique.mockResolvedValue({ id: groupId, ownerId });
    prisma.expense.count.mockResolvedValue(0);
    prisma.payment.count.mockResolvedValue(0);
    prisma.period.deleteMany.mockResolvedValue({ count: 1 });
    prisma.group.delete.mockResolvedValue({ id: groupId });
  }

  it('runs inside $transaction with tx.period.deleteMany invoked before tx.group.delete (ADR-21)', async () => {
    mockPreconditionsPass();

    await deleteGroup(groupId, ownerId);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.period.deleteMany).toHaveBeenCalledWith({ where: { groupId } });
    expect(prisma.group.delete).toHaveBeenCalledWith({ where: { id: groupId } });
    expect(prisma.period.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.group.delete.mock.invocationCallOrder[0],
    );
  });

  it('still refuses with GROUP_HAS_DATA 409 before the transaction opens when the group has active expenses', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: groupId, ownerId });
    prisma.expense.count.mockResolvedValue(1);

    await expect(deleteGroup(groupId, ownerId)).rejects.toMatchObject({
      code: 'GROUP_HAS_DATA',
      status: 409,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
