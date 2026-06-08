import prisma from '../lib/prisma.js';
import { AppError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
//  Collective Expense Service
// ---------------------------------------------------------------------------
//  Domain logic for collective expense CRUD and status computation.
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
 * Compute the status of a collective expense based on reported items.
 *
 * Pure function — does not touch the database.
 *
 * @param {object} collectiveExpense — with total, sharedCosts (can be Decimal or string/number)
 * @param {Array<{ amount: any }>} items — reported individual items
 * @param {string[]} participantIds — expected participants
 * @returns {'PENDING' | 'COMPLETED' | 'MISMATCH'}
 */
export function computeStatus(collectiveExpense, items, participantIds) {
  // Not all participants have reported yet
  if (items.length < participantIds.length) {
    return 'PENDING';
  }

  const sumItems = items.reduce((sum, item) => sum + Number(item.amount), 0);
  const totalParts = sumItems + Number(collectiveExpense.sharedCosts);
  const discrepancy = Math.abs(totalParts - Number(collectiveExpense.total));

  // Within 0.01 tolerance: MATCH → auto-complete
  if (discrepancy <= 0.01) {
    return 'COMPLETED';
  }

  return 'MISMATCH';
}

/**
 * Re-read the collective expense with its items, recompute the status,
 * and persist the updated status + isLocked to the database.
 *
 * Called by individual-item.service after every item mutation.
 *
 * @param {string} collectiveExpenseId
 * @returns {Promise<string>} the new status value
 */
export async function recomputeAndPersist(collectiveExpenseId) {
  const expense = await prisma.collectiveExpense.findUnique({
    where: { id: collectiveExpenseId },
    include: { items: true },
  });

  if (!expense) {
    throw new AppError('COLLECTIVE_NOT_FOUND', 404, 'Collective expense not found');
  }

  const newStatus = computeStatus(expense, expense.items, expense.participantIds);
  const shouldLock = newStatus === 'COMPLETED';

  await prisma.collectiveExpense.update({
    where: { id: collectiveExpenseId },
    data: {
      status: newStatus,
      ...(shouldLock && { isLocked: true }),
    },
  });

  return newStatus;
}

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------

/**
 * Create a new collective expense in a group.
 *
 * 1. Verifies the creator is an ACTIVE member.
 * 2. Verifies all participantIds are ACTIVE members of the group.
 * 3. Creates the CollectiveExpense with status PENDING.
 *
 * @param {string} groupId
 * @param {string} creatorId — the authenticated user
 * @param {{ description?: string, total: number, sharedCosts: number, participantIds: string[] }} data
 * @returns {Promise<object>} created collective expense
 */
export async function create(groupId, creatorId, data) {
  // 1. Verify creator is ACTIVE member
  await requireActiveMember(groupId, creatorId);

  // 2. Verify all participants are ACTIVE members
  const memberships = await prisma.groupMember.findMany({
    where: {
      groupId,
      userId: { in: data.participantIds },
      status: 'ACTIVE',
    },
    select: { userId: true },
  });

  const activeMemberIds = memberships.map((m) => m.userId);
  const invalidIds = data.participantIds.filter((id) => !activeMemberIds.includes(id));

  if (invalidIds.length > 0) {
    throw new AppError(
      'NOT_MEMBER',
      400,
      `Users are not active members: ${invalidIds.join(', ')}`,
    );
  }

  // 3. Create the collective expense
  const expense = await prisma.collectiveExpense.create({
    data: {
      groupId,
      creatorId,
      description: data.description,
      total: data.total,
      sharedCosts: data.sharedCosts,
      participantIds: data.participantIds,
      status: 'PENDING',
      isLocked: false,
    },
    include: {
      creator: {
        select: { id: true, email: true, nickName: true },
      },
      group: {
        select: { id: true, name: true },
      },
      items: true,
    },
  });

  return expense;
}

/**
 * List all collective expenses for a group with item counts.
 *
 * @param {string} groupId
 * @returns {Promise<Array<object>>}
 */
export async function list(groupId) {
  const expenses = await prisma.collectiveExpense.findMany({
    where: { groupId },
    include: {
      creator: {
        select: { id: true, email: true, nickName: true },
      },
      _count: {
        select: { items: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return expenses;
}

/**
 * Get a single collective expense by ID with items, participants populated,
 * and computed status.
 *
 * @param {string} collectiveExpenseId
 * @returns {Promise<object>}
 * @throws {AppError} COLLECTIVE_NOT_FOUND
 */
export async function getOne(collectiveExpenseId) {
  const expense = await prisma.collectiveExpense.findUnique({
    where: { id: collectiveExpenseId },
    include: {
      creator: {
        select: { id: true, email: true, nickName: true },
      },
      group: {
        select: { id: true, name: true },
      },
      items: {
        include: {
          user: {
            select: { id: true, email: true, nickName: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!expense) {
    throw new AppError('COLLECTIVE_NOT_FOUND', 404, 'Collective expense not found');
  }

  return expense;
}

/**
 * Update a collective expense. Only the creator can update.
 * Update is blocked if items already exist OR expense is locked.
 *
 * @param {string} collectiveExpenseId
 * @param {string} creatorId
 * @param {{ description?: string, total?: number, sharedCosts?: number, participantIds?: string[] }} data
 * @returns {Promise<object>} updated expense
 * @throws {AppError} COLLECTIVE_NOT_FOUND | NOT_CREATOR | CANNOT_UPDATE_AFTER_ITEMS | ITEMS_LOCKED
 */
export async function update(collectiveExpenseId, creatorId, data) {
  const expense = await prisma.collectiveExpense.findUnique({
    where: { id: collectiveExpenseId },
    include: { _count: { select: { items: true } } },
  });

  if (!expense) {
    throw new AppError('COLLECTIVE_NOT_FOUND', 404, 'Collective expense not found');
  }

  // Ownership check — only the creator can update
  if (expense.creatorId !== creatorId) {
    throw new AppError('NOT_CREATOR', 403, 'Only the creator can update this expense');
  }

  // Cannot update if items already exist
  if (expense._count.items > 0) {
    throw new AppError(
      'CANNOT_UPDATE_AFTER_ITEMS',
      400,
      'Cannot update expense after participants have reported items',
    );
  }

  // Cannot update if locked
  if (expense.isLocked) {
    throw new AppError('ITEMS_LOCKED', 403, 'Expense is locked — unlock it first');
  }

  // Validate new participants if provided
  if (data.participantIds) {
    const memberships = await prisma.groupMember.findMany({
      where: {
        groupId: expense.groupId,
        userId: { in: data.participantIds },
        status: 'ACTIVE',
      },
      select: { userId: true },
    });

    const activeMemberIds = memberships.map((m) => m.userId);
    const invalidIds = data.participantIds.filter((id) => !activeMemberIds.includes(id));

    if (invalidIds.length > 0) {
      throw new AppError(
        'NOT_MEMBER',
        400,
        `Users are not active members: ${invalidIds.join(', ')}`,
      );
    }
  }

  const updated = await prisma.collectiveExpense.update({
    where: { id: collectiveExpenseId },
    data: {
      ...(data.description !== undefined && { description: data.description }),
      ...(data.total !== undefined && { total: data.total }),
      ...(data.sharedCosts !== undefined && { sharedCosts: data.sharedCosts }),
      ...(data.participantIds !== undefined && { participantIds: data.participantIds }),
    },
    include: {
      creator: {
        select: { id: true, email: true, nickName: true },
      },
      group: {
        select: { id: true, name: true },
      },
      items: true,
    },
  });

  return updated;
}

/**
 * Delete a collective expense. Only the creator can delete.
 * Deletion is blocked if items already exist.
 *
 * @param {string} collectiveExpenseId
 * @param {string} creatorId
 * @throws {AppError} COLLECTIVE_NOT_FOUND | NOT_CREATOR | CANNOT_DELETE_WITH_ITEMS
 */
export async function remove(collectiveExpenseId, creatorId) {
  const expense = await prisma.collectiveExpense.findUnique({
    where: { id: collectiveExpenseId },
    include: { _count: { select: { items: true } } },
  });

  if (!expense) {
    throw new AppError('COLLECTIVE_NOT_FOUND', 404, 'Collective expense not found');
  }

  // Ownership check
  if (expense.creatorId !== creatorId) {
    throw new AppError('NOT_CREATOR', 403, 'Only the creator can delete this expense');
  }

  // Cannot delete if items already exist
  if (expense._count.items > 0) {
    throw new AppError(
      'CANNOT_DELETE_WITH_ITEMS',
      400,
      'Cannot delete expense that has reported items',
    );
  }

  await prisma.collectiveExpense.delete({ where: { id: collectiveExpenseId } });
}

/**
 * Unlock a collective expense — set isLocked=false, reset status to PENDING.
 * Only the creator can unlock.
 *
 * @param {string} collectiveExpenseId
 * @param {string} creatorId
 * @returns {Promise<object>} updated expense
 * @throws {AppError} COLLECTIVE_NOT_FOUND | NOT_CREATOR
 */
export async function unlock(collectiveExpenseId, creatorId) {
  const expense = await prisma.collectiveExpense.findUnique({
    where: { id: collectiveExpenseId },
  });

  if (!expense) {
    throw new AppError('COLLECTIVE_NOT_FOUND', 404, 'Collective expense not found');
  }

  if (expense.creatorId !== creatorId) {
    throw new AppError('NOT_CREATOR', 403, 'Only the creator can unlock this expense');
  }

  const updated = await prisma.collectiveExpense.update({
    where: { id: collectiveExpenseId },
    data: {
      isLocked: false,
      status: 'PENDING',
    },
    include: {
      creator: {
        select: { id: true, email: true, nickName: true },
      },
      group: {
        select: { id: true, name: true },
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

  return updated;
}

/**
 * Lock a collective expense — set isLocked=true.
 * Only the creator can lock.
 *
 * @param {string} collectiveExpenseId
 * @param {string} creatorId
 * @returns {Promise<object>} updated expense
 * @throws {AppError} COLLECTIVE_NOT_FOUND | NOT_CREATOR
 */
export async function lock(collectiveExpenseId, creatorId) {
  const expense = await prisma.collectiveExpense.findUnique({
    where: { id: collectiveExpenseId },
  });

  if (!expense) {
    throw new AppError('COLLECTIVE_NOT_FOUND', 404, 'Collective expense not found');
  }

  if (expense.creatorId !== creatorId) {
    throw new AppError('NOT_CREATOR', 403, 'Only the creator can lock this expense');
  }

  const updated = await prisma.collectiveExpense.update({
    where: { id: collectiveExpenseId },
    data: { isLocked: true },
    include: {
      creator: {
        select: { id: true, email: true, nickName: true },
      },
      group: {
        select: { id: true, name: true },
      },
      items: true,
    },
  });

  return updated;
}
