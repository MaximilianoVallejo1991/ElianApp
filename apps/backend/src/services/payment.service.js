import prisma from '../lib/prisma.js';
import { AppError } from '../utils/errors.js';

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
 * 6. Create Payment record.
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
  await requireActiveMember(groupId, userId);

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

  // 7. Create payment
  const payment = await prisma.payment.create({
    data: {
      groupId,
      fromUserId,
      toUserId,
      amount,
      method: method || null,
      paidAt: paidAt ? new Date(paidAt) : new Date(),
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
 * When `limit` and `offset` are provided, returns a paginated response
 * with `{ data, total, hasMore }`. Otherwise returns the raw array
 * (backward-compatible).
 *
 * @param {string} groupId
 * @param {string} userId — authenticated user
 * @param {{ limit?: number, offset?: number }} [opts]
 * @returns {Promise<Array<object>|{ data: Array<object>, total: number, hasMore: boolean }>>}
 */
export async function listPayments(groupId, userId, { limit, offset } = {}) {
  await requireActiveMember(groupId, userId);

  const [total, payments] = await Promise.all([
    prisma.payment.count({ where: { groupId, deletedAt: null } }),
    prisma.payment.findMany({
      where: { groupId, deletedAt: null },
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

  // Only the sender can delete
  if (payment.fromUserId !== userId) {
    throw new AppError(
      'FORBIDDEN',
      403,
      'Only the sender can delete this payment',
    );
  }

  await prisma.payment.update({
    where: { id: paymentId },
    data: { deletedAt: new Date() },
  });
}
