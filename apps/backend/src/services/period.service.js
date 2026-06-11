import prisma from '../lib/prisma.js';
import { AppError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
//  Period Service
// ---------------------------------------------------------------------------
//  Read-only period queries for STATIC groups. DYNAMIC groups have no
//  periods and will return empty results.
// ---------------------------------------------------------------------------

/**
 * Get the current (active) period for a STATIC group.
 *
 * @param {string} groupId
 * @returns {Promise<object|null>} the current period or null
 */
export async function getCurrentPeriod(groupId) {
  return prisma.period.findFirst({
    where: { groupId, isCurrent: true },
  });
}

/**
 * List all periods for a group, ordered by createdAt descending.
 *
 * @param {string} groupId
 * @param {string} userId — authenticated user (must be active member)
 * @returns {Promise<Array<object>>}
 * @throws {AppError} NOT_MEMBER
 */
export async function listPeriods(groupId, userId) {
  // Verify user is an active member
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });

  if (!membership || membership.status !== 'ACTIVE') {
    throw new AppError('NOT_MEMBER', 403, 'User is not a group member');
  }

  return prisma.period.findMany({
    where: { groupId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      isCurrent: true,
      startedAt: true,
      closedAt: true,
      createdAt: true,
      _count: {
        select: { expenses: true, payments: true },
      },
    },
  });
}

/**
 * Get a single period's metadata with expense and payment counts.
 *
 * @param {string} periodId
 * @param {string} groupId
 * @param {string} userId — authenticated user (must be active member)
 * @returns {Promise<object>}
 * @throws {AppError} NOT_FOUND | NOT_MEMBER
 */
export async function getPeriodDetails(periodId, groupId, userId) {
  // Verify user is an active member
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });

  if (!membership || membership.status !== 'ACTIVE') {
    throw new AppError('NOT_MEMBER', 403, 'User is not a group member');
  }

  const period = await prisma.period.findFirst({
    where: { id: periodId, groupId },
    include: {
      _count: {
        select: { expenses: true, payments: true },
      },
    },
  });

  if (!period) {
    throw new AppError('NOT_FOUND', 404, 'Period not found');
  }

  return period;
}

/**
 * Get balances for a specific period.
 *
 * For CLOSED/FINAL periods: returns the frozen snapshot as computed at closure.
 * For OPEN/CLOSING periods: returns live-calculated direct debts.
 *
 * @param {string} periodId
 * @param {string} groupId
 * @param {string} userId — authenticated user (must be active member)
 * @returns {Promise<object>} { periodStatus, balances }
 * @throws {AppError} NOT_FOUND | NOT_MEMBER
 */
export async function getPeriodBalances(periodId, groupId, userId) {
  // Verify user is an active member
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });

  if (!membership || membership.status !== 'ACTIVE') {
    throw new AppError('NOT_MEMBER', 403, 'User is not a group member');
  }

  const period = await prisma.period.findFirst({
    where: { id: periodId, groupId },
  });

  if (!period) {
    throw new AppError('NOT_FOUND', 404, 'Period not found');
  }

  // Get all active members
  const activeMembers = await prisma.groupMember.findMany({
    where: { groupId, status: 'ACTIVE' },
    include: {
      user: {
        select: { id: true, nickName: true, email: true },
      },
    },
  });

  // Get all expenses for this period
  const expenses = await prisma.expense.findMany({
    where: { periodId },
    include: {
      splits: {
        select: { userId: true, amount: true },
      },
    },
  });

  // Get all ACCEPTED payments for this period
  const payments = await prisma.payment.findMany({
    where: { periodId, status: 'ACCEPTED' },
    select: { fromUserId: true, toUserId: true, amount: true },
  });

  // Compute direct debts
  const balanceMap = new Map();
  for (const member of activeMembers) {
    balanceMap.set(member.userId, {
      credits: 0,
      debits: 0,
      payments_sent: 0,
      payments_received: 0,
      totalExpenseParticipation: 0,
    });
  }

  // Credits & total expense participation
  for (const expense of expenses) {
    const entry = balanceMap.get(expense.payerId);
    if (entry) {
      entry.credits += Number(expense.amount);
      entry.totalExpenseParticipation += Number(expense.amount);
    }
  }

  // Debits & total expense participation for split participants
  for (const expense of expenses) {
    for (const split of expense.splits) {
      const entry = balanceMap.get(split.userId);
      if (entry) {
        entry.debits += Number(split.amount);
        entry.totalExpenseParticipation += Number(split.amount);
      }
    }
  }

  // Payments
  for (const payment of payments) {
    const senderEntry = balanceMap.get(payment.fromUserId);
    if (senderEntry) senderEntry.payments_sent += Number(payment.amount);
    const receiverEntry = balanceMap.get(payment.toUserId);
    if (receiverEntry) receiverEntry.payments_received += Number(payment.amount);
  }

  // Build pairwise direct debts
  const debtGraph = new Map();
  for (const expense of expenses) {
    const payerId = expense.payerId;
    if (!balanceMap.has(payerId)) continue;
    for (const split of expense.splits) {
      const splitUserId = split.userId;
      if (!balanceMap.has(splitUserId) || payerId === splitUserId) continue;
      if (!debtGraph.has(splitUserId)) debtGraph.set(splitUserId, new Map());
      const toUserDebts = debtGraph.get(splitUserId);
      const currentDebt = toUserDebts.get(payerId) || 0;
      toUserDebts.set(payerId, currentDebt + Number(split.amount));
    }
  }

  // Build result
  const userMap = new Map();
  for (const member of activeMembers) userMap.set(member.userId, member.user);

  const result = [];
  for (const member of activeMembers) {
    const b = balanceMap.get(member.userId);
    const initialBalance = b.credits - b.debits;
    const finalBalance = b.credits - b.debits - b.payments_received + b.payments_sent;

    const owedTo = [];
    const owedBy = [];
    const userDebtEntries = debtGraph.get(member.userId);

    if (userDebtEntries) {
      for (const [otherUserId, amount] of userDebtEntries) {
        if (amount > 0) {
          const otherUser = userMap.get(otherUserId);
          if (otherUser) {
            owedTo.push({
              userId: otherUserId,
              nickName: otherUser.nickName,
              email: otherUser.email,
              amount: Math.round(amount * 100) / 100,
            });
          }
        } else if (amount < 0) {
          const otherUser = userMap.get(otherUserId);
          if (otherUser) {
            owedBy.push({
              userId: otherUserId,
              nickName: otherUser.nickName,
              email: otherUser.email,
              amount: Math.round(Math.abs(amount) * 100) / 100,
            });
          }
        }
      }
    }

    owedTo.sort((a, b2) => b2.amount - a.amount);
    owedBy.sort((a, b2) => b2.amount - a.amount);

    result.push({
      userId: member.userId,
      user: member.user,
      initialBalance: Math.round(initialBalance * 100) / 100,
      finalBalance: Math.round(finalBalance * 100) / 100,
      totalExpenseParticipation: Math.round(b.totalExpenseParticipation * 100) / 100,
      owedTo,
      owedBy,
    });
  }

  result.sort((a, b) => b.initialBalance - a.initialBalance);

  return {
    periodId,
    periodStatus: period.status,
    balances: result,
  };
}

/**
 * Get all expenses for a specific period.
 *
 * @param {string} periodId
 * @param {string} groupId
 * @param {string} userId — authenticated user (must be active member)
 * @returns {Promise<Array<object>>}
 * @throws {AppError} NOT_FOUND | NOT_MEMBER
 */
export async function getPeriodExpenses(periodId, groupId, userId) {
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });

  if (!membership || membership.status !== 'ACTIVE') {
    throw new AppError('NOT_MEMBER', 403, 'User is not a group member');
  }

  const period = await prisma.period.findFirst({
    where: { id: periodId, groupId },
  });

  if (!period) {
    throw new AppError('NOT_FOUND', 404, 'Period not found');
  }

  return prisma.expense.findMany({
    where: { periodId },
    include: {
      splits: {
        include: {
          user: { select: { id: true, email: true, nickName: true } },
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
          user: { select: { id: true, email: true, nickName: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get all payments for a specific period.
 *
 * @param {string} periodId
 * @param {string} groupId
 * @param {string} userId — authenticated user (must be active member)
 * @returns {Promise<Array<object>>}
 * @throws {AppError} NOT_FOUND | NOT_MEMBER
 */
export async function getPeriodPayments(periodId, groupId, userId) {
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });

  if (!membership || membership.status !== 'ACTIVE') {
    throw new AppError('NOT_MEMBER', 403, 'User is not a group member');
  }

  const period = await prisma.period.findFirst({
    where: { id: periodId, groupId },
  });

  if (!period) {
    throw new AppError('NOT_FOUND', 404, 'Period not found');
  }

  return prisma.payment.findMany({
    where: { periodId },
    include: {
      fromUser: {
        select: { id: true, email: true, nickName: true },
      },
      toUser: {
        select: { id: true, email: true, nickName: true },
      },
    },
    orderBy: { paidAt: 'desc' },
  });
}