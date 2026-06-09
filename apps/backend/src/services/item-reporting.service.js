import prisma from '../lib/prisma.js';
import { AppError } from '../utils/errors.js';
import { calculateCollectiveSplits, computeCollectiveStatus } from '../utils/splits.js';

// ---------------------------------------------------------------------------
//  Item Reporting Service
// ---------------------------------------------------------------------------
//  Domain logic for COLLECTIVE expense item reporting:
//  report, update, delete items; recompute status; generate splits.
// ---------------------------------------------------------------------------

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

  if (expense.splitType !== 'COLLECTIVE') {
    throw new AppError('INVALID_SPLIT_TYPE', 400, 'Item reporting is only for COLLECTIVE expenses');
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

  if (item.userId !== userId) {
    throw new AppError('FORBIDDEN', 403, 'You can only update your own item');
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

  if (item.userId !== userId) {
    throw new AppError('FORBIDDEN', 403, 'You can only delete your own item');
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

  if (!expense || expense.splitType !== 'COLLECTIVE') {
    return null;
  }

  const itemsSum = expense.items.reduce((sum, item) => sum + Number(item.amount), 0);
  const sharedCosts = Number(expense.sharedCosts) || 0;
  const total = Number(expense.amount);

  const newStatus = computeCollectiveStatus(itemsSum, sharedCosts, total);

  if (newStatus === 'COMPLETED') {
    await prisma.$transaction(async (tx) => {
      await tx.expense.update({
        where: { id: expenseId },
        data: { status: 'COMPLETED', isLocked: true },
      });

      await generateSplits(tx, expenseId, expense.items, sharedCosts, expense.participantIds);
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
 * @returns {Promise<void>}
 */
async function generateSplits(tx, expenseId, items, sharedCosts, participantIds) {
  // Delete existing splits
  await tx.expenseSplit.deleteMany({ where: { expenseId } });

  const splits = calculateCollectiveSplits(
    items.map((i) => ({ userId: i.userId, amount: Number(i.amount) })),
    sharedCosts,
    participantIds,
  );

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

  const itemsSum = expense.items.reduce((sum, item) => sum + Number(item.amount), 0);
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