import prisma from '../lib/prisma.js';
import { AppError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
//  Group Service
// ---------------------------------------------------------------------------
//  Domain logic for group CRUD. Every function is an async named export —
//  no classes, no instantiation, matching the existing service pattern.
// ---------------------------------------------------------------------------

/**
 * Create a new group and add the creator as an ACTIVE member.
 *
 * @param {{ name: string, currency: string, balanceMode: string, ownerId: string }} input
 * @returns {Promise<{ id: string, name: string, currency: string, balanceMode: string, ownerId: string }>}
 */
export async function createGroup({ name, currency, balanceMode, ownerId }) {
  const group = await prisma.group.create({
    data: {
      name,
      currency,
      balanceMode,
      ownerId,
      members: {
        create: {
          userId: ownerId,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      },
    },
    select: {
      id: true,
      name: true,
      currency: true,
      balanceMode: true,
      ownerId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return group;
}

/**
 * Get a single group by ID with its owner and members included.
 *
 * Does NOT check membership — the controller enforces access control.
 *
 * @param {string} groupId
 * @returns {Promise<object>} group with owner and members
 * @throws {AppError} NOT_FOUND
 */
export async function getGroupById(groupId) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      owner: {
        select: { id: true, email: true, nickName: true },
      },
      members: {
        include: {
          user: {
            select: { id: true, email: true, nickName: true },
          },
        },
      },
    },
  });

  if (!group) {
    throw new AppError('NOT_FOUND', 404, 'Group not found');
  }

  return group;
}

/**
 * List all groups where the user is an ACTIVE member.
 *
 * @param {string} userId
 * @returns {Promise<Array<{ id: string, name: string, currency: string, balanceMode: string, ownerId: string, owner: object }>>}
 */
export async function getUserGroups(userId) {
  const memberships = await prisma.groupMember.findMany({
    where: {
      userId,
      status: 'ACTIVE',
    },
    include: {
      group: {
        include: {
          owner: {
            select: { id: true, email: true, nickName: true },
          },
        },
      },
    },
    orderBy: { group: { createdAt: 'desc' } },
  });

  return memberships.map((m) => ({
    id: m.group.id,
    name: m.group.name,
    currency: m.group.currency,
    balanceMode: m.group.balanceMode,
    ownerId: m.group.ownerId,
    owner: m.group.owner,
    createdAt: m.group.createdAt,
    updatedAt: m.group.updatedAt,
  }));
}

/**
 * Update group metadata. Only the owner can update.
 *
 * @param {string} groupId
 * @param {{ name?: string, currency?: string, balanceMode?: string }} data
 * @param {string} userId — the requesting user
 * @returns {Promise<object>} updated group
 * @throws {AppError} NOT_FOUND | FORBIDDEN
 */
export async function updateGroup(groupId, data, userId) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });

  if (!group) {
    throw new AppError('NOT_FOUND', 404, 'Group not found');
  }

  if (group.ownerId !== userId) {
    throw new AppError('FORBIDDEN', 403, 'Only owner can edit group');
  }

  const updated = await prisma.group.update({
    where: { id: groupId },
    data,
    select: {
      id: true,
      name: true,
      currency: true,
      balanceMode: true,
      ownerId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return updated;
}

/**
 * Delete a group. Only the owner can delete.
 *
 * Prisma onDelete: Cascade on GroupMember handles membership cleanup.
 *
 * @param {string} groupId
 * @param {string} userId — the requesting user
 * @throws {AppError} NOT_FOUND | FORBIDDEN
 */
export async function deleteGroup(groupId, userId) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });

  if (!group) {
    throw new AppError('NOT_FOUND', 404, 'Group not found');
  }

  if (group.ownerId !== userId) {
    throw new AppError('FORBIDDEN', 403, 'Only owner can delete group');
  }

  await prisma.group.delete({ where: { id: groupId } });
}
