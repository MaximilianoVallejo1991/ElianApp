import prisma from '../lib/prisma.js';
import { AppError } from '../utils/errors.js';
import { isGroupLocked } from './closure.service.js';

// ---------------------------------------------------------------------------
//  Payment Service
// ---------------------------------------------------------------------------
//  Domain logic for payment recording: create, list, delete.
//  Payments affect balances but do NOT create expenses — they represent
//  the settling of debts between group members.
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
    throw new AppError(
      'NOT_MEMBER',
      403,
      'User is not an active member of this group',
    );
  }

  return group;
}

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------

/**
 * Record a payment from one member to another.
 *
 * 1. Verify requester (userId) is an ACTIVE member.
 * 2. Verify fromUserId matches the authenticated user.
 * 3. Verify toUserId is an ACTIVE member.
 * 4. Verify fromUserId !== toUserId.
 * 5. Verify amount > 0.
 * 6. For STATIC groups: auto-link to current period.
 * 7. Create Payment record with status=PENDING.
 *
 * @param {string} groupId
 * @param {string} fromUserId — must equal authenticated userId
 * @param {string} toUserId   — must be a different active member
 * @param {number} amount     — positive decimal
 * @param {string} [method]   — optional payment method
 * @param {string} [paidAt]   — optional ISO datetime
 * @param {string} userId     — authenticated user
 * @returns {Promise<object>} created payment with fromUser and toUser
 * @throws {AppError} NOT_MEMBER | FORBIDDEN | INVALID_SPLITS (for amount ≤ 0 or self-payment)
 */
export async function createPayment(
  groupId,
  fromUserId,
  toUserId,
  amount,
  method,
  paidAt,
  userId,
) {
  // 1. Verify requester is ACTIVE member
  const group = await requireActiveMember(groupId, userId);

  // 1b. Check group is not permanently closed
  if (await isGroupLocked(groupId)) {
    throw new AppError('GROUP_CLOSED', 403, 'Group is permanently closed');
  }

  // 2. fromUserId must match authenticated user
  if (fromUserId !== userId) {
    throw new AppError(
      'FORBIDDEN',
      403,
      'You can only create payments from yourself',
    );
  }

  // 3. Verify toUserId is an ACTIVE member
  const receiverMembership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: toUserId } },
  });

  if (!receiverMembership || receiverMembership.status !== 'ACTIVE') {
    throw new AppError(
      'NOT_MEMBER',
      400,
      'Receiver is not an active group member',
    );
  }

  // 4. fromUserId !== toUserId
  if (fromUserId === toUserId) {
    throw new AppError('INVALID_SPLITS', 400, 'Cannot send a payment to yourself');
  }

  // 5. amount > 0
  if (amount <= 0) {
    throw new AppError('INVALID_SPLITS', 400, 'Amount must be a positive number');
  }

  // 6. Prevent duplicate active payments
  const existingPayment = await prisma.payment.findFirst({
    where: {
      groupId,
      fromUserId,
      toUserId,
      deletedAt: null,
    },
  });

  if (existingPayment) {
    throw new AppError(
      'DUPLICATE_PAYMENT',
      409,
      'An active payment between these users already exists',
    );
  }

  // 7. For STATIC groups: get current period
  let periodId = null;
  if (group.balanceMode === 'STATIC') {
    const currentPeriod = await prisma.period.findFirst({
      where: { groupId, isCurrent: true },
    });
    if (currentPeriod) {
      periodId = currentPeriod.id;
    }
  }

  // 8. Create payment with status=PENDING (DB default)
  const payment = await prisma.payment.create({
    data: {
      groupId,
      fromUserId,
      toUserId,
      amount,
      method: method || null,
      paidAt: paidAt ? new Date(paidAt) : new Date(),
      periodId,
      status: 'PENDING',
    },
    include: {
      fromUser: {
        select: { id: true, email: true, nickName: true },
      },
      toUser: {
        select: { id: true, email: true, nickName: true },
      },
    },
  });

  return payment;
}

/**
 * List all payments in a group, ordered by paidAt descending.
 *
 * Verifies the requesting user is an ACTIVE member.
 *
 * For STATIC groups: defaults to current period only. Use ?periodId= to filter
 * by specific period, or ?includeHistory=true to list all periods.
 * For DYNAMIC groups: lists all payments (no period filtering).
 *
 * When `limit` and `offset` are provided, returns a paginated response
 * with `{ data, total, hasMore }`. Otherwise returns the raw array
 * (backward-compatible).
 *
 * @param {string} groupId
 * @param {string} userId — authenticated user
 * @param {{ limit?: number, offset?: number, periodId?: string, includeHistory?: boolean }} [opts]
 * @returns {Promise<Array<object>|{ data: Array<object>, total: number, hasMore: boolean }>>}
 */
export async function listPayments(groupId, userId, { limit, offset, periodId, includeHistory } = {}) {
  const group = await requireActiveMember(groupId, userId);

  // Build where clause
  const whereClause = { groupId, deletedAt: null };

  if (group.balanceMode === 'STATIC' && !includeHistory) {
    // Default to current period for STATIC groups
    if (periodId) {
      whereClause.periodId = periodId;
    } else {
      const currentPeriod = await prisma.period.findFirst({
        where: { groupId, isCurrent: true },
        select: { id: true },
      });
      whereClause.periodId = currentPeriod?.id ?? 'none';
    }
  } else if (group.balanceMode === 'STATIC' && periodId) {
    whereClause.periodId = periodId;
  }

  const [total, payments] = await Promise.all([
    prisma.payment.count({ where: whereClause }),
    prisma.payment.findMany({
      where: whereClause,
      include: {
        fromUser: {
          select: { id: true, email: true, nickName: true },
        },
        toUser: {
          select: { id: true, email: true, nickName: true },
        },
      },
      orderBy: { paidAt: 'desc' },
      ...(limit !== undefined && { take: limit }),
      ...(offset !== undefined && { skip: offset }),
    }),
  ]);

  if (limit !== undefined || offset !== undefined) {
    const hasMore = (offset || 0) + payments.length < total;
    return { data: payments, total, hasMore };
  }

  return payments;
}

/**
 * Delete a payment (soft delete). Only the sender can delete.
 *
 * Sets deletedAt to mark the payment as removed without losing data.
 *
 * @param {string} paymentId
 * @param {string} userId — authenticated user
 * @throws {AppError} PAYMENT_NOT_FOUND | FORBIDDEN
 */
export async function deletePayment(paymentId, userId) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
  });

  if (!payment) {
    throw new AppError('PAYMENT_NOT_FOUND', 404, 'Payment not found');
  }

  // Fetch group to check ownerId
  const group = await prisma.group.findUnique({
    where: { id: payment.groupId },
    select: { ownerId: true },
  });

  // Sender or group owner can delete
  const isSender = payment.fromUserId === userId;
  const isGroupOwner = group?.ownerId === userId;

  if (!isSender && !isGroupOwner) {
    throw new AppError(
      'FORBIDDEN',
      403,
      'Only sender or group owner can delete this payment',
    );
  }

  await prisma.payment.update({
    where: { id: paymentId },
    data: { deletedAt: new Date() },
  });
}

/**
 * Accept a PENDING payment. Only the payment receiver (toUserId) can accept.
 *
 * @param {string} paymentId
 * @param {string} userId — authenticated user (must be toUserId)
 * @returns {Promise<object>} updated payment
 * @throws {AppError} PAYMENT_NOT_FOUND | FORBIDDEN
 */
export async function acceptPayment(paymentId, userId) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      group: {
        select: { id: true, ownerId: true, balanceMode: true, status: true },
      },
    },
  });

  if (!payment) {
    throw new AppError('PAYMENT_NOT_FOUND', 404, 'Payment not found');
  }

  // Only the payment receiver can accept
  if (payment.toUserId !== userId) {
    throw new AppError(
      'FORBIDDEN',
      403,
      'Only the payment receiver can accept',
    );
  }

  // Payment must be PENDING
  if (payment.status !== 'PENDING') {
    throw new AppError(
      'INVALID_OPERATION',
      400,
      'Payment is not in PENDING status',
    );
  }

  return prisma.payment.update({
    where: { id: paymentId },
    data: { status: 'ACCEPTED' },
    include: {
      fromUser: {
        select: { id: true, email: true, nickName: true },
      },
      toUser: {
        select: { id: true, email: true, nickName: true },
      },
    },
  });
}

/**
 * Reject a PENDING payment. Only the payment receiver (toUserId) can reject.
 *
 * @param {string} paymentId
 * @param {string} userId — authenticated user (must be toUserId)
 * @param {string} [rejectionReason] — optional reason for rejection
 * @returns {Promise<object>} updated payment
 * @throws {AppError} PAYMENT_NOT_FOUND | FORBIDDEN
 */
export async function rejectPayment(paymentId, userId, rejectionReason) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      group: {
        select: { id: true, ownerId: true, balanceMode: true, status: true },
      },
    },
  });

  if (!payment) {
    throw new AppError('PAYMENT_NOT_FOUND', 404, 'Payment not found');
  }

  // Only the payment receiver can reject
  if (payment.toUserId !== userId) {
    throw new AppError(
      'FORBIDDEN',
      403,
      'Only the payment receiver can reject',
    );
  }

  // Payment must be PENDING
  if (payment.status !== 'PENDING') {
    throw new AppError(
      'INVALID_OPERATION',
      400,
      'Payment is not in PENDING status',
    );
  }

  return prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: 'REJECTED',
      rejectionReason: rejectionReason || null,
    },
    include: {
      fromUser: {
        select: { id: true, email: true, nickName: true },
      },
      toUser: {
        select: { id: true, email: true, nickName: true },
      },
    },
  });
}
