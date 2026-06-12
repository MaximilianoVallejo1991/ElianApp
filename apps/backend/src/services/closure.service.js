import prisma from '../lib/prisma.js';
import { AppError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
//  Closure Service
// ---------------------------------------------------------------------------
//  Period closure state machine for STATIC groups:
//    OPEN → CLOSING → CLOSED (partial opens new OPEN) / FINAL (group locked)
//
//  All functions require owner authorization. DYNAMIC groups are untouched.
// ---------------------------------------------------------------------------

/**
 * Verify the requesting user is the group owner.
 *
 * @param {string} groupId
 * @param {string} userId
 * @returns {Promise<object>} the group record
 * @throws {AppError} NOT_FOUND | FORBIDDEN
 */
async function requireOwner(groupId, userId) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, ownerId: true, balanceMode: true, status: true },
  });

  if (!group) {
    throw new AppError('NOT_FOUND', 404, 'Group not found');
  }

  if (group.ownerId !== userId) {
    throw new AppError('FORBIDDEN', 403, 'Only owner can perform this action');
  }

  return group;
}

/**
 * Get the current period for a STATIC group.
 * Throws if no current period exists.
 *
 * @param {string} groupId
 * @returns {Promise<object>} the current period
 * @throws {AppError} NOT_FOUND
 */
async function getCurrentPeriodOrThrow(groupId) {
  const period = await prisma.period.findFirst({
    where: { groupId, isCurrent: true },
  });

  if (!period) {
    throw new AppError('NOT_FOUND', 404, 'No current period found');
  }

  return period;
}

// ---------------------------------------------------------------------------
//  Internal helpers — Balance verification
// ---------------------------------------------------------------------------

/**
 * Verify that all member balances are zero for the given period.
 *
 * @param {string} periodId
 * @throws {AppError} CLOSURE_BLOCKED if any balance is non-zero
 */
async function requireZeroBalances(periodId, groupId) {
  const activeMembers = await prisma.groupMember.findMany({
    where: { groupId, status: 'ACTIVE' },
  });

  const expenses = await prisma.expense.findMany({
    where: { periodId, deletedAt: null },
    select: { payerId: true, amount: true, splits: { select: { userId: true, amount: true } } },
  });

  const payments = await prisma.payment.findMany({
    where: { periodId, status: 'ACCEPTED' },
    select: { fromUserId: true, toUserId: true, amount: true },
  });

  const balanceMap = new Map();
  for (const member of activeMembers) {
    balanceMap.set(member.userId, { credits: 0, debits: 0, sent: 0, received: 0 });
  }

  for (const exp of expenses) {
    const entry = balanceMap.get(exp.payerId);
    if (entry) entry.credits += Number(exp.amount);
    for (const split of exp.splits) {
      const e = balanceMap.get(split.userId);
      if (e) e.debits += Number(split.amount);
    }
  }

  for (const pay of payments) {
    const s = balanceMap.get(pay.fromUserId);
    if (s) s.sent += Number(pay.amount);
    const r = balanceMap.get(pay.toUserId);
    if (r) r.received += Number(pay.amount);
  }

  for (const [, b] of balanceMap) {
    const net = b.credits - b.debits - b.received + b.sent;
    if (Math.abs(net) > 0.01) {
      throw new AppError(
        'CLOSURE_BLOCKED',
        409,
        `Balances not settled (remaining: ${net.toFixed(2)})`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
//  Public API — Closure State Machine
// ---------------------------------------------------------------------------

/**
 * Start closure: OPEN → CLOSING.
 *
 * Preconditions:
 * - Group is STATIC and ACTIVE
 * - Current period status is OPEN
 * - No PENDING payments exist in current period
 *
 * @param {string} groupId
 * @param {string} userId — authenticated user (must be owner)
 * @returns {Promise<object>} updated period
 * @throws {AppError} FORBIDDEN | CLOSURE_BLOCKED | NOT_MEMBER
 */
export async function startClosure(groupId, userId) {
  const group = await requireOwner(groupId, userId);

  // DYNAMIC groups have no periods — not applicable
  if (group.balanceMode !== 'STATIC') {
    throw new AppError('FORBIDDEN', 403, 'Closure only applies to STATIC groups');
  }

  // Group must be ACTIVE
  if (group.status !== 'ACTIVE') {
    throw new AppError('GROUP_CLOSED', 403, 'Group is permanently closed');
  }

  const period = await getCurrentPeriodOrThrow(groupId);

  if (period.status !== 'OPEN') {
    throw new AppError(
      'CLOSURE_BLOCKED',
      409,
      'Period is not in OPEN status',
    );
  }

  // Check for PENDING payments in current period
  const pendingPayments = await prisma.payment.count({
    where: { periodId: period.id, status: 'PENDING' },
  });

  if (pendingPayments > 0) {
    throw new AppError(
      'CLOSURE_BLOCKED',
      409,
      'Cannot start closure with PENDING payments',
    );
  }

  // Require at least one expense in current period
  const expenseCount = await prisma.expense.count({
    where: { periodId: period.id, deletedAt: null },
  });

  if (expenseCount === 0) {
    throw new AppError(
      'CLOSURE_BLOCKED',
      409,
      'Cannot start closure: no expenses recorded in current period',
    );
  }

  return prisma.period.update({
    where: { id: period.id },
    data: { status: 'CLOSING' },
  });
}

/**
 * Complete closure: CLOSING → CLOSED.
 *
 * Preconditions:
 * - Current period status is CLOSING
 * - All payments in period are ACCEPTED (none PENDING or REJECTED)
 *
 * @param {string} groupId
 * @param {string} userId — authenticated user (must be owner)
 * @returns {Promise<object>} updated period
 * @throws {AppError} FORBIDDEN | CLOSURE_BLOCKED
 */
export async function completeClosure(groupId, userId) {
  const group = await requireOwner(groupId, userId);

  if (group.balanceMode !== 'STATIC') {
    throw new AppError('FORBIDDEN', 403, 'Closure only applies to STATIC groups');
  }

  const period = await getCurrentPeriodOrThrow(groupId);

  if (period.status !== 'CLOSING') {
    throw new AppError(
      'CLOSURE_BLOCKED',
      409,
      'Period is not in CLOSING status',
    );
  }

  // Check no PENDING payments remain (REJECTED payments are historical, not blocking)
  const pendingPayments = await prisma.payment.count({
    where: {
      periodId: period.id,
      status: 'PENDING',
    },
  });

  if (pendingPayments > 0) {
    throw new AppError(
      'CLOSURE_BLOCKED',
      409,
      'Cannot complete closure with PENDING payments',
    );
  }

  // Check all balances are zero
  await requireZeroBalances(period.id, groupId);

  return prisma.period.update({
    where: { id: period.id },
    data: {
      status: 'CLOSED',
      closedAt: new Date(),
    },
  });
}

/**
 * Partial closure: CLOSING → CLOSED + new OPEN period.
 *
 * Creates a new OPEN period and sets it as current.
 * Previous period is now CLOSED.
 *
 * @param {string} groupId
 * @param {string} userId — authenticated user (must be owner)
 * @returns {Promise<object>} new period (the newly opened one)
 * @throws {AppError} FORBIDDEN | CLOSURE_BLOCKED
 */
export async function partialClosure(groupId, userId) {
  const group = await requireOwner(groupId, userId);

  if (group.balanceMode !== 'STATIC') {
    throw new AppError('FORBIDDEN', 403, 'Closure only applies to STATIC groups');
  }

  if (group.status !== 'ACTIVE') {
    throw new AppError('GROUP_CLOSED', 403, 'Group is permanently closed');
  }

  const period = await getCurrentPeriodOrThrow(groupId);

  if (period.status !== 'CLOSING') {
    throw new AppError(
      'CLOSURE_BLOCKED',
      409,
      'Period is not in CLOSING status',
    );
  }

  // Check no PENDING payments remain (REJECTED payments are historical, not blocking)
  const pendingPayments = await prisma.payment.count({
    where: {
      periodId: period.id,
      status: 'PENDING',
    },
  });

  if (pendingPayments > 0) {
    throw new AppError(
      'CLOSURE_BLOCKED',
      409,
      'All payments must be ACCEPTED',
    );
  }

  // Check all balances are zero
  await requireZeroBalances(period.id, groupId);

  // Atomic: close current period + create new open period
  return prisma.$transaction(async (tx) => {
    // Close current period
    await tx.period.update({
      where: { id: period.id },
      data: {
        status: 'CLOSED',
        isCurrent: false,
        closedAt: new Date(),
      },
    });

    // Create new OPEN period
    const newPeriod = await tx.period.create({
      data: {
        groupId,
        status: 'OPEN',
        isCurrent: true,
      },
    });

    return newPeriod;
  });
}

/**
 * Final closure: CLOSING → CLOSED + group.status = CLOSED.
 *
 * Irreversible. No further expenses, payments, or periods allowed.
 *
 * @param {string} groupId
 * @param {string} userId — authenticated user (must be owner)
 * @returns {Promise<object>} updated period
 * @throws {AppError} FORBIDDEN | CLOSURE_BLOCKED
 */
export async function finalClosure(groupId, userId) {
  const group = await requireOwner(groupId, userId);

  if (group.balanceMode !== 'STATIC') {
    throw new AppError('FORBIDDEN', 403, 'Closure only applies to STATIC groups');
  }

  const period = await getCurrentPeriodOrThrow(groupId);

  if (period.status !== 'CLOSING') {
    throw new AppError(
      'CLOSURE_BLOCKED',
      409,
      'Period is not in CLOSING status',
    );
  }

  // Check no PENDING payments remain (REJECTED payments are historical, not blocking)
  const pendingPayments = await prisma.payment.count({
    where: {
      periodId: period.id,
      status: 'PENDING',
    },
  });

  if (pendingPayments > 0) {
    throw new AppError(
      'CLOSURE_BLOCKED',
      409,
      'All payments must be ACCEPTED',
    );
  }

  // Check all balances are zero
  await requireZeroBalances(period.id, groupId);

  // Atomic: close period + mark group as closed
  return prisma.$transaction(async (tx) => {
    // Close period
    const closedPeriod = await tx.period.update({
      where: { id: period.id },
      data: {
        status: 'FINAL',
        isCurrent: false,
        closedAt: new Date(),
      },
    });

    // Mark group as permanently closed
    await tx.group.update({
      where: { id: groupId },
      data: { status: 'CLOSED' },
    });

    return closedPeriod;
  });
}

/**
 * Check if a group is permanently closed.
 *
 * @param {string} groupId
 * @returns {Promise<boolean>}
 */
export async function isGroupLocked(groupId) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { status: true },
  });

  return group?.status === 'CLOSED';
}