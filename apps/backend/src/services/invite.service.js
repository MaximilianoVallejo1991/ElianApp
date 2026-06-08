import crypto from 'node:crypto';
import prisma from '../lib/prisma.js';
import { AppError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
//  Invite Service
// ---------------------------------------------------------------------------
//  Domain logic for invitation links. Supports generating expiring invite
//  tokens (owner only) and validating consumed tokens during registration.
// ---------------------------------------------------------------------------

const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Generate an invite link for a group.
 *
 * Verifies the requester is the group owner, creates a unique random token
 * stored on the group with a 7-day expiry, and returns the full invite URL.
 *
 * @param {string} groupId
 * @param {string} userId — the requesting user (must be owner)
 * @returns {Promise<{ url: string, token: string, expiresAt: Date }>}
 * @throws {AppError} NOT_FOUND | FORBIDDEN
 */
export async function generateInviteLink(groupId, userId) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });

  if (!group) {
    throw new AppError('NOT_FOUND', 404, 'Group not found');
  }

  if (group.ownerId !== userId) {
    throw new AppError('FORBIDDEN', 403, 'Only the group owner can generate invite links');
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS);

  await prisma.group.update({
    where: { id: groupId },
    data: {
      inviteToken: token,
      inviteExpires: expiresAt,
    },
  });

  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  return {
    url: `${baseUrl}/register?invite=${token}`,
    token,
    expiresAt,
  };
}

/**
 * Validate an invite token.
 *
 * Looks up the group by token, checks expiry, and returns group info
 * for the registration page to display.
 *
 * @param {string} token
 * @returns {Promise<{ groupId: string, groupName: string, currency: string }>}
 * @throws {AppError} INVALID_TOKEN | TOKEN_EXPIRED
 */
export async function validateInviteToken(token) {
  const group = await prisma.group.findUnique({
    where: { inviteToken: token },
    select: {
      id: true,
      name: true,
      currency: true,
      inviteToken: true,
      inviteExpires: true,
    },
  });

  if (!group || group.inviteToken !== token) {
    throw new AppError('INVALID_TOKEN', 404, 'Invalid or expired invite link');
  }

  if (group.inviteExpires && new Date() > group.inviteExpires) {
    throw new AppError('TOKEN_EXPIRED', 410, 'This invite link has expired');
  }

  return {
    groupId: group.id,
    groupName: group.name,
    currency: group.currency,
  };
}

/**
 * Consume an invite token during registration.
 *
 * Finds the group by token, validates it, creates a GroupMember record
 * with ACTIVE status for the new user, and clears the token from the group.
 *
 * @param {string} token
 * @param {string} userId — the newly registered user
 * @returns {Promise<{ groupId: string, groupName: string }>}
 * @throws {AppError} INVALID_TOKEN | TOKEN_EXPIRED | ALREADY_MEMBER
 */
export async function consumeInviteToken(token, userId) {
  const group = await prisma.group.findUnique({
    where: { inviteToken: token },
  });

  if (!group) {
    throw new AppError('INVALID_TOKEN', 404, 'Invalid or expired invite link');
  }

  if (group.inviteExpires && new Date() > group.inviteExpires) {
    throw new AppError('TOKEN_EXPIRED', 410, 'This invite link has expired');
  }

  // Check if the user is already a member of this group
  const existing = await prisma.groupMember.findUnique({
    where: {
      groupId_userId: {
        groupId: group.id,
        userId,
      },
    },
  });

  if (existing) {
    // If they were REMOVED, re-activate them
    if (existing.status === 'REMOVED') {
      await prisma.groupMember.update({
        where: {
          groupId_userId: { groupId: group.id, userId },
        },
        data: {
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      });
    } else {
      throw new AppError('ALREADY_MEMBER', 400, 'User is already a member of this group');
    }
  } else {
    // Create a new ACTIVE membership
    await prisma.groupMember.create({
      data: {
        groupId: group.id,
        userId,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });
  }

  // Clear the invite token so it can't be reused
  await prisma.group.update({
    where: { id: group.id },
    data: {
      inviteToken: null,
      inviteExpires: null,
    },
  });

  return {
    groupId: group.id,
    groupName: group.name,
  };
}
