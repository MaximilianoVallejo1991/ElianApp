import prisma from '../lib/prisma.js';
import { AppError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
//  Balance Service
// ---------------------------------------------------------------------------
//  Domain logic for net balance calculation. Balances are computed on read
//  (not stored) for DYNAMIC mode groups — avoids stale data and race
//  conditions on concurrent expense/payment edits.
//
//  Formula:
//    credits           = SUM(expense.amount WHERE expense.payerId = userId)
//    debits            = SUM(expenseSplit.amount WHERE expenseSplit.userId = userId)
//    payments_sent     = SUM(payment.amount WHERE payment.fromUserId = userId)
//    payments_received = SUM(payment.amount WHERE payment.toUserId = userId)
//    netBalance = credits - debits - payments_sent + payments_received
//
//  positive netBalance → others owe this user
//  negative netBalance → this user owes others
// ---------------------------------------------------------------------------

/**
 * Calculate net balances for all active members of a group.
 *
 * 1. Verify group exists and requester is an ACTIVE member.
 * 2. Verify group is in DYNAMIC mode (throw STATIC_GROUP_BALANCE if STATIC).
 * 3. Fetch all active members, expenses (with splits), and payments.
 * 4. Compute per-user: credits, debits, payments_sent, payments_received.
 * 5. Return sorted by netBalance descending (most owed first).
 *
 * @param {string} groupId
 * @param {string} userId — authenticated user (must be active member)
 * @returns {Promise<Array<{ userId: string, user: { id: string, nickName: string, email: string }, netBalance: number }>>}
 * @throws {AppError} NOT_FOUND | NOT_MEMBER | STATIC_GROUP_BALANCE
 */
export async function calculateGroupBalances(groupId, userId) {
  // 1. Verify group exists and requester is an ACTIVE member
  const group = await prisma.group.findUnique({ where: { id: groupId } });

  if (!group) {
    throw new AppError('NOT_FOUND', 404, 'Group not found');
  }

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });

  if (!membership || membership.status !== 'ACTIVE') {
    throw new AppError(
      'NOT_MEMBER',
      403,
      'User is not an active member of this group',
    );
  }

  // 2. Verify DYNAMIC mode
  if (group.balanceMode !== 'DYNAMIC') {
    throw new AppError(
      'STATIC_GROUP_BALANCE',
      400,
      'Balance calculation is only available for dynamic groups',
    );
  }

  // 3. Fetch all active members
  const activeMembers = await prisma.groupMember.findMany({
    where: { groupId, status: 'ACTIVE' },
    include: {
      user: {
        select: { id: true, nickName: true, email: true },
      },
    },
  });

  // 4. Fetch all expenses with splits for this group
  const expenses = await prisma.expense.findMany({
    where: { groupId },
    include: {
      splits: {
        select: { userId: true, amount: true },
      },
    },
  });

  // 5. Fetch all payments for this group
  const payments = await prisma.payment.findMany({
    where: { groupId },
    select: { fromUserId: true, toUserId: true, amount: true },
  });

  // 6. Initialize balance accumulators for all active members
  const balanceMap = new Map();

  for (const member of activeMembers) {
    balanceMap.set(member.userId, {
      credits: 0,
      debits: 0,
      payments_sent: 0,
      payments_received: 0,
    });
  }

  // 7. Credits: sum of expense amounts where the user is the payer
  for (const expense of expenses) {
    const entry = balanceMap.get(expense.payerId);
    if (entry) {
      entry.credits += Number(expense.amount);
    }
  }

  // 8. Debits: sum of expense split amounts for each user
  for (const expense of expenses) {
    for (const split of expense.splits) {
      const entry = balanceMap.get(split.userId);
      if (entry) {
        entry.debits += Number(split.amount);
      }
    }
  }

  // 9. Payments sent and received
  for (const payment of payments) {
    const senderEntry = balanceMap.get(payment.fromUserId);
    if (senderEntry) {
      senderEntry.payments_sent += Number(payment.amount);
    }

    const receiverEntry = balanceMap.get(payment.toUserId);
    if (receiverEntry) {
      receiverEntry.payments_received += Number(payment.amount);
    }
  }

  // 10. Build result array: netBalance = credits - debits - payments_sent + payments_received
  const result = [];

  for (const member of activeMembers) {
    const b = balanceMap.get(member.userId);
    const netBalance =
      b.credits - b.debits - b.payments_sent + b.payments_received;

    result.push({
      userId: member.userId,
      user: member.user,
      netBalance: Math.round(netBalance * 100) / 100,
    });
  }

  // 11. Sort by netBalance descending (positive first = most owed)
  result.sort((a, b) => b.netBalance - a.netBalance);

  return result;
}
