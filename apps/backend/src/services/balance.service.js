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
 * 2. For DYNAMIC: use transitive settlement (full simplification).
 * 3. For STATIC OPEN: use transitive settlement (same as DYNAMIC).
 * 4. For STATIC CLOSING: direct-debt-only (no transitive simplification).
 * 5. Fetch all active members, expenses (with splits), and ACCEPTED payments.
 * 6. Compute per-user: credits, debits, payments_sent, payments_received.
 * 7. Compute pairwise debts: owedTo and owedBy arrays per user.
 * 8. Return sorted by netBalance descending (most owed first).
 *
 * @param {string} groupId
 * @param {string} userId — authenticated user (must be active member)
 * @param {string} [periodId] — optional period ID for STATIC group balance query
 * @returns {Promise<Array<{
 *   userId: string,
 *   user: { id: string, nickName: string, email: string },
 *   netBalance: number,
 *   owedTo: Array<{ userId: string, nickName: string, email: string }, amount: number>,
 *   owedBy: Array<{ userId: string, nickName: string, email: string }, amount: number>
 * }>>}
 * @throws {AppError} NOT_FOUND | NOT_MEMBER
 */
export async function calculateGroupBalances(groupId, userId, periodId) {
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

  // 2. Determine if we should use transitive simplification
  let useTransitive = true; // Default for DYNAMIC
  let expensePeriodId = null;

  if (group.balanceMode === 'STATIC') {
    // For STATIC groups, check current period status
    let currentPeriod = null;

    if (periodId) {
      currentPeriod = await prisma.period.findUnique({
        where: { id: periodId },
      });
    } else {
      currentPeriod = await prisma.period.findFirst({
        where: { groupId, isCurrent: true },
      });
    }

    if (currentPeriod && currentPeriod.status === 'CLOSING') {
      useTransitive = false; // Direct-debt-only during CLOSING
    }

    expensePeriodId = currentPeriod?.id ?? null;
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
  // Only include expenses where isLocked=true
  const expenseWhere = expensePeriodId
    ? { groupId, isLocked: true, periodId: expensePeriodId }
    : { groupId, isLocked: true };

  const expenses = await prisma.expense.findMany({
    where: expenseWhere,
    include: {
      splits: {
        select: { userId: true, amount: true },
      },
    },
  });

  // 5. Fetch ACCEPTED payments for this group
  // For STATIC with periodId: only ACCEPTED payments in that period
  // For DYNAMIC: all ACCEPTED payments
  const paymentWhere = expensePeriodId
    ? { groupId, status: 'ACCEPTED', periodId: expensePeriodId }
    : { groupId, status: 'ACCEPTED' };

  const payments = await prisma.payment.findMany({
    where: paymentWhere,
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

  // 10. Build pairwise debt map from expenses
  // For each expense split: split user owes payer amount
  // Only count expenses where both payer and split user are active members
  const debtGraph = new Map(); // fromUserId -> Map<toUserId, amount>

  for (const expense of expenses) {
    const payerId = expense.payerId;

    // Skip if payer is not an active member
    if (!balanceMap.has(payerId)) continue;

    for (const split of expense.splits) {
      const splitUserId = split.userId;

      // Skip if split user is not an active member
      if (!balanceMap.has(splitUserId)) continue;

      // Skip self-splits
      if (payerId === splitUserId) continue;

      // Initialize nested maps if needed
      if (!debtGraph.has(splitUserId)) {
        debtGraph.set(splitUserId, new Map());
      }
      const toUserDebts = debtGraph.get(splitUserId);
      if (!toUserDebts.has(payerId)) {
        toUserDebts.set(payerId, 0);
      }

      // User in split owes payer amount_owed
      toUserDebts.set(payerId, toUserDebts.get(payerId) + Number(split.amount));
    }
  }

  // 11. Simplify debt graph (transitive simplification)
  // Skip this step for STATIC groups in CLOSING — use direct debts only
  const pairwiseDebts = new Map(); // userId -> Map<otherUserId, netAmount (positive = owes them)>

  if (useTransitive) {
    // Standard transitive simplification
    for (const [fromUserId, toDebts] of debtGraph) {
      for (const [toUserId, amount] of toDebts) {
        if (amount <= 0) continue;

        // Initialize user's debt map
        if (!pairwiseDebts.has(fromUserId)) {
          pairwiseDebts.set(fromUserId, new Map());
        }

        const userDebts = pairwiseDebts.get(fromUserId);
        const currentDebt = userDebts.get(toUserId) || 0;

        // If reverse debt exists, net them out
        const reverseDebt = (pairwiseDebts.get(toUserId)?.get(fromUserId)) || 0;

        if (reverseDebt !== 0) {
          const netDebt = (currentDebt + amount) - reverseDebt;
          // Update fromUser's perspective
          userDebts.set(toUserId, netDebt);
          // Clear reverse debt entry
          if (pairwiseDebts.get(toUserId)) {
            pairwiseDebts.get(toUserId).set(fromUserId, 0);
          }
        } else {
          userDebts.set(toUserId, currentDebt + amount);
        }
      }
    }
  } else {
    // Direct-debt-only mode (STATIC CLOSING): no transitive simplification
    for (const [fromUserId, toDebts] of debtGraph) {
      if (!pairwiseDebts.has(fromUserId)) {
        pairwiseDebts.set(fromUserId, new Map());
      }
      const userDebts = pairwiseDebts.get(fromUserId);
      for (const [toUserId, amount] of toDebts) {
        if (amount > 0) {
          userDebts.set(toUserId, amount);
        }
      }
    }
  }

  // 12. Build user lookup map for owedTo/owedBy
  const userMap = new Map();
  for (const member of activeMembers) {
    userMap.set(member.userId, member.user);
  }

  // 13. Build result array with pairwise debts
  const result = [];

  for (const member of activeMembers) {
    const b = balanceMap.get(member.userId);
    const netBalance =
      b.credits - b.debits - b.payments_received + b.payments_sent;

    const owedTo = [];
    const owedBy = [];

    // Process debts where this user owes others (owedTo)
    const userDebtEntries = pairwiseDebts.get(member.userId);
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

    // Sort by amount descending, exclude zero amounts
    owedTo.sort((a, b) => b.amount - a.amount);
    owedBy.sort((a, b) => b.amount - a.amount);

    result.push({
      userId: member.userId,
      user: member.user,
      netBalance: Math.round(netBalance * 100) / 100,
      owedTo,
      owedBy,
    });
  }

  // 14. Sort by netBalance descending (positive first = most owed)
  result.sort((a, b) => b.netBalance - a.netBalance);

  return result;
}
