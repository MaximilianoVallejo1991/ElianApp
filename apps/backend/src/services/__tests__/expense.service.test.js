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
    calculateCollectiveSplits: vi.fn(actual.calculateCollectiveSplits),
  };
});

import prisma from '../../lib/prisma.js';
import { calculatePercentageSplits, calculateCollectiveSplits } from '../../utils/splits.js';
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
    // Item 4's adjacent-gap fix (3.7/3.8) now validates membership for every
    // PERCENTAGE request, even without participantIds — both splits' userIds
    // must be active members for this test to reach the sum guard it exists
    // to prove.
    prisma.groupMember.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);

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
    // Item 4's adjacent-gap fix now validates membership unconditionally.
    prisma.groupMember.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);
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

describe('createExpense — COLLECTIVE orphan-item rejection (ADR-13, expanded scope)', () => {
  const groupId = 'group-1';
  const userId = 'user-1';
  const baseGroup = { id: groupId, balanceMode: 'DYNAMIC', status: 'ACTIVE', ownerId: 'owner-1' };
  const activeMembership = { status: 'ACTIVE', isFrozen: false };

  it('rejects with INVALID_PARTICIPANTS when an item references a userId outside participantIds, creating nothing', async () => {
    prisma.group.findUnique.mockResolvedValue(baseGroup);
    prisma.groupMember.findUnique.mockResolvedValue(activeMembership);
    prisma.groupMember.findMany.mockResolvedValue([{ userId: 'A' }, { userId: 'B' }]);

    const data = {
      amount: 150,
      description: 'Dinner',
      category: 'FOOD',
      payerId: userId,
      splitType: 'COLLECTIVE',
      participantIds: ['A', 'B'],
      items: [
        { userId: 'A', amount: 50 },
        { userId: 'B', amount: 50 },
        { userId: 'D', amount: 50 }, // D is not in participantIds
      ],
    };

    await expect(createExpense(groupId, data, userId)).rejects.toMatchObject({
      code: 'INVALID_PARTICIPANTS',
      status: 400,
    });
    expect(prisma.expense.create).not.toHaveBeenCalled();
  });
});

describe('createExpense — COLLECTIVE split-sum guard (ADR-12, defense-in-depth, task 3.2)', () => {
  const groupId = 'group-1';
  const userId = 'user-1';
  const baseGroup = { id: groupId, balanceMode: 'DYNAMIC', status: 'ACTIVE', ownerId: 'owner-1' };
  const activeMembership = { status: 'ACTIVE', isFrozen: false };

  it('rejects via the generic amount-sum guard when calculateCollectiveSplits returns a mismatched sum', async () => {
    // Items pass ADR-13's rejection (both inside participantIds) and sum to
    // the total, so the COMPLETED branch runs calculateCollectiveSplits —
    // mocked here to simulate a latent bug in that pure function, proving
    // assertSplitsSumToTotal (shared with computeSplits/generateSplits)
    // catches it independently, same pattern as the PERCENTAGE test above.
    prisma.group.findUnique.mockResolvedValue(baseGroup);
    prisma.groupMember.findUnique.mockResolvedValue(activeMembership);
    prisma.groupMember.findMany.mockResolvedValue([{ userId: 'A' }, { userId: 'B' }]);
    prisma.expense.create.mockResolvedValue({ id: 'expense-1' });

    calculateCollectiveSplits.mockReturnValueOnce([
      { userId: 'A', amount: 50 },
      { userId: 'B', amount: 50 },
    ]);

    const data = {
      amount: 150,
      description: 'Dinner',
      category: 'FOOD',
      payerId: userId,
      splitType: 'COLLECTIVE',
      participantIds: ['A', 'B'],
      items: [
        { userId: 'A', amount: 75 },
        { userId: 'B', amount: 75 },
      ],
    };

    await expect(createExpense(groupId, data, userId)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 400,
    });
    expect(prisma.expenseSplit.createMany).not.toHaveBeenCalled();
  });
});

describe('createExpense — EQUAL membership validation (item 4, ADR-16)', () => {
  const groupId = 'group-1';
  const userId = 'user-1';
  const baseGroup = { id: groupId, balanceMode: 'DYNAMIC', status: 'ACTIVE', ownerId: 'owner-1' };
  const activeMembership = { status: 'ACTIVE', isFrozen: false };

  it('rejects an EQUAL expense whose participantIds contains a non-member (covers both createExpense and updateExpense call paths — one shared computeSplits code path, one representative case)', async () => {
    prisma.group.findUnique.mockResolvedValue(baseGroup);
    prisma.groupMember.findUnique.mockResolvedValue(activeMembership);
    prisma.groupMember.findMany.mockResolvedValue([
      { userId: 'u1' },
      { userId: 'u2' },
      { userId: 'u3' },
    ]);

    const data = {
      amount: 90,
      description: 'Dinner',
      category: 'FOOD',
      payerId: userId,
      splitType: 'EQUAL',
      participantIds: ['u1', 'u2', 'u4'], // u4 is not an active member
    };

    await expect(createExpense(groupId, data, userId)).rejects.toMatchObject({
      code: 'INVALID_PARTICIPANTS',
      status: 400,
    });
    expect(prisma.expense.create).not.toHaveBeenCalled();
  });
});

describe('createExpense — PERCENTAGE adjacent membership gap (item 4, user-confirmed fold-in)', () => {
  const groupId = 'group-1';
  const userId = 'user-1';
  const baseGroup = { id: groupId, balanceMode: 'DYNAMIC', status: 'ACTIVE', ownerId: 'owner-1' };
  const activeMembership = { status: 'ACTIVE', isFrozen: false };

  it('rejects a PERCENTAGE expense with explicit splits and NO participantIds when a split references a non-member', async () => {
    prisma.group.findUnique.mockResolvedValue(baseGroup);
    prisma.groupMember.findUnique.mockResolvedValue(activeMembership);
    prisma.groupMember.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);

    const data = {
      amount: 100,
      description: 'Dinner',
      category: 'FOOD',
      payerId: userId,
      splitType: 'PERCENTAGE',
      splits: [
        { userId: 'u1', percentage: 50 },
        { userId: 'u9', percentage: 50 }, // u9 is not a member; no participantIds supplied
      ],
    };

    await expect(createExpense(groupId, data, userId)).rejects.toMatchObject({
      code: 'INVALID_PARTICIPANTS',
      status: 400,
    });
    expect(prisma.expense.create).not.toHaveBeenCalled();
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
    // Both u1 and u2 are still active members — the new membership filter
    // (Bug 1 fix) is a no-op in this scenario.
    prisma.groupMember.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);
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

  it('(Bug 1 regression) does NOT resurrect a PERCENTAGE split for a member who has since left the group', async () => {
    // PERCENTAGE expense A:60%/B:40%; B later leaves the group; a
    // `PUT { amount: 200 }` (no splits) must reject instead of silently
    // reconstructing B's stale 40% from the persisted ExpenseSplit row.
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
    // Only u1 is still an active member — u2 left the group.
    prisma.groupMember.findMany.mockResolvedValue([{ userId: 'u1' }]);

    await expect(updateExpense(expenseId, { amount: 200 }, userId)).rejects.toMatchObject({
      status: 400,
    });
    expect(prisma.expense.update).not.toHaveBeenCalled();
  });

  it('does not fall back when data.splits is explicitly provided alongside a new amount', async () => {
    prisma.expense.findUnique.mockResolvedValue({
      ...baseExisting,
      amount: 100,
      splitType: 'PERCENTAGE',
    });
    prisma.group.findUnique.mockResolvedValue({ ownerId: 'owner-1' });
    // Item 4's adjacent-gap fix now validates every explicit split's userId
    // against active membership, even with no participantIds in the body.
    prisma.groupMember.findMany.mockResolvedValue([{ userId: 'u9' }]);
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

  it('(Bug 2 regression) preserves the ORIGINAL EQUAL participant subset on a partial update instead of re-splitting across every current active member', async () => {
    // EQUAL expense originally created with a subset of 2 out of 5 group
    // members (u1, u2). A `PUT { amount }`-only update must still split
    // only between u1/u2 — not recalculate across all 5 current members.
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
    // The group now has 5 active members — u3/u4/u5 never owed anything on
    // this expense and must not be assigned a share of it.
    prisma.groupMember.findMany.mockResolvedValue([
      { userId: 'u1' },
      { userId: 'u2' },
      { userId: 'u3' },
      { userId: 'u4' },
      { userId: 'u5' },
    ]);
    prisma.expenseSplit.deleteMany.mockResolvedValue({ count: 2 });
    prisma.expense.update.mockResolvedValue({ id: expenseId });

    await updateExpense(expenseId, { amount: 300 }, userId);

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

  it('(Bug 2 regression) rejects an EQUAL partial update when every original participant has since left the group', async () => {
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
    // Neither original participant is active anymore.
    prisma.groupMember.findMany.mockResolvedValue([{ userId: 'u3' }]);

    await expect(updateExpense(expenseId, { amount: 300 }, userId)).rejects.toMatchObject({
      code: 'INVALID_PARTICIPANTS',
      status: 400,
    });
    expect(prisma.expense.update).not.toHaveBeenCalled();
  });

  it('(Bug 3 regression) does NOT query persisted ExpenseSplit rows for a COLLECTIVE partial update', async () => {
    // COLLECTIVE expenses are not recalculated through this fallback —
    // computeSplits has no COLLECTIVE branch — so the splits reconstruction
    // query would be entirely wasted here.
    prisma.expense.findUnique.mockResolvedValue({
      ...baseExisting,
      amount: 100,
      splitType: 'COLLECTIVE',
      participantIds: ['u1', 'u2'],
    });
    prisma.group.findUnique.mockResolvedValue({ ownerId: 'owner-1' });

    await expect(updateExpense(expenseId, { amount: 500 }, userId)).rejects.toMatchObject({
      code: 'INVALID_SPLITS',
      status: 400,
    });
    expect(prisma.expenseSplit.findMany).not.toHaveBeenCalled();
  });

  it('(Second addendum regression — Bug 1) PUT { amount, splits: [] } on an EQUAL expense must still preserve the original participant subset, not fall back to every active member', async () => {
    // EQUAL expense originally split only between u1/u2 in a 5-member group.
    // Sending the whole form shape — `splits: []` (not omitted, EMPTY) —
    // must not bypass the participant-subset reconstruction: EQUAL
    // membership is driven by participantIds, never by `splits` content.
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
    // 5 active members today — u3/u4/u5 never owed anything on this expense.
    prisma.groupMember.findMany.mockResolvedValue([
      { userId: 'u1' },
      { userId: 'u2' },
      { userId: 'u3' },
      { userId: 'u4' },
      { userId: 'u5' },
    ]);
    prisma.expenseSplit.deleteMany.mockResolvedValue({ count: 2 });
    prisma.expense.update.mockResolvedValue({ id: expenseId });

    await updateExpense(expenseId, { amount: 300, splits: [] }, userId);

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

  it('(Second addendum regression — Bug 2) PUT { participantIds } alone (no amount/splitType/splits) actually recomputes and persists the new split set', async () => {
    // EQUAL expense currently split u1/u2. Changing ONLY participantIds to
    // [u1, u3] (no amount/splitType/splits in the request body) must trigger
    // recompute — the top-level gate must look at data.participantIds, not
    // just amount/splitType/splits.
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
    prisma.groupMember.findMany.mockResolvedValue([
      { userId: 'u1' },
      { userId: 'u2' },
      { userId: 'u3' },
      { userId: 'u4' },
      { userId: 'u5' },
    ]);
    prisma.expenseSplit.deleteMany.mockResolvedValue({ count: 2 });
    prisma.expense.update.mockResolvedValue({ id: expenseId });

    await updateExpense(expenseId, { participantIds: ['u1', 'u3'] }, userId);

    expect(prisma.expense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          splits: {
            create: [
              { userId: 'u1', amount: 50, percentage: null },
              { userId: 'u3', amount: 50, percentage: null },
            ],
          },
        }),
      }),
    );
  });

  it('(Third addendum regression — Fix 1) PUT { amount, participantIds: [] } on an EQUAL expense must still preserve the original participant subset, not fall back to every active member', async () => {
    // Same bug class as the second addendum's `splits: []` fix, but for
    // `participantIds`: EQUAL expense originally split only between u1/u2 in
    // a 5-member group. Sending the whole form shape — `participantIds: []`
    // (not omitted, EMPTY) — must not bypass the participant-subset
    // reconstruction. `computeSplits` itself already treats an empty
    // participantIds array as "not provided" (falls back to every active
    // member), so `updateExpense` must reconstruct BEFORE handing off,
    // exactly as it does when participantIds is omitted entirely.
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
    // 5 active members today — u3/u4/u5 never owed anything on this expense.
    prisma.groupMember.findMany.mockResolvedValue([
      { userId: 'u1' },
      { userId: 'u2' },
      { userId: 'u3' },
      { userId: 'u4' },
      { userId: 'u5' },
    ]);
    prisma.expenseSplit.deleteMany.mockResolvedValue({ count: 2 });
    prisma.expense.update.mockResolvedValue({ id: expenseId });

    await updateExpense(expenseId, { amount: 300, participantIds: [] }, userId);

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

  it('(Third addendum — Fix 2) skips the expenseSplit.findMany reconstruction query entirely for an EQUAL update with an explicit, non-empty participantIds', async () => {
    // EQUAL expense currently split u1/u2. Supplying an explicit, non-empty
    // participantIds (no `splits` in the body — EQUAL ignores splits
    // content anyway) must NOT trigger the expenseSplit.findMany +
    // getActiveMemberIds reconstruction query pair: that pair exists only to
    // rebuild membership/content the caller already supplied directly.
    prisma.expense.findUnique.mockResolvedValue({
      ...baseExisting,
      amount: 100,
      splitType: 'EQUAL',
    });
    prisma.group.findUnique.mockResolvedValue({ ownerId: 'owner-1' });
    // Item 4: EQUAL now validates a caller-provided participantIds against
    // active membership (participantIdsAreCallerProvided defaults true here —
    // this call is NOT the reconstruction path).
    prisma.groupMember.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u3' }]);
    prisma.expenseSplit.deleteMany.mockResolvedValue({ count: 2 });
    prisma.expense.update.mockResolvedValue({ id: expenseId });

    await updateExpense(expenseId, { participantIds: ['u1', 'u3'] }, userId);

    expect(prisma.expenseSplit.findMany).not.toHaveBeenCalled();
    expect(prisma.expense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          splits: {
            create: [
              { userId: 'u1', amount: 50, percentage: null },
              { userId: 'u3', amount: 50, percentage: null },
            ],
          },
        }),
      }),
    );
  });

  it('(Second addendum verification) an explicit participantIds matching the persisted PERCENTAGE splits round-trips unchanged — computeSplits re-filtering by the same participantIds is a no-op intersection', async () => {
    // Guards against double-filtering regressions: updateExpense already
    // scopes the reconstructed `splits` input to effectiveParticipantIds
    // before calling computeSplits, and computeSplits' PERCENTAGE branch
    // independently re-filters by the same participantIds. When both sets
    // match exactly, the second filter must be a no-op, not a reduction.
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
    prisma.groupMember.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);
    prisma.expenseSplit.deleteMany.mockResolvedValue({ count: 2 });
    prisma.expense.update.mockResolvedValue({ id: expenseId });

    await updateExpense(expenseId, { participantIds: ['u1', 'u2'] }, userId);

    expect(prisma.expense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          splits: {
            create: [
              { userId: 'u1', amount: 60, percentage: 60 },
              { userId: 'u2', amount: 40, percentage: 40 },
            ],
          },
        }),
      }),
    );
  });

  it('(item 4, ADR-16 exception) PUT { amount } on an EQUAL expense succeeds when a persisted split still references a member who has since left the group — reconstruction already excludes them before any membership validation runs', async () => {
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
    // u2 has left the group — only u1 remains active.
    prisma.groupMember.findMany.mockResolvedValue([{ userId: 'u1' }]);
    prisma.expenseSplit.deleteMany.mockResolvedValue({ count: 2 });
    prisma.expense.update.mockResolvedValue({ id: expenseId });

    await updateExpense(expenseId, { amount: 200 }, userId);

    expect(prisma.expense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          splits: { create: [{ userId: 'u1', amount: 200, percentage: null }] },
        }),
      }),
    );
  });

  it('(item 5) PUT { amount, splits: [] } on a PERCENTAGE expense reconstructs from persisted splits instead of failing closed with INVALID_SPLITS', async () => {
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
    prisma.groupMember.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);
    prisma.expenseSplit.deleteMany.mockResolvedValue({ count: 2 });
    prisma.expense.update.mockResolvedValue({ id: expenseId });

    await updateExpense(expenseId, { amount: 300, splits: [] }, userId);

    expect(prisma.expenseSplit.findMany).toHaveBeenCalledWith({ where: { expenseId } });
    expect(prisma.expense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 300,
          splits: {
            create: [
              { userId: 'u1', amount: 180, percentage: 60 },
              { userId: 'u2', amount: 120, percentage: 40 },
            ],
          },
        }),
      }),
    );
  });
});
