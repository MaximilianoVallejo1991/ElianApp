import prisma from '../lib/prisma.js';
import { AppError } from '../utils/errors.js';
import {
  calculateCollectiveSplits,
  computeCollectiveStatus,
  assertSplitsSumToTotal,
} from '../utils/splits.js';

// ---------------------------------------------------------------------------
//  Item Reporting Service
// ---------------------------------------------------------------------------
//  Domain logic for COLLECTIVE expense item reporting:
//  report, update, delete items; recompute status; generate splits.
// ---------------------------------------------------------------------------

// ONE derived set feeds both the status view (getItemStatus) and the
// persisted computation (recomputeAndPersist), so they can't disagree on
// which items count. An item whose owner is no longer in participantIds is
// already dropped by calculateCollectiveSplits — counting it here is what
// let a COMPLETED expense persist splits that miss the total (ADR-10).
function filterParticipantItems(expense) {
  const participantSet = new Set(expense.participantIds);
  return expense.items.filter((i) => participantSet.has(i.userId));
}

/**
 * Report (upsert) an item for a COLLECTIVE expense.
 *
 * If the user already has an item on this expense, it updates it.
 * Otherwise creates a new item.
 *
 * @param {string} expenseId
 * @param {string} userId
 * @param {number} amount
 * @param {string} [description]
 * @returns {Promise<{ item: object, expenseStatus: string }>}
 * @throws {AppError} NOT_FOUND | FORBIDDEN | LOCKED
 */
export async function reportItem(expenseId, userId, amount, description) {
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
  });

  if (!expense) {
    throw new AppError('EXPENSE_NOT_FOUND', 404, 'Expense not found');
  }

  // A soft-deleted expense must be indistinguishable from a missing one
  // (mirrors unlockExpense), so it cannot leak existence via this path.
  if (expense.deletedAt !== null) {
    throw new AppError('EXPENSE_NOT_FOUND', 404, 'Expense not found');
  }

  if (expense.splitType !== 'COLLECTIVE') {
    throw new AppError('INVALID_SPLIT_TYPE', 400, 'Item reporting is only for COLLECTIVE expenses');
  }

  // Authorization-before-state (mirrors unlockExpense's ordering): a
  // non-participant is rejected here even if the expense is also locked —
  // they never had a legitimate claim to report an item in the first
  // place, so NOT_PARTICIPANT (403) wins over EXPENSE_LOCKED (409).
  // `participantIds` is a Postgres scalar array already on the fetched
  // expense row — no extra query needed.
  if (!expense.participantIds.includes(userId)) {
    throw new AppError('NOT_PARTICIPANT', 403, 'Only participants can report items');
  }

  if (expense.isLocked) {
    throw new AppError('EXPENSE_LOCKED', 409, 'Expense is locked');
  }

  // Upsert: update if exists, create if not
  const item = await prisma.expenseItem.upsert({
    where: {
      expenseId_userId: { expenseId, userId },
    },
    update: {
      amount,
      description: description ?? 'mi gasto',
    },
    create: {
      expenseId,
      userId,
      amount,
      description: description ?? 'mi gasto',
    },
  });

  const expenseStatus = await recomputeAndPersist(expenseId);

  return { item, expenseStatus };
}

/**
 * Update an existing item.
 *
 * @param {string} itemId
 * @param {string} userId
 * @param {number} amount
 * @param {string} [description]
 * @returns {Promise<{ item: object, expenseStatus: string }>}
 * @throws {AppError} NOT_FOUND | FORBIDDEN | LOCKED
 */
export async function updateItem(itemId, userId, amount, description) {
  const item = await prisma.expenseItem.findUnique({
    where: { id: itemId },
    include: { expense: true },
  });

  if (!item) {
    throw new AppError('ITEM_NOT_FOUND', 404, 'Item not found');
  }

  if (item.expense.deletedAt !== null) {
    throw new AppError('EXPENSE_NOT_FOUND', 404, 'Expense not found');
  }

  if (item.userId !== userId) {
    throw new AppError('FORBIDDEN', 403, 'You can only update your own item');
  }

  // Authorization-before-state (mirrors reportItem's ordering): a user
  // removed from participantIds after reporting an item must be rejected
  // here even if the expense is also locked — the item is now an orphan.
  if (!item.expense.participantIds.includes(userId)) {
    throw new AppError('NOT_PARTICIPANT', 403, 'Only participants can update items');
  }

  if (item.expense.isLocked) {
    throw new AppError('EXPENSE_LOCKED', 409, 'Expense is locked');
  }

  if (item.expense.splitType !== 'COLLECTIVE') {
    throw new AppError('INVALID_SPLIT_TYPE', 400, 'Item reporting is only for COLLECTIVE expenses');
  }

  const updatedItem = await prisma.expenseItem.update({
    where: { id: itemId },
    data: {
      amount,
      description: description ?? item.description,
    },
  });

  const expenseStatus = await recomputeAndPersist(item.expenseId);

  return { item: updatedItem, expenseStatus };
}

/**
 * Delete an item.
 *
 * @param {string} itemId
 * @param {string} userId
 * @returns {Promise<void>}
 * @throws {AppError} NOT_FOUND | FORBIDDEN | LOCKED
 */
export async function deleteItem(itemId, userId) {
  const item = await prisma.expenseItem.findUnique({
    where: { id: itemId },
    include: { expense: true },
  });

  if (!item) {
    throw new AppError('ITEM_NOT_FOUND', 404, 'Item not found');
  }

  if (item.expense.deletedAt !== null) {
    throw new AppError('EXPENSE_NOT_FOUND', 404, 'Expense not found');
  }

  if (item.userId !== userId) {
    throw new AppError('FORBIDDEN', 403, 'You can only delete your own item');
  }

  if (!item.expense.participantIds.includes(userId)) {
    throw new AppError('NOT_PARTICIPANT', 403, 'Only participants can delete items');
  }

  if (item.expense.isLocked) {
    throw new AppError('EXPENSE_LOCKED', 409, 'Expense is locked');
  }

  await prisma.expenseItem.delete({ where: { id: itemId } });

  await recomputeAndPersist(item.expenseId);
}

/**
 * Recompute COLLECTIVE expense status and persist changes.
 *
 * Fetches all items for the expense, calculates the sum, compares
 * against total, and updates the expense status and isLocked fields.
 * If status becomes COMPLETED, generates ExpenseSplit records.
 *
 * @param {string} expenseId
 * @returns {Promise<string>} the new expense status
 */
export async function recomputeAndPersist(expenseId) {
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    include: { items: true },
  });

  if (!expense || expense.deletedAt !== null || expense.splitType !== 'COLLECTIVE') {
    return null;
  }

  const participantItems = filterParticipantItems(expense);
  const itemsSum = participantItems.reduce((sum, item) => sum + Number(item.amount), 0);
  const sharedCosts = Number(expense.sharedCosts) || 0;
  const total = Number(expense.amount);

  const newStatus = computeCollectiveStatus(itemsSum, sharedCosts, total);

  if (newStatus === 'COMPLETED') {
    await prisma.$transaction(async (tx) => {
      await tx.expense.update({
        where: { id: expenseId },
        data: { status: 'COMPLETED', isLocked: true },
      });

      await generateSplits(tx, expenseId, participantItems, sharedCosts, expense.participantIds, total);
    });
  } else {
    await prisma.expense.update({
      where: { id: expenseId },
      data: { status: 'MISMATCH', isLocked: false },
    });
  }

  return newStatus;
}

/**
 * Generate ExpenseSplit records for a COMPLETED COLLECTIVE expense.
 *
 * Deletes any existing splits first, then creates new ones based on
 * each participant's item amount plus their share of shared costs.
 *
 * @param {object} tx — Prisma transaction client
 * @param {string} expenseId
 * @param {Array} items — ExpenseItem records
 * @param {number} sharedCosts
 * @param {string[]} participantIds
 * @param {number} totalAmount — expense total, for the sum guard (ADR-12)
 * @returns {Promise<void>}
 */
async function generateSplits(tx, expenseId, items, sharedCosts, participantIds, totalAmount) {
  // Delete existing splits
  await tx.expenseSplit.deleteMany({ where: { expenseId } });

  const splits = calculateCollectiveSplits(
    items.map((i) => ({ userId: i.userId, amount: Number(i.amount) })),
    sharedCosts,
    participantIds,
  );

  // Defense-in-depth (ADR-12): the COLLECTIVE path had no sum guard, which is
  // how an orphaned item silently under-split a COMPLETED expense.
  assertSplitsSumToTotal(splits, totalAmount);

  await tx.expenseSplit.createMany({
    data: splits.map((s) => ({
      expenseId,
      userId: s.userId,
      amount: s.amount,
    })),
  });
}

/**
 * Get the current item reporting status for a COLLECTIVE expense.
 *
 * @param {string} expenseId
 * @returns {Promise<{ status: string, itemsSum: number, sharedCosts: number, total: number, discrepancy: number }>}
 * @throws {AppError} NOT_FOUND
 */
export async function getItemStatus(expenseId) {
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    include: { items: true },
  });

  if (!expense) {
    throw new AppError('EXPENSE_NOT_FOUND', 404, 'Expense not found');
  }

  if (expense.deletedAt !== null) {
    throw new AppError('EXPENSE_NOT_FOUND', 404, 'Expense not found');
  }

  const participantItems = filterParticipantItems(expense);
  const itemsSum = participantItems.reduce((sum, item) => sum + Number(item.amount), 0);
  const sharedCosts = Number(expense.sharedCosts) || 0;
  const total = Number(expense.amount);
  const discrepancy = Math.round((itemsSum + sharedCosts - total) * 100) / 100;

  return {
    status: expense.status,
    itemsSum: Math.round(itemsSum * 100) / 100,
    sharedCosts,
    total,
    discrepancy,
  };
}