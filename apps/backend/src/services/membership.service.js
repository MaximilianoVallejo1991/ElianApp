import prisma from '../lib/prisma.js';
import { AppError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
//  Membership Service
// ---------------------------------------------------------------------------
//  Domain logic for group membership lifecycle: invite, accept, reject,
//  remove, and leave. Every function is an async named export.
// ---------------------------------------------------------------------------

/**
 * Invite a user to a group. Only the group owner can invite.
 *
 * Finds the target user by email OR nickName, checks they are not already
 * a member, and creates a PENDING membership record.
 *
 * If a REMOVED membership already exists for this user, it is reactivated
 * by updating the status back to PENDING (re-invite).
 *
 * @param {string} groupId
 * @param {{ email?: string, nickName?: string }} target — either email or nickName
 * @param {string} inviterId — the requesting (owner) user
 * @returns {Promise<{ userId: string, groupId: string, status: string }>}
 * @throws {AppError} NOT_FOUND | FORBIDDEN | USER_NOT_FOUND | ALREADY_MEMBER
 */
export async function inviteMember(groupId, target, inviterId) {
  // -- Ownership check -------------------------------------------------------
  const group = await prisma.group.findUnique({ where: { id: groupId } });

  if (!group) {
    throw new AppError('NOT_FOUND', 404, 'Group not found');
  }

  if (group.ownerId !== inviterId) {
    throw new AppError('FORBIDDEN', 403, 'Only owner can invite members');
  }

  // -- Find target user -------------------------------------------------------
  const whereClause = target.email
    ? { email: target.email }
    : { nickName: target.nickName };

  const targetUser = await prisma.user.findUnique({ where: whereClause });

  if (!targetUser) {
    throw new AppError('USER_NOT_FOUND', 404, 'User not found');
  }

  // -- Check existing membership ----------------------------------------------
  const existing = await prisma.groupMember.findUnique({
    where: {
      groupId_userId: {
        groupId,
        userId: targetUser.id,
      },
    },
  });

  if (existing) {
    if (existing.status === 'ACTIVE' || existing.status === 'PENDING') {
      throw new AppError('ALREADY_MEMBER', 400, 'User is already a member');
    }

    // REMOVED status — re-invite by resetting to PENDING
    const reactivated = await prisma.groupMember.update({
      where: {
        groupId_userId: {
          groupId,
          userId: targetUser.id,
        },
      },
      data: {
        status: 'PENDING',
        joinedAt: null,
      },
    });

    return {
      userId: reactivated.userId,
      groupId: reactivated.groupId,
      status: reactivated.status,
    };
  }

  // -- Create pending membership ----------------------------------------------
  const membership = await prisma.groupMember.create({
    data: {
      groupId,
      userId: targetUser.id,
      status: 'PENDING',
    },
  });

  return {
    userId: membership.userId,
    groupId: membership.groupId,
    status: membership.status,
  };
}

/**
 * Accept a pending invitation. Sets status to ACTIVE and records joinedAt.
 *
 * @param {string} groupId
 * @param {string} userId — the accepting user
 * @returns {Promise<{ userId: string, groupId: string, status: string, joinedAt: Date }>}
 * @throws {AppError} NOT_FOUND — group not found or no pending invitation
 */
export async function acceptInvitation(groupId, userId) {
  // Verify the group exists
  const group = await prisma.group.findUnique({ where: { id: groupId } });

  if (!group) {
    throw new AppError('NOT_FOUND', 404, 'Group not found');
  }

  // Find the pending membership
  const membership = await prisma.groupMember.findUnique({
    where: {
      groupId_userId: { groupId, userId },
    },
  });

  if (!membership || membership.status !== 'PENDING') {
    throw new AppError('NOT_FOUND', 404, 'No pending invitation found');
  }

  const updated = await prisma.groupMember.update({
    where: {
      groupId_userId: { groupId, userId },
    },
    data: {
      status: 'ACTIVE',
      joinedAt: new Date(),
    },
  });

  return {
    userId: updated.userId,
    groupId: updated.groupId,
    status: updated.status,
    joinedAt: updated.joinedAt,
  };
}

/**
 * Reject a pending invitation. Deletes the membership record entirely.
 *
 * @param {string} groupId
 * @param {string} userId — the rejecting user
 * @throws {AppError} NOT_FOUND — group not found or no pending invitation
 */
export async function rejectInvitation(groupId, userId) {
  // Verify the group exists
  const group = await prisma.group.findUnique({ where: { id: groupId } });

  if (!group) {
    throw new AppError('NOT_FOUND', 404, 'Group not found');
  }

  const membership = await prisma.groupMember.findUnique({
    where: {
      groupId_userId: { groupId, userId },
    },
  });

  if (!membership || membership.status !== 'PENDING') {
    throw new AppError('NOT_FOUND', 404, 'No pending invitation found');
  }

  await prisma.groupMember.delete({
    where: {
      groupId_userId: { groupId, userId },
    },
  });
}

/**
 * Remove a member (soft-delete: sets status to REMOVED).
 * Only the group owner can remove members. The owner cannot remove themselves.
 *
 * @param {string} groupId
 * @param {string} targetUserId — the member being removed
 * @param {string} requesterId — the user requesting the removal (must be owner)
 * @throws {AppError} NOT_FOUND | FORBIDDEN | CANNOT_REMOVE_OWNER
 */
export async function removeMember(groupId, targetUserId, requesterId) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });

  if (!group) {
    throw new AppError('NOT_FOUND', 404, 'Group not found');
  }

  if (group.ownerId !== requesterId) {
    throw new AppError('FORBIDDEN', 403, 'Only owner can remove members');
  }

  if (targetUserId === group.ownerId) {
    throw new AppError(
      'CANNOT_REMOVE_OWNER',
      400,
      'Owner cannot remove themselves; transfer ownership or delete group',
    );
  }

  // Verify the target is actually a member (not just garbage userId)
  const membership = await prisma.groupMember.findUnique({
    where: {
      groupId_userId: { groupId, userId: targetUserId },
    },
  });

  if (!membership) {
    throw new AppError('NOT_FOUND', 404, 'Member not found in group');
  }

  await prisma.groupMember.update({
    where: {
      groupId_userId: { groupId, userId: targetUserId },
    },
    data: {
      status: 'REMOVED',
    },
  });
}

/**
 * Leave a group. Soft-deletes the membership (sets status to REMOVED).
 * Owners cannot leave — they must transfer ownership or delete the group.
 * Members with a negative net balance cannot leave until debts are settled.
 *
 * @param {string} groupId
 * @param {string} userId — the user leaving
 * @throws {AppError} NOT_FOUND | CANNOT_LEAVE_AS_OWNER | CANNOT_LEAVE_WITH_DEBTS
 */
export async function leaveGroup(groupId, userId) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });

  if (!group) {
    throw new AppError('NOT_FOUND', 404, 'Group not found');
  }

  if (group.ownerId === userId) {
    throw new AppError(
      'CANNOT_LEAVE_AS_OWNER',
      400,
      'Owner cannot leave; transfer ownership or delete group',
    );
  }

  // Verify membership exists and is ACTIVE
  const membership = await prisma.groupMember.findUnique({
    where: {
      groupId_userId: { groupId, userId },
    },
  });

  if (!membership) {
    throw new AppError('NOT_FOUND', 404, 'You are not a member of this group');
  }

  if (membership.status !== 'ACTIVE') {
    throw new AppError('NOT_FOUND', 404, 'You are not an active member of this group');
  }

  // 1. Check for PENDING payments the user has sent (unresolved payments)
  const pendingSent = await prisma.payment.count({
    where: { groupId, fromUserId: userId, status: 'PENDING', deletedAt: null },
  });

  if (pendingSent > 0) {
    throw new AppError(
      'CANNOT_LEAVE_WITH_DEBTS',
      400,
      'Cannot leave group with pending payments; wait for creditor acceptance or delete them',
    );
  }

  // 2. Check net balance — negative balance means member owes money
  // Compute from expenses and payments (same logic as balance.service.js)
  const expenses = await prisma.expense.findMany({
    where: { groupId, deletedAt: null },
    select: { payerId: true, amount: true, splits: { select: { userId: true, amount: true } } },
  });

  const payments = await prisma.payment.findMany({
    where: { groupId, deletedAt: null, status: 'ACCEPTED' },
    select: { fromUserId: true, toUserId: true, amount: true },
  });

  let credits = 0;
  let debits = 0;
  let paymentsSent = 0;
  let paymentsReceived = 0;

  for (const expense of expenses) {
    if (expense.payerId === userId) {
      credits += Number(expense.amount);
    }
    for (const split of expense.splits) {
      if (split.userId === userId) {
        debits += Number(split.amount);
      }
    }
  }

  for (const payment of payments) {
    if (payment.fromUserId === userId) {
      paymentsSent += Number(payment.amount);
    }
    if (payment.toUserId === userId) {
      paymentsReceived += Number(payment.amount);
    }
  }

  const netBalance = credits - debits - paymentsSent + paymentsReceived;

  if (netBalance < 0) {
    throw new AppError(
      'CANNOT_LEAVE_WITH_DEBTS',
      400,
      'Cannot leave group with pending debts; settle first',
    );
  }

  // Soft delete: set status to REMOVED instead of hard-deleting
  await prisma.groupMember.update({
    where: {
      groupId_userId: { groupId, userId },
    },
    data: {
      status: 'REMOVED',
    },
  });
}

/**
 * Freeze a member. Frozen members cannot create new expenses
 * but can still participate in expenses created by others and
 * can register payments to settle debts.
 * Only the group owner can freeze/unfreeze members.
 *
 * @param {string} groupId
 * @param {string} targetUserId — the member being frozen
 * @param {string} requesterId — the user requesting (must be owner)
 * @throws {AppError} NOT_FOUND | FORBIDDEN | CANNOT_FREEZE_SELF
 */
export async function freezeMember(groupId, targetUserId, requesterId) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });

  if (!group) {
    throw new AppError('NOT_FOUND', 404, 'Group not found');
  }

  if (group.ownerId !== requesterId) {
    throw new AppError('FORBIDDEN', 403, 'Only owner can freeze members');
  }

  if (targetUserId === group.ownerId) {
    throw new AppError(
      'CANNOT_FREEZE_SELF',
      400,
      'Owner cannot freeze themselves',
    );
  }

  const membership = await prisma.groupMember.findUnique({
    where: {
      groupId_userId: { groupId, userId: targetUserId },
    },
  });

  if (!membership) {
    throw new AppError('NOT_FOUND', 404, 'Member not found in group');
  }

  if (membership.status !== 'ACTIVE') {
    throw new AppError('INVALID_OPERATION', 400, 'Only active members can be frozen');
  }

  return prisma.groupMember.update({
    where: {
      groupId_userId: { groupId, userId: targetUserId },
    },
    data: { isFrozen: true },
    include: {
      user: { select: { id: true, email: true, nickName: true } },
    },
  });
}

/**
 * Unfreeze a member. Only the group owner can unfreeze.
 *
 * @param {string} groupId
 * @param {string} targetUserId — the member being unfrozen
 * @param {string} requesterId — the user requesting (must be owner)
 * @throws {AppError} NOT_FOUND | FORBIDDEN
 */
export async function unfreezeMember(groupId, targetUserId, requesterId) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });

  if (!group) {
    throw new AppError('NOT_FOUND', 404, 'Group not found');
  }

  if (group.ownerId !== requesterId) {
    throw new AppError('FORBIDDEN', 403, 'Only owner can unfreeze members');
  }

  const membership = await prisma.groupMember.findUnique({
    where: {
      groupId_userId: { groupId, userId: targetUserId },
    },
  });

  if (!membership) {
    throw new AppError('NOT_FOUND', 404, 'Member not found in group');
  }

  return prisma.groupMember.update({
    where: {
      groupId_userId: { groupId, userId: targetUserId },
    },
    data: { isFrozen: false },
    include: {
      user: { select: { id: true, email: true, nickName: true } },
    },
  });
}

/**
 * Get all ACTIVE members of a group.
 *
 * @param {string} groupId
 * @returns {Promise<Array<{ userId: string, groupId: string, status: string, joinedAt: Date, user: object }>>}
 * @throws {AppError} NOT_FOUND
 */
export async function getGroupMembers(groupId) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });

  if (!group) {
    throw new AppError('NOT_FOUND', 404, 'Group not found');
  }

  const members = await prisma.groupMember.findMany({
    where: {
      groupId,
      status: 'ACTIVE',
    },
    include: {
      user: {
        select: { id: true, email: true, nickName: true },
      },
    },
    orderBy: { joinedAt: 'asc' },
  });

  return members.map((m) => ({
    userId: m.userId,
    groupId: m.groupId,
    status: m.status,
    isFrozen: m.isFrozen,
    joinedAt: m.joinedAt,
    user: m.user,
  }));

  return members;
}
