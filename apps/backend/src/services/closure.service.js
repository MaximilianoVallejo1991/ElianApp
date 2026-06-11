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

  // Check all payments are ACCEPTED
  const nonAcceptedPayments = await prisma.payment.count({
    where: {
      periodId: period.id,
      status: { in: ['PENDING', 'REJECTED'] },
    },
  });

  if (nonAcceptedPayments > 0) {
    throw new AppError(
      'CLOSURE_BLOCKED',
      409,
      'All payments must be ACCEPTED',
    );
  }

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

  // Check all payments are ACCEPTED
  const nonAcceptedPayments = await prisma.payment.count({
    where: {
      periodId: period.id,
      status: { in: ['PENDING', 'REJECTED'] },
    },
  });

  if (nonAcceptedPayments > 0) {
    throw new AppError(
      'CLOSURE_BLOCKED',
      409,
      'All payments must be ACCEPTED',
    );
  }

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

  // Check all payments are ACCEPTED
  const nonAcceptedPayments = await prisma.payment.count({
    where: {
      periodId: period.id,
      status: { in: ['PENDING', 'REJECTED'] },
    },
  });

  if (nonAcceptedPayments > 0) {
    throw new AppError(
      'CLOSURE_BLOCKED',
      409,
      'All payments must be ACCEPTED',
    );
  }

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