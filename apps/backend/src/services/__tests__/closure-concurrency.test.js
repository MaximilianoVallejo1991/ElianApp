import { vi, describe, it, expect, beforeEach } from 'vitest';

/**
 * Concurrency guard tests for `partialClosure` (closure-concurrency-guards,
 * PR 1 — the only confirmed data-corrupting race in this change).
 *
 * IMPORTANT — what these tests do and do not prove:
 * The mocked Prisma client (`src/lib/__mocks__/prisma.js`) cannot model real
 * write visibility or row locking. `$transaction` here runs its callback
 * synchronously against the same mock object, so these tests prove the
 * guard's CONFLICT BRANCH under interleaving and the STRUCTURE of the
 * guarded statement (status predicate inside `where`, guard-before-create
 * ordering via `invocationCallOrder`) — not Postgres-level atomicity.
 * Atomicity is a property of the SQL statement we emit (see design.md,
 * ADR-13); a real-Postgres harness is explicitly out of scope for this
 * change.
 *
 * The other three closure transitions (`startClosure`, `completeClosure`,
 * `finalClosure`) are PR 2's scope and are NOT covered in this file.
 */

vi.mock('../../lib/prisma.js');

import prisma from '../../lib/prisma.js';
import { partialClosure } from '../closure.service.js';
import { AppError } from '../../utils/errors.js';
import { createBarrier } from './concurrency-barrier.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('partialClosure — concurrency guard', () => {
  const groupId = 'group-1';
  const ownerId = 'owner-1';
  const periodId = 'period-1';

  function mockHappyPathUpTo(readStatus) {
    prisma.group.findUnique.mockResolvedValue({
      id: groupId,
      ownerId,
      balanceMode: 'STATIC',
      status: 'ACTIVE',
    });
    prisma.period.findFirst.mockImplementation(async () => readStatus());
    prisma.payment.count.mockResolvedValue(0);
    prisma.groupMember.findMany.mockResolvedValue([]);
    prisma.expense.findMany.mockResolvedValue([]);
    prisma.payment.findMany.mockResolvedValue([]);
  }

  it('double-fire: exactly one fulfilled, one rejected with CLOSURE_BLOCKED 409, period.create called exactly once', async () => {
    const wait = createBarrier(2);

    mockHappyPathUpTo(async () => {
      // Both concurrent calls park here — both pass the pre-read status
      // check with the SAME `CLOSING` row before either reaches the guard.
      await wait();
      return { id: periodId, status: 'CLOSING' };
    });

    prisma.period.updateMany
      .mockResolvedValueOnce({ count: 1 }) // winner
      .mockResolvedValue({ count: 0 }); // every loser
    prisma.period.create.mockResolvedValue({
      id: 'period-2',
      groupId,
      status: 'OPEN',
      isCurrent: true,
    });

    const results = await Promise.allSettled([
      partialClosure(groupId, ownerId),
      partialClosure(groupId, ownerId),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(AppError);
    expect(rejected[0].reason).toMatchObject({ code: 'CLOSURE_BLOCKED', status: 409 });

    // The actual data-corruption fix being proven: only one new period ever
    // gets created, never two.
    expect(prisma.period.create).toHaveBeenCalledTimes(1);
  });

  it('asserts the status predicate inside the where of the guarded write, and that the unguarded update is never used', async () => {
    mockHappyPathUpTo(async () => ({ id: periodId, status: 'CLOSING' }));
    prisma.period.updateMany.mockResolvedValue({ count: 1 });
    prisma.period.create.mockResolvedValue({
      id: 'period-2',
      groupId,
      status: 'OPEN',
      isCurrent: true,
    });

    await partialClosure(groupId, ownerId);

    expect(prisma.period.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: periodId, status: 'CLOSING' }),
        data: expect.objectContaining({ status: 'CLOSED', isCurrent: false }),
      }),
    );
    // No "simplifying" this back into a JS `if` plus `update({ where: { id } })`.
    expect(prisma.period.update).not.toHaveBeenCalled();
  });

  it('runs the guard as the first statement of the transaction, before period.create', async () => {
    mockHappyPathUpTo(async () => ({ id: periodId, status: 'CLOSING' }));
    prisma.period.updateMany.mockResolvedValue({ count: 1 });
    prisma.period.create.mockResolvedValue({
      id: 'period-2',
      groupId,
      status: 'OPEN',
      isCurrent: true,
    });

    await partialClosure(groupId, ownerId);

    expect(prisma.period.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.period.create.mock.invocationCallOrder[0],
    );
  });
});
