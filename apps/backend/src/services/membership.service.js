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
 * Leave a group. Deletes the membership record.
 * Owners cannot leave — they must transfer ownership or delete the group.
 *
 * @param {string} groupId
 * @param {string} userId — the user leaving
 * @throws {AppError} NOT_FOUND | CANNOT_LEAVE_GROUP
 */
export async function leaveGroup(groupId, userId) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });

  if (!group) {
    throw new AppError('NOT_FOUND', 404, 'Group not found');
  }

  if (group.ownerId === userId) {
    throw new AppError(
      'CANNOT_LEAVE_GROUP',
      403,
      'Owner cannot leave; transfer ownership or delete group',
    );
  }

  // Verify membership exists
  const membership = await prisma.groupMember.findUnique({
    where: {
      groupId_userId: { groupId, userId },
    },
  });

  if (!membership) {
    throw new AppError('NOT_FOUND', 404, 'You are not a member of this group');
  }

  await prisma.groupMember.delete({
    where: {
      groupId_userId: { groupId, userId },
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

  return members;
}
