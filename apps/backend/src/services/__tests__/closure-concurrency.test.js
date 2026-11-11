import { vi, describe, it, expect, beforeEach } from 'vitest';

/**
 * Concurrency guard tests for all four closure state transitions
 * (closure-concurrency-guards). `partialClosure` (PR 1) was the only
 * confirmed data-corrupting race; `startClosure`/`completeClosure`/
 * `finalClosure` (PR 2, this batch) are guarded for pattern consistency —
 * mostly idempotent today, but a same-shape TOCTOU window exists in each.
 *
 * IMPORTANT — what these tests do and do not prove:
 * The mocked Prisma client (`src/lib/__mocks__/prisma.js`) cannot model real
 * write visibility or row locking. `$transaction` here runs its callback
 * synchronously against the same mock object, so these tests prove the
 * guard's CONFLICT BRANCH under interleaving and the STRUCTURE of the
 * guarded statement (status predicate inside `where`, guard-before-next-write
 * ordering via `invocationCallOrder`) — not Postgres-level atomicity.
 * Atomicity is a property of the SQL statement we emit (see design.md,
 * ADR-13); a real-Postgres harness is explicitly out of scope for this
 * change.
 */

vi.mock('../../lib/prisma.js');

import prisma from '../../lib/prisma.js';
import {
  startClosure,
  completeClosure,
  partialClosure,
  finalClosure,
} from '../closure.service.js';
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

describe('startClosure — concurrency guard', () => {
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
    prisma.expense.count.mockResolvedValue(1);
  }

  it('double-fire: exactly one fulfilled, one rejected with CLOSURE_BLOCKED 409', async () => {
    const wait = createBarrier(2);

    mockHappyPathUpTo(async () => {
      // Both concurrent calls park here — both pass the pre-read status
      // check with the SAME `OPEN` row before either reaches the guard.
      await wait();
      return { id: periodId, status: 'OPEN' };
    });

    prisma.period.updateMany
      .mockResolvedValueOnce({ count: 1 }) // winner
      .mockResolvedValue({ count: 0 }); // every loser
    prisma.period.findUnique.mockResolvedValue({ id: periodId, status: 'CLOSING' });

    const results = await Promise.allSettled([
      startClosure(groupId, ownerId),
      startClosure(groupId, ownerId),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(AppError);
    expect(rejected[0].reason).toMatchObject({ code: 'CLOSURE_BLOCKED', status: 409 });
  });

  it('asserts the status predicate inside the where of the guarded write, and that the unguarded update is never used', async () => {
    mockHappyPathUpTo(async () => ({ id: periodId, status: 'OPEN' }));
    prisma.period.updateMany.mockResolvedValue({ count: 1 });
    prisma.period.findUnique.mockResolvedValue({ id: periodId, status: 'CLOSING' });

    await startClosure(groupId, ownerId);

    expect(prisma.period.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: periodId, status: 'OPEN' }),
        data: expect.objectContaining({ status: 'CLOSING' }),
      }),
    );
    // No "simplifying" this back into a JS `if` plus `update({ where: { id } })`.
    expect(prisma.period.update).not.toHaveBeenCalled();
  });
});

describe('completeClosure — concurrency guard', () => {
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

  it('double-fire: exactly one fulfilled, one rejected with CLOSURE_BLOCKED 409', async () => {
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
    prisma.period.findUnique.mockResolvedValue({ id: periodId, status: 'CLOSED' });

    const results = await Promise.allSettled([
      completeClosure(groupId, ownerId),
      completeClosure(groupId, ownerId),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(AppError);
    expect(rejected[0].reason).toMatchObject({ code: 'CLOSURE_BLOCKED', status: 409 });
  });

  it('asserts the status predicate inside the where of the guarded write, and that the unguarded update is never used', async () => {
    mockHappyPathUpTo(async () => ({ id: periodId, status: 'CLOSING' }));
    prisma.period.updateMany.mockResolvedValue({ count: 1 });
    prisma.period.findUnique.mockResolvedValue({ id: periodId, status: 'CLOSED' });

    await completeClosure(groupId, ownerId);

    expect(prisma.period.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: periodId, status: 'CLOSING' }),
        data: expect.objectContaining({ status: 'CLOSED' }),
      }),
    );
    // No "simplifying" this back into a JS `if` plus `update({ where: { id } })`.
    expect(prisma.period.update).not.toHaveBeenCalled();
  });
});

describe('finalClosure — concurrency guard', () => {
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

  it('double-fire: exactly one fulfilled with group closed, one rejected with CLOSURE_BLOCKED 409', async () => {
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
    prisma.group.update.mockResolvedValue({ id: groupId, status: 'CLOSED' });
    prisma.period.findUnique.mockResolvedValue({ id: periodId, status: 'FINAL' });

    const results = await Promise.allSettled([
      finalClosure(groupId, ownerId),
      finalClosure(groupId, ownerId),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(AppError);
    expect(rejected[0].reason).toMatchObject({ code: 'CLOSURE_BLOCKED', status: 409 });

    // The actual safety property being proven: only the winner's transaction
    // ever reaches group.update — a loser's guard fails and the whole tx
    // rolls back before Group is touched.
    expect(prisma.group.update).toHaveBeenCalledTimes(1);
  });

  it('asserts the status predicate inside the where of the guarded write, and that the unguarded update is never used', async () => {
    mockHappyPathUpTo(async () => ({ id: periodId, status: 'CLOSING' }));
    prisma.period.updateMany.mockResolvedValue({ count: 1 });
    prisma.group.update.mockResolvedValue({ id: groupId, status: 'CLOSED' });
    prisma.period.findUnique.mockResolvedValue({ id: periodId, status: 'FINAL' });

    await finalClosure(groupId, ownerId);

    expect(prisma.period.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: periodId, status: 'CLOSING' }),
        data: expect.objectContaining({ status: 'FINAL', isCurrent: false }),
      }),
    );
    // No "simplifying" this back into a JS `if` plus `update({ where: { id } })`.
    expect(prisma.period.update).not.toHaveBeenCalled();
  });

  it('runs the guard as the first statement of the transaction, before group.update (Period before Group lock order)', async () => {
    mockHappyPathUpTo(async () => ({ id: periodId, status: 'CLOSING' }));
    prisma.period.updateMany.mockResolvedValue({ count: 1 });
    prisma.group.update.mockResolvedValue({ id: groupId, status: 'CLOSED' });
    prisma.period.findUnique.mockResolvedValue({ id: periodId, status: 'FINAL' });

    await finalClosure(groupId, ownerId);

    expect(prisma.period.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.group.update.mock.invocationCallOrder[0],
    );
  });
});
