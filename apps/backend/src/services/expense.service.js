import prisma from '../lib/prisma.js';
import { AppError } from '../utils/errors.js';
import { validateSplits } from '../schemas/expense.schemas.js';
import {
  calculateEqualSplits,
  calculateExactSplits,
  calculatePercentageSplits,
} from '../utils/splits.js';

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
 * Compute the split array based on expense amount, split type, and input splits.
 *
 * @param {number} totalAmount
 * @param {'EQUAL'|'EXACT'|'PERCENTAGE'} splitType
 * @param {Array<{ userId: string, amount?: number, percentage?: number }>} splits
 * @param {string} groupId — needed to fetch active members for EQUAL splits
 * @returns {Promise<Array<{ userId: string, amount: number, percentage?: number }>>}
 */
async function computeSplits(totalAmount, splitType, splits, groupId) {
  validateSplits(totalAmount, splitType, splits);

  if (splitType === 'EQUAL') {
    // Fetch active members for computing equal shares
    const activeMembers = await prisma.groupMember.findMany({
      where: { groupId, status: 'ACTIVE' },
      select: { userId: true },
    });

    const memberIds = activeMembers.map((m) => m.userId);
    return calculateEqualSplits(totalAmount, memberIds);
  }

  if (splitType === 'EXACT') {
    return calculateExactSplits(totalAmount, splits);
  }

  if (splitType === 'PERCENTAGE') {
    return calculatePercentageSplits(totalAmount, splits);
  }

  throw new AppError('INVALID_SPLITS', 400, 'Unknown split type');
}

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------

/**
 * Create a new expense in a group.
 *
 * 1. Verifies the requesting user is an ACTIVE member.
 * 2. Verifies the payer is an ACTIVE member.
 * 3. Verifies the group is in DYNAMIC mode.
 * 4. Computes splits based on splitType.
 * 5. For COLLECTIVE: sets status=PENDING, isLocked=false, no splits generated.
 * 6. For non-COLLECTIVE: generates splits immediately, status=COMPLETED, isLocked=true.
 * 7. Persists Expense + ExpenseSplit records (non-COLLECTIVE only).
 *
 * @param {string} groupId
 * @param {{ amount: number, description: string, category: string, payerId: string, splitType: string, splits: Array, sharedCosts?: number, participantIds?: string[] }} data
 * @param {string} userId — the authenticated (creating) user
 * @returns {Promise<object>} created expense with splits, payer, and creator
 */
export async function createExpense(groupId, data, userId) {
  // 1. Verify requester is ACTIVE member
  const group = await requireActiveMember(groupId, userId);

  // 2. Verify payer is ACTIVE member
  const payerMembership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: data.payerId } },
  });

  if (!payerMembership || payerMembership.status !== 'ACTIVE') {
    throw new AppError('NOT_MEMBER', 400, 'Payer must be an active group member');
  }

  // 3. Verify group is DYNAMIC mode
  if (group.balanceMode !== 'DYNAMIC') {
    throw new AppError(
      'STATIC_GROUP_BALANCE',
      400,
      'Balance not available for static groups',
    );
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

    // Create COLLECTIVE expense with PENDING status, unlocked, no splits
    const expense = await prisma.expense.create({
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
        date: new Date(),
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

  // Non-COLLECTIVE: compute splits normally
  const calculatedSplits = await computeSplits(
    data.amount,
    data.splitType,
    data.splits,
    groupId,
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
      date: new Date(),
      status: 'COMPLETED',
      isLocked: true,
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
 * @param {string} groupId
 * @param {string} userId
 * @returns {Promise<Array<object>>}
 */
export async function listExpenses(groupId, userId) {
  await requireActiveMember(groupId, userId);

  const expenses = await prisma.expense.findMany({
    where: { groupId },
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
    orderBy: { createdAt: 'desc' },
  });

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

  // Ownership: only payer or creator can update
  if (existing.payerId !== userId && existing.createdById !== userId) {
    throw new AppError(
      'FORBIDDEN',
      403,
      'Only payer or creator can edit this expense',
    );
  }

  // Determine the effective amount and splitType (use new or keep old)
  const effectiveAmount = data.amount ?? Number(existing.amount);
  const effectiveSplitType = data.splitType ?? existing.splitType;

  let updatedExpense;

  // If amount or splitType changed, recalculate splits
  if (data.amount !== undefined || data.splitType !== undefined || data.splits !== undefined) {
    const splitsInput = data.splits ?? [];
    const calculatedSplits = await computeSplits(
      effectiveAmount,
      effectiveSplitType,
      splitsInput,
      existing.groupId,
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
 * Delete an expense (hard delete). Only the payer or creator can delete.
 *
 * Prisma onDelete: Cascade on ExpenseSplit handles cleanup automatically.
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

  // Ownership: only payer or creator can delete
  if (expense.payerId !== userId && expense.createdById !== userId) {
    throw new AppError(
      'FORBIDDEN',
      403,
      'Only payer or creator can delete this expense',
    );
  }

  await prisma.expense.delete({ where: { id: expenseId } });
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
