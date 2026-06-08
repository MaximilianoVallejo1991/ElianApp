import prisma from '../lib/prisma.js';
import { AppError } from '../utils/errors.js';
import { recomputeAndPersist } from './collective-expense.service.js';

// ---------------------------------------------------------------------------
//  Individual Item Service
// ---------------------------------------------------------------------------
//  Domain logic for individual item CRUD within a collective expense.
//  Every mutation triggers a status recomputation on the parent expense.
// ---------------------------------------------------------------------------

/**
 * Add an individual item to a collective expense.
 *
 * 1. Verifies the collective expense exists.
 * 2. Verifies the user is in participantIds.
 * 3. Verifies the expense is not locked.
 * 4. Verifies the user doesn't already have an item (unique constraint).
 * 5. Creates the IndividualItem.
 * 6. Recomputes and persists the collective expense status.
 *
 * @param {string} collectiveExpenseId
 * @param {string} userId — the authenticated user adding their own item
 * @param {{ amount: number, description?: string }} data
 * @returns {Promise<object>} created item
 * @throws {AppError} COLLECTIVE_NOT_FOUND | NOT_PARTICIPANT | ITEMS_LOCKED | ALREADY_REPORTED
 */
export async function add(collectiveExpenseId, userId, data) {
  // 1. Verify collective expense exists
  const expense = await prisma.collectiveExpense.findUnique({
    where: { id: collectiveExpenseId },
  });

  if (!expense) {
    throw new AppError('COLLECTIVE_NOT_FOUND', 404, 'Collective expense not found');
  }

  // 2. Verify user is in participantIds
  if (!expense.participantIds.includes(userId)) {
    throw new AppError(
      'NOT_PARTICIPANT',
      403,
      'You are not a participant in this collective expense',
    );
  }

  // 3. Verify expense is not locked
  if (expense.isLocked) {
    throw new AppError(
      'ITEMS_LOCKED',
      403,
      'This expense is locked — the creator must unlock it first',
    );
  }

  // 4. Check that the user doesn't already have an item (also enforced by @@unique)
  const existing = await prisma.individualItem.findUnique({
    where: {
      collectiveExpenseId_userId: { collectiveExpenseId, userId },
    },
  });

  if (existing) {
    throw new AppError(
      'ALREADY_REPORTED',
      400,
      'You have already reported your item for this expense',
    );
  }

  // 5. Create the item
  const item = await prisma.individualItem.create({
    data: {
      collectiveExpenseId,
      userId,
      amount: data.amount,
      description: data.description,
    },
    include: {
      user: {
        select: { id: true, email: true, nickName: true },
      },
    },
  });

  // 6. Recompute collective expense status
  await recomputeAndPersist(collectiveExpenseId);

  return item;
}

/**
 * Update an existing individual item.
 *
 * 1. Verifies the item exists and belongs to the user.
 * 2. Verifies the parent collective expense is not locked.
 * 3. Updates the item.
 * 4. Recomputes and persists the collective expense status.
 *
 * @param {string} itemId
 * @param {string} userId — the authenticated user (must own the item)
 * @param {{ amount?: number, description?: string }} data
 * @returns {Promise<object>} updated item
 * @throws {AppError} ITEM_NOT_FOUND | FORBIDDEN | ITEMS_LOCKED
 */
export async function update(itemId, userId, data) {
  // 1. Find item
  const item = await prisma.individualItem.findUnique({
    where: { id: itemId },
    include: { collectiveExpense: true },
  });

  if (!item) {
    throw new AppError('ITEM_NOT_FOUND', 404, 'Individual item not found');
  }

  // Verify ownership
  if (item.userId !== userId) {
    throw new AppError(
      'FORBIDDEN',
      403,
      'You can only update your own item',
    );
  }

  // 2. Verify parent expense is not locked
  if (item.collectiveExpense.isLocked) {
    throw new AppError(
      'ITEMS_LOCKED',
      403,
      'This expense is locked — the creator must unlock it first',
    );
  }

  // 3. Update the item
  const updated = await prisma.individualItem.update({
    where: { id: itemId },
    data: {
      ...(data.amount !== undefined && { amount: data.amount }),
      ...(data.description !== undefined && { description: data.description }),
    },
    include: {
      user: {
        select: { id: true, email: true, nickName: true },
      },
    },
  });

  // 4. Recompute status
  await recomputeAndPersist(item.collectiveExpenseId);

  return updated;
}

/**
 * Delete an individual item.
 *
 * 1. Verifies the item exists and belongs to the user.
 * 2. Verifies the parent collective expense is not locked.
 * 3. Deletes the item.
 * 4. Recomputes the collective expense status (will become PENDING since one less reporter).
 *
 * @param {string} itemId
 * @param {string} userId
 * @throws {AppError} ITEM_NOT_FOUND | FORBIDDEN | ITEMS_LOCKED
 */
export async function remove(itemId, userId) {
  // 1. Find item
  const item = await prisma.individualItem.findUnique({
    where: { id: itemId },
    include: { collectiveExpense: true },
  });

  if (!item) {
    throw new AppError('ITEM_NOT_FOUND', 404, 'Individual item not found');
  }

  // Verify ownership
  if (item.userId !== userId) {
    throw new AppError(
      'FORBIDDEN',
      403,
      'You can only delete your own item',
    );
  }

  // 2. Verify parent expense is not locked
  if (item.collectiveExpense.isLocked) {
    throw new AppError(
      'ITEMS_LOCKED',
      403,
      'This expense is locked — the creator must unlock it first',
    );
  }

  // 3. Delete the item
  await prisma.individualItem.delete({ where: { id: itemId } });

  // 4. Recompute status (will become PENDING since count went down)
  await recomputeAndPersist(item.collectiveExpenseId);
}
