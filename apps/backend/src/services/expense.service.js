import prisma from '../lib/prisma.js';
import { AppError } from '../utils/errors.js';
import { validateSplits } from '../schemas/expense.schemas.js';
import {
  calculateEqualSplits,
  calculatePercentageSplits,
  calculateCollectiveSplits,
  computeCollectiveStatus,
} from '../utils/splits.js';
import { isGroupLocked } from './closure.service.js';

// ---------------------------------------------------------------------------
//  Expense Service
// ---------------------------------------------------------------------------
//  Domain logic for expense CRUD: create, list, get, update, delete.
//  Every function is an async named export matching the existing pattern.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
//  Internal helpers
// ---------------------------------------------------------------------------

/**
 * Verify that a group exists and the user is an ACTIVE member.
 *
 * @param {string} groupId
 * @param {string} userId
 * @returns {Promise<object>} the group record
 * @throws {AppError} NOT_FOUND | NOT_MEMBER
 */
async function requireActiveMember(groupId, userId) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });

  if (!group) {
    throw new AppError('NOT_FOUND', 404, 'Group not found');
  }

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });

  if (!membership || membership.status !== 'ACTIVE') {
    throw new AppError('NOT_MEMBER', 403, 'User is not an active member of this group');
  }

  return group;
}

/**
 * Fetch the userIds of every ACTIVE member of a group.
 *
 * Shared by `computeSplits` (both EQUAL's "no participantIds" fallback and
 * PERCENTAGE's participantIds membership check) and `updateExpense`'s
 * partial-update splits fallback, so there is exactly one query shape for
 * "who is currently an active member of this group" across the module.
 *
 * @param {string} groupId
 * @returns {Promise<string[]>}
 */
async function getActiveMemberIds(groupId) {
  const activeMembers = await prisma.groupMember.findMany({
    where: { groupId, status: 'ACTIVE' },
    select: { userId: true },
  });
  return activeMembers.map((m) => m.userId);
}

/**
 * Compute the split array based on expense amount, split type, and input splits.
 *
 * @param {number} totalAmount
 * @param {'EQUAL'|'PERCENTAGE'} splitType
 * @param {Array<{ userId: string, amount?: number, percentage?: number }>} splits
 * @param {string} groupId — needed to fetch active members for EQUAL splits
 * @param {string[]} [participantIds] — optional list of specific participant IDs
 * @returns {Promise<Array<{ userId: string, amount: number, percentage?: number }>>}
 */
async function computeSplits(totalAmount, splitType, splits, groupId, participantIds) {
  validateSplits(totalAmount, splitType, splits);

  let calculatedSplits;

  if (splitType === 'EQUAL') {
    let memberIds;

    if (participantIds && participantIds.length > 0) {
      // Use the provided participant IDs directly
      memberIds = participantIds;
    } else {
      // Fall back to fetching all active members
      memberIds = await getActiveMemberIds(groupId);
    }

    calculatedSplits = calculateEqualSplits(totalAmount, memberIds);
  } else if (splitType === 'PERCENTAGE') {
    let filteredSplits = splits;

    // If participantIds provided, filter splits to only those participants
    if (participantIds && participantIds.length > 0) {
      const participantSet = new Set(participantIds);
      filteredSplits = splits.filter((s) => participantSet.has(s.userId));

      // Validate all remaining split userIds are active group members
      const activeMemberSet = new Set(await getActiveMemberIds(groupId));

      for (const split of filteredSplits) {
        if (!activeMemberSet.has(split.userId)) {
          throw new AppError('INVALID_PARTICIPANTS', 400, `User ${split.userId} is not an active group member`);
        }
      }
    }

    calculatedSplits = calculatePercentageSplits(totalAmount, filteredSplits);
  } else {
    throw new AppError('INVALID_SPLITS', 400, 'Unknown split type');
  }

  // Defense-in-depth (ADR-6): whatever branch produced them, the computed
  // splits MUST sum to the expense amount. This is deliberately a REJECT,
  // not a rescale — `splits`/`participantIds` are two sources of truth that
  // can disagree, and silently reinterpreting how much each person owes is
  // a money decision the server should not make unilaterally. Redundant
  // with calculatePercentageSplits' own internal guard (PR 1) for the
  // PERCENTAGE case today, but generic across split types and resilient to
  // future changes in either pure function.
  const computedTotal = calculatedSplits.reduce((sum, s) => sum + s.amount, 0);
  if (Math.abs(computedTotal - totalAmount) > 0.01) {
    throw new AppError('VALIDATION_ERROR', 400, 'Split amounts must sum to expense amount');
  }

  return calculatedSplits;
}

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------

/**
 * Create a new expense in a group.
 *
 * 1. Verifies the requesting user is an ACTIVE member.
 * 2. Verifies the payer is an ACTIVE member.
 * 3. For STATIC groups: checks group is not CLOSED, period is not CLOSING,
 *    and auto-links expense to current period.
 * 4. For DYNAMIC groups: works as before.
 * 5. Computes splits based on splitType.
 * 6. For COLLECTIVE: sets status=PENDING, isLocked=false, no splits generated.
 * 7. For non-COLLECTIVE: generates splits immediately, status=COMPLETED, isLocked=true.
 * 8. Persists Expense + ExpenseSplit records (non-COLLECTIVE only).
 *
 * @param {string} groupId
 * @param {{ amount: number, description: string, category: string, payerId: string, splitType: string, splits: Array, sharedCosts?: number, participantIds?: string[] }} data
 * @param {string} userId — the authenticated (creating) user
 * @returns {Promise<object>} created expense with splits, payer, and creator
 */
export async function createExpense(groupId, data, userId) {
  // 1. Verify requester is ACTIVE member
  const group = await requireActiveMember(groupId, userId);

  // 1b. Check group is not permanently closed
  if (await isGroupLocked(groupId)) {
    throw new AppError('GROUP_CLOSED', 403, 'Group is permanently closed');
  }

  // 2. Verify payer is ACTIVE member
  const payerMembership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: data.payerId } },
  });

  if (!payerMembership || payerMembership.status !== 'ACTIVE') {
    throw new AppError('NOT_MEMBER', 400, 'Payer must be an active group member');
  }

  // 2b. Check payer is not frozen
  if (payerMembership.isFrozen) {
    throw new AppError(
      'MEMBER_FROZEN',
      403,
      'This member is frozen ❄️ and cannot create new expenses',
    );
  }

  // 3. For STATIC groups: period handling
  let periodId = null;
  if (group.balanceMode === 'STATIC') {
    const currentPeriod = await prisma.period.findFirst({
      where: { groupId, isCurrent: true },
    });

    if (!currentPeriod) {
      throw new AppError('NOT_FOUND', 400, 'No active period found for this group');
    }

    if (currentPeriod.status === 'CLOSING') {
      throw new AppError(
        'PERIOD_FROZEN',
        409,
        'Cannot create expense during closing period',
      );
    }

    if (currentPeriod.status === 'CLOSED' || currentPeriod.status === 'FINAL') {
      throw new AppError(
        'PERIOD_FROZEN',
        409,
        'Cannot create expense in a closed period',
      );
    }

    periodId = currentPeriod.id;
  }

  // 4. Handle COLLECTIVE vs non-COLLECTIVE
  if (data.splitType === 'COLLECTIVE') {
    // Validate participants are provided
    if (!data.participantIds || data.participantIds.length === 0) {
      throw new AppError('INVALID_PARTICIPANTS', 400, 'COLLECTIVE expenses require participantIds');
    }

    // Verify all participants are active members
    const participantMemberships = await prisma.groupMember.findMany({
      where: {
        groupId,
        userId: { in: data.participantIds },
        status: 'ACTIVE',
      },
    });

    if (participantMemberships.length !== data.participantIds.length) {
      throw new AppError('INVALID_PARTICIPANTS', 400, 'All participants must be active group members');
    }

    const items = data.items || [];

    // Create COLLECTIVE expense (and items if provided) atomically
    const expense = await prisma.$transaction(async (tx) => {
      const newExpense = await tx.expense.create({
        data: {
          groupId,
          payerId: data.payerId,
          createdById: userId,
          description: data.description,
          amount: data.amount,
          category: data.category,
          splitType: 'COLLECTIVE',
          status: 'PENDING',
          isLocked: false,
          sharedCosts: data.sharedCosts || 0,
          participantIds: data.participantIds,
          date: data.date ? new Date(data.date) : new Date(),
          periodId,
        },
      });

      // Create items if provided — inline recompute + split generation
      if (items.length > 0) {
        await tx.expenseItem.createMany({
          data: items.map((item) => ({
            expenseId: newExpense.id,
            userId: item.userId,
            amount: item.amount,
            description: item.description || 'mi gasto',
          })),
        });

        const itemsSum = items.reduce((sum, item) => sum + item.amount, 0);
        const sharedCosts = Number(data.sharedCosts) || 0;
        const total = Number(data.amount);
        const newStatus = computeCollectiveStatus(itemsSum, sharedCosts, total);

        if (newStatus === 'COMPLETED') {
          const splits = calculateCollectiveSplits(
            items.map((i) => ({ userId: i.userId, amount: i.amount })),
            sharedCosts,
            data.participantIds,
          );

          await tx.expenseSplit.deleteMany({ where: { expenseId: newExpense.id } });

          await tx.expenseSplit.createMany({
            data: splits.map((s) => ({
              expenseId: newExpense.id,
              userId: s.userId,
              amount: s.amount,
            })),
          });

          await tx.expense.update({
            where: { id: newExpense.id },
            data: { status: 'COMPLETED', isLocked: true },
          });
        } else {
          await tx.expense.update({
            where: { id: newExpense.id },
            data: { status: 'MISMATCH', isLocked: false },
          });
        }
      }

      // Return the full expense with all relations
      return tx.expense.findUnique({
        where: { id: newExpense.id },
        include: {
          splits: {
            include: {
              user: {
                select: { id: true, email: true, nickName: true },
              },
            },
          },
          payer: {
            select: { id: true, email: true, nickName: true },
          },
          createdBy: {
            select: { id: true, email: true, nickName: true },
          },
          items: {
            include: {
              user: {
                select: { id: true, email: true, nickName: true },
              },
            },
          },
        },
      });
    });

    return expense;
  }

  // Non-COLLECTIVE: compute splits normally
  const calculatedSplits = await computeSplits(
    data.amount,
    data.splitType,
    data.splits,
    groupId,
    data.participantIds,
  );

  // 5. Create expense with splits in a single Prisma call
  const expense = await prisma.expense.create({
    data: {
      groupId,
      payerId: data.payerId,
      createdById: userId,
      description: data.description,
      amount: data.amount,
      category: data.category,
      splitType: data.splitType,
      date: data.date ? new Date(data.date) : new Date(),
      status: 'COMPLETED',
      isLocked: true,
      periodId,
      splits: {
        create: calculatedSplits.map((s) => ({
          userId: s.userId,
          amount: s.amount,
          percentage: s.percentage ?? null,
        })),
      },
    },
    include: {
      splits: {
        include: {
          user: {
            select: { id: true, email: true, nickName: true },
          },
        },
      },
      payer: {
        select: { id: true, email: true, nickName: true },
      },
      createdBy: {
        select: { id: true, email: true, nickName: true },
      },
    },
  });

  return expense;
}

/**
 * List all expenses for a group, ordered by createdAt descending.
 *
 * Verifies the requesting user is an ACTIVE member of the group.
 *
 * For STATIC groups: defaults to current period only. Use ?periodId= to filter
 * by specific period, or ?includeHistory=true to list all periods.
 * For DYNAMIC groups: lists all expenses (no period filtering).
 *
 * When `limit` and `offset` are provided, returns a paginated response
 * with `{ data, total, hasMore }`. Otherwise returns the raw array
 * (backward-compatible).
 *
 * @param {string} groupId
 * @param {string} userId
 * @param {{ limit?: number, offset?: number, periodId?: string, includeHistory?: boolean }} [opts]
 * @returns {Promise<Array<object>|{ data: Array<object>, total: number, hasMore: boolean }>>}
 */
export async function listExpenses(groupId, userId, { limit, offset, periodId, includeHistory } = {}) {
  const group = await requireActiveMember(groupId, userId);

  // Build where clause for STATIC groups
  const whereClause = { groupId, deletedAt: null };

  if (group.balanceMode === 'STATIC' && !includeHistory) {
    // Default to current period for STATIC groups
    if (periodId) {
      whereClause.periodId = periodId;
    } else {
      const currentPeriod = await prisma.period.findFirst({
        where: { groupId, isCurrent: true },
        select: { id: true },
      });
      whereClause.periodId = currentPeriod?.id ?? 'none';
    }
  } else if (group.balanceMode === 'STATIC' && periodId) {
    whereClause.periodId = periodId;
  }

  const [total, expenses] = await Promise.all([
    prisma.expense.count({ where: whereClause }),
    prisma.expense.findMany({
      where: whereClause,
      include: {
        splits: {
          include: {
            user: {
              select: { id: true, email: true, nickName: true },
            },
          },
        },
        payer: {
          select: { id: true, email: true, nickName: true },
        },
        createdBy: {
          select: { id: true, email: true, nickName: true },
        },
        items: {
          include: {
            user: {
              select: { id: true, email: true, nickName: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      ...(limit !== undefined && { take: limit }),
      ...(offset !== undefined && { skip: offset }),
    }),
  ]);

  if (limit !== undefined || offset !== undefined) {
    const hasMore = (offset || 0) + expenses.length < total;
    return { data: expenses, total, hasMore };
  }

  return expenses;
}

/**
 * Get a single expense by ID with splits, payer, creator, and items (for COLLECTIVE) populated.
 *
 * Verifies the requesting user is an ACTIVE member of the expense's group.
 *
 * @param {string} expenseId
 * @param {string} userId
 * @returns {Promise<object>}
 * @throws {AppError} EXPENSE_NOT_FOUND | NOT_MEMBER
 */
export async function getExpense(expenseId, userId) {
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    include: {
      splits: {
        include: {
          user: {
            select: { id: true, email: true, nickName: true },
          },
        },
      },
      payer: {
        select: { id: true, email: true, nickName: true },
      },
      createdBy: {
        select: { id: true, email: true, nickName: true },
      },
      items: {
        include: {
          user: {
            select: { id: true, email: true, nickName: true },
          },
        },
      },
    },
  });

  if (!expense) {
    throw new AppError('EXPENSE_NOT_FOUND', 404, 'Expense not found');
  }

  if (expense.deletedAt !== null) {
    throw new AppError('EXPENSE_NOT_FOUND', 404, 'Expense not found');
  }

  // Verify membership in the expense's group
  await requireActiveMember(expense.groupId, userId);

  return expense;
}

/**
 * Update an expense. Only the payer or creator can update.
 *
 * If amount or splitType changed, splits are recalculated.
 * ExpenseSplit records are replaced (delete old + create new).
 *
 * @param {string} expenseId
 * @param {{ amount?: number, description?: string, category?: string, splitType?: string, splits?: Array }} data
 * @param {string} userId
 * @returns {Promise<object>} updated expense with splits
 * @throws {AppError} EXPENSE_NOT_FOUND | FORBIDDEN
 */
export async function updateExpense(expenseId, data, userId) {
  const existing = await prisma.expense.findUnique({
    where: { id: expenseId },
  });

  if (!existing) {
    throw new AppError('EXPENSE_NOT_FOUND', 404, 'Expense not found');
  }

  if (existing.deletedAt !== null) {
    throw new AppError('EXPENSE_NOT_FOUND', 404, 'Expense not found');
  }

  // Fetch group to check ownerId
  const group = await prisma.group.findUnique({
    where: { id: existing.groupId },
    select: { ownerId: true },
  });

  const isGroupOwner = group?.ownerId === userId;

  // Ownership: payer, creator, or group owner can update
  if (existing.payerId !== userId && existing.createdById !== userId && !isGroupOwner) {
    throw new AppError(
      'FORBIDDEN',
      403,
      'Only payer, creator, or group owner can edit this expense',
    );
  }

  // Determine the effective amount and splitType (use new or keep old)
  const effectiveAmount = data.amount ?? Number(existing.amount);
  const effectiveSplitType = data.splitType ?? existing.splitType;

  let updatedExpense;

  // If amount or splitType changed, recalculate splits
  if (data.amount !== undefined || data.splitType !== undefined || data.splits !== undefined) {
    let splitsInput = data.splits;
    let effectiveParticipantIds = data.participantIds;

    if (splitsInput === undefined) {
      if (effectiveSplitType === 'EQUAL' || effectiveSplitType === 'PERCENTAGE') {
        // No splits provided in this partial update — fall back to the
        // expense's EXISTING persisted splits instead of treating "omitted"
        // as "empty". Filtered to active members only, reusing the SAME
        // active-membership check/query `computeSplits`' PERCENTAGE branch
        // already performs for an explicit `participantIds` list — so a
        // member who has since left the group never gets their stale split
        // silently resurrected (e.g. PERCENTAGE 60/40 -> B leaves -> a
        // `PUT { amount }` must not bring back B's 40%).
        const existingSplits = await prisma.expenseSplit.findMany({
          where: { expenseId },
        });
        const activeMemberSet = new Set(await getActiveMemberIds(existing.groupId));
        const activeExistingSplits = existingSplits.filter((s) => activeMemberSet.has(s.userId));

        if (effectiveSplitType === 'PERCENTAGE') {
          // Only `percentage` is reused from the persisted split — `amount`
          // is always recomputed fresh by computeSplits for the new total.
          // If filtering removed someone, the remaining percentages will no
          // longer sum to 100 — let the EXISTING guards (calculatePercentage
          // Splits' own internal guard, and computeSplits' defense-in-depth
          // sum check) correctly reject with INVALID_SPLITS/VALIDATION_ERROR
          // rather than silently proceeding or auto-redistributing.
          splitsInput = activeExistingSplits.map((s) => ({
            userId: s.userId,
            percentage: s.percentage !== null ? Number(s.percentage) : undefined,
          }));
        } else {
          // EQUAL: computeSplits' EQUAL branch never reads `splits` content,
          // only `participantIds` — an empty array just satisfies
          // validateSplits' shape check.
          splitsInput = [];

          if (effectiveParticipantIds === undefined) {
            // Preserve the ORIGINAL participant subset this expense was
            // created with (e.g. 2 of 5 group members), instead of letting
            // computeSplits' EQUAL branch recalculate across every CURRENT
            // active member when no participantIds is forwarded.
            const reconstructedParticipantIds = activeExistingSplits.map((s) => s.userId);

            // computeSplits' EQUAL branch does not itself validate that a
            // non-empty participantIds list still has active members (that
            // is a separate, pre-existing gap — see tasks.md), and treats an
            // EMPTY list as "fall back to every active member", which would
            // silently defeat the subset we are trying to preserve here. So
            // if every original participant has left the group, reject
            // clearly instead of letting that fallback silently expand the
            // split to the whole group.
            if (reconstructedParticipantIds.length === 0) {
              throw new AppError(
                'INVALID_PARTICIPANTS',
                400,
                "None of this expense's original participants are still active group members",
              );
            }

            effectiveParticipantIds = reconstructedParticipantIds;
          }
        }
      } else {
        // COLLECTIVE: computeSplits has no COLLECTIVE branch — it always
        // throws INVALID_SPLITS regardless of `splits` content. COLLECTIVE
        // expenses are not recalculated through this fallback at all; they
        // are edited via item-reporting.service.js's reportItem/
        // recomputeAndPersist (items -> calculateCollectiveSplits) instead.
        // Reconstructing persisted splits here would be a wasted query, so
        // skip it — `computeSplits` will reject below exactly as before.
        splitsInput = splitsInput ?? [];
      }
    }

    const calculatedSplits = await computeSplits(
      effectiveAmount,
      effectiveSplitType,
      splitsInput,
      existing.groupId,
      effectiveParticipantIds,
    );

    // Delete old splits and create new ones in a transaction
    updatedExpense = await prisma.$transaction(async (tx) => {
      await tx.expenseSplit.deleteMany({ where: { expenseId } });

      return tx.expense.update({
        where: { id: expenseId },
        data: {
          ...(data.amount !== undefined && { amount: data.amount }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.category !== undefined && { category: data.category }),
          ...(data.splitType !== undefined && { splitType: data.splitType }),
          ...(data.date !== undefined && { date: new Date(data.date) }),
          splits: {
            create: calculatedSplits.map((s) => ({
              userId: s.userId,
              amount: s.amount,
              percentage: s.percentage ?? null,
            })),
          },
        },
        include: {
          splits: {
            include: {
              user: {
                select: { id: true, email: true, nickName: true },
              },
            },
          },
          payer: {
            select: { id: true, email: true, nickName: true },
          },
          createdBy: {
            select: { id: true, email: true, nickName: true },
          },
        },
      });
    });
  } else {
    // No split changes — just update metadata
    updatedExpense = await prisma.expense.update({
      where: { id: expenseId },
      data: {
        ...(data.amount !== undefined && { amount: data.amount }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.category !== undefined && { category: data.category }),
        ...(data.date !== undefined && { date: new Date(data.date) }),
      },
      include: {
        splits: {
          include: {
            user: {
              select: { id: true, email: true, nickName: true },
            },
          },
        },
        payer: {
          select: { id: true, email: true, nickName: true },
        },
        createdBy: {
          select: { id: true, email: true, nickName: true },
        },
      },
    });
  }

  return updatedExpense;
}

/**
 * Delete an expense (soft delete). Only the payer or creator can delete.
 *
 * Sets deletedAt to mark the expense as removed without losing data.
 * Prisma onDelete: Cascade on ExpenseSplit and ExpenseItem is preserved
 * because the Expense record is not actually removed.
 *
 * @param {string} expenseId
 * @param {string} userId
 * @throws {AppError} EXPENSE_NOT_FOUND | FORBIDDEN
 */
export async function deleteExpense(expenseId, userId) {
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
  });

  if (!expense) {
    throw new AppError('EXPENSE_NOT_FOUND', 404, 'Expense not found');
  }

  // Fetch group to check ownerId
  const group = await prisma.group.findUnique({
    where: { id: expense.groupId },
    select: { ownerId: true },
  });

  // Ownership: creator or group owner can delete
  const isCreator = expense.createdById === userId;
  const isGroupOwner = group?.ownerId === userId;

  if (!isCreator && !isGroupOwner) {
    throw new AppError(
      'FORBIDDEN',
      403,
      'Only creator or group owner can delete this expense',
    );
  }

  await prisma.expense.update({
    where: { id: expenseId },
    data: { deletedAt: new Date() },
  });
}

/**
 * Unlock a COMPLETED COLLECTIVE expense for further item edits.
 * Only the creator can unlock.
 *
 * Resets status to PENDING, isLocked to false, and deletes existing splits
 * so participants can report new items.
 *
 * @param {string} expenseId
 * @param {string} userId
 * @returns {Promise<object>} updated expense
 * @throws {AppError} EXPENSE_NOT_FOUND | FORBIDDEN | INVALID_OPERATION
 */
export async function unlockExpense(expenseId, userId) {
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
  });

  if (!expense) {
    throw new AppError('EXPENSE_NOT_FOUND', 404, 'Expense not found');
  }

  if (expense.deletedAt !== null) {
    throw new AppError('EXPENSE_NOT_FOUND', 404, 'Expense not found');
  }

  if (expense.splitType !== 'COLLECTIVE') {
    throw new AppError('INVALID_OPERATION', 400, 'Only COLLECTIVE expenses can be unlocked');
  }

  // Only creator can unlock
  if (expense.createdById !== userId) {
    throw new AppError('FORBIDDEN', 403, 'Only the creator can unlock this expense');
  }

  if (expense.status !== 'COMPLETED') {
    throw new AppError('INVALID_OPERATION', 400, 'Only COMPLETED expenses can be unlocked');
  }

  // Reset status, unlock, and delete splits in a transaction
  const updatedExpense = await prisma.$transaction(async (tx) => {
    await tx.expenseSplit.deleteMany({ where: { expenseId } });

    return tx.expense.update({
      where: { id: expenseId },
      data: {
        status: 'PENDING',
        isLocked: false,
      },
      include: {
        splits: {
          include: {
            user: {
              select: { id: true, email: true, nickName: true },
            },
          },
        },
        payer: {
          select: { id: true, email: true, nickName: true },
        },
        createdBy: {
          select: { id: true, email: true, nickName: true },
        },
        items: {
          include: {
            user: {
              select: { id: true, email: true, nickName: true },
            },
          },
        },
      },
    });
  });

  return updatedExpense;
}
