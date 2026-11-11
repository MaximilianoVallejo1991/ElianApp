import { vi, describe, it, expect, beforeEach } from 'vitest';

/**
 * Concurrency guard tests for `acceptPayment`/`rejectPayment`
 * (closure-concurrency-guards, PR 3). Mirrors
 * `closure-concurrency.test.js`'s structure and header disclaimer.
 *
 * IMPORTANT — what these tests do and do not prove:
 * The mocked Prisma client (`src/lib/__mocks__/prisma.js`) cannot model real
 * write visibility or row locking. `$transaction` here runs its callback
 * synchronously against the same mock object, so these tests prove the
 * guard's CONFLICT BRANCH under interleaving and the STRUCTURE of the
 * guarded statement (status predicate inside `where`, guard-before-next-
 * statement ordering via `invocationCallOrder`) — not Postgres-level
 * atomicity. Atomicity is a property of the SQL statement we emit (see
 * design.md, ADR-13); a real-Postgres harness is explicitly out of scope
 * for this change.
 *
 * `payment.findUnique` is called TWICE per accept/reject (pre-check with
 * `include: { group }`, post-write read with `include: { fromUser, toUser }`).
 * Every mock below sequences it with `mockResolvedValueOnce` /
 * `mockImplementationOnce` so the barrier-gated pre-check and the
 * post-write read never collapse onto the same stubbed value.
 */

vi.mock('../../lib/prisma.js');

import prisma from '../../lib/prisma.js';
import { acceptPayment, rejectPayment } from '../payment.service.js';
import { AppError } from '../../utils/errors.js';
import { createBarrier } from './concurrency-barrier.js';

beforeEach(() => {
  vi.clearAllMocks();
});

const paymentId = 'payment-1';
const receiverId = 'user-2';

function pendingPayment() {
  return {
    id: paymentId,
    toUserId: receiverId,
    status: 'PENDING',
    deletedAt: null,
    group: { id: 'group-1', ownerId: 'user-1', balanceMode: 'DYNAMIC', status: 'ACTIVE' },
  };
}

function acceptedResult() {
  return {
    id: paymentId,
    status: 'ACCEPTED',
    fromUser: { id: 'user-1', email: 'u1@test.dev', nickName: 'u1' },
    toUser: { id: 'user-2', email: 'u2@test.dev', nickName: 'u2' },
  };
}

function rejectedResult() {
  return {
    id: paymentId,
    status: 'REJECTED',
    rejectionReason: null,
    fromUser: { id: 'user-1', email: 'u1@test.dev', nickName: 'u1' },
    toUser: { id: 'user-2', email: 'u2@test.dev', nickName: 'u2' },
  };
}

describe('acceptPayment — concurrency guard', () => {
  it('double-fire accept+accept: exactly one fulfilled with fromUser/toUser populated, one rejected with NOT_PENDING 409', async () => {
    const wait = createBarrier(2);

    // The first 2 calls to findUnique are the two concurrent pre-check reads
    // (include: group) — both park on the barrier with the SAME PENDING row
    // before either reaches the guard. Only the winner calls findUnique a
    // 3rd time, for its post-write follow-up read (include: fromUser/toUser).
    let callCount = 0;
    prisma.payment.findUnique.mockImplementation(async () => {
      callCount += 1;
      if (callCount <= 2) {
        await wait();
        return pendingPayment();
      }
      return acceptedResult();
    });

    prisma.payment.updateMany
      .mockResolvedValueOnce({ count: 1 }) // winner
      .mockResolvedValue({ count: 0 }); // every loser

    const results = await Promise.allSettled([
      acceptPayment(paymentId, receiverId),
      acceptPayment(paymentId, receiverId),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(AppError);
    expect(rejected[0].reason).toMatchObject({ code: 'NOT_PENDING', status: 409 });

    expect(fulfilled[0].value).toMatchObject({
      status: 'ACCEPTED',
      fromUser: expect.objectContaining({ id: 'user-1' }),
      toUser: expect.objectContaining({ id: 'user-2' }),
    });
  });

  it('asserts the status predicate inside the where of the guarded write, and that the unguarded update is never used', async () => {
    prisma.payment.findUnique
      .mockResolvedValueOnce(pendingPayment()) // pre-check read
      .mockResolvedValueOnce(acceptedResult()); // post-write read
    prisma.payment.updateMany.mockResolvedValue({ count: 1 });

    await acceptPayment(paymentId, receiverId);

    expect(prisma.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: paymentId, status: 'PENDING' }),
        data: expect.objectContaining({ status: 'ACCEPTED' }),
      }),
    );
    // No "simplifying" this back into a JS `if` plus `update({ where: { id } })`.
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it('runs the guard as the first statement of the transaction, before the follow-up read', async () => {
    prisma.payment.findUnique
      .mockResolvedValueOnce(pendingPayment())
      .mockResolvedValueOnce(acceptedResult());
    prisma.payment.updateMany.mockResolvedValue({ count: 1 });

    await acceptPayment(paymentId, receiverId);

    // `updateMany`'s first invocation must precede `findUnique`'s second
    // invocation (the post-write follow-up read).
    const updateManyOrder = prisma.payment.updateMany.mock.invocationCallOrder[0];
    const followUpReadOrder = prisma.payment.findUnique.mock.invocationCallOrder[1];
    expect(updateManyOrder).toBeLessThan(followUpReadOrder);
  });
});

describe('rejectPayment — concurrency guard', () => {
  it('double-fire accept+reject: exactly one terminal status wins, loser receives NOT_PENDING 409 matching the real outcome', async () => {
    const wait = createBarrier(2);

    let callCount = 0;
    prisma.payment.findUnique.mockImplementation(async () => {
      callCount += 1;
      if (callCount <= 2) {
        await wait();
        return pendingPayment();
      }
      return acceptedResult();
    });

    // accept wins (count: 1), reject loses (count: 0) — the loser's error
    // must reflect this exact outcome, not an unrelated error code.
    prisma.payment.updateMany
      .mockResolvedValueOnce({ count: 1 }) // accept wins
      .mockResolvedValue({ count: 0 }); // reject loses

    const results = await Promise.allSettled([
      acceptPayment(paymentId, receiverId),
      rejectPayment(paymentId, receiverId, 'wrong amount'),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // The loser's error must match the actual outcome: payment was already
    // ACCEPTED (not some other error), so the reject's guard legitimately
    // failed with the same NOT_PENDING code the accept guard would produce.
    expect(rejected[0].reason).toBeInstanceOf(AppError);
    expect(rejected[0].reason).toMatchObject({ code: 'NOT_PENDING', status: 409 });
    expect(fulfilled[0].value).toMatchObject({ status: 'ACCEPTED' });
  });

  it('asserts the status predicate inside the where of the guarded write, and that the unguarded update is never used', async () => {
    prisma.payment.findUnique
      .mockResolvedValueOnce(pendingPayment())
      .mockResolvedValueOnce(rejectedResult());
    prisma.payment.updateMany.mockResolvedValue({ count: 1 });

    await rejectPayment(paymentId, receiverId, 'wrong amount');

    expect(prisma.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: paymentId, status: 'PENDING' }),
        data: expect.objectContaining({ status: 'REJECTED', rejectionReason: 'wrong amount' }),
      }),
    );
    // No "simplifying" this back into a JS `if` plus `update({ where: { id } })`.
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });
});
