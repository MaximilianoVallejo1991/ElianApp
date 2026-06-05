import * as groupService from '../services/group.service.js';

// ---------------------------------------------------------------------------
//  Group Controller
// ---------------------------------------------------------------------------
//  Request / response layer. Delegates to groupService for domain logic.
//  Express 5 automatically forwards rejections from async handlers to the
//  error middleware — no manual try/catch required.
//
//  All handlers assume req.user is set by the authenticate middleware.
// ---------------------------------------------------------------------------

/**
 * POST /groups  (PROTECTED)
 *
 * Body validated by Zod middleware before this handler runs.
 * The creator automatically becomes the group owner.
 */
export async function create(req, res) {
  const { name, currency, balanceMode } = req.body;
  const group = await groupService.createGroup({
    name,
    currency,
    balanceMode,
    ownerId: req.user.userId,
  });
  res.status(201).json(group);
}

/**
 * GET /groups  (PROTECTED)
 *
 * Returns all groups where the authenticated user is an ACTIVE member.
 */
export async function getMine(req, res) {
  const groups = await groupService.getUserGroups(req.user.userId);
  res.status(200).json(groups);
}

/**
 * GET /groups/:id  (PROTECTED)
 *
 * Returns group details including members. Only group members can view.
 * Non-members receive 404 (no group existence leak).
 */
export async function getOne(req, res) {
  const group = await groupService.getGroupById(req.params.id);

  // Enforce membership: only ACTIVE members can view group details
  const isMember = group.members.some(
    (m) => m.userId === req.user.userId && m.status === 'ACTIVE',
  );

  if (!isMember) {
    res.status(404).json({
      error: 'Group not found',
      code: 'NOT_FOUND',
    });
    return;
  }

  res.status(200).json(group);
}

/**
 * PUT /groups/:id  (PROTECTED)
 *
 * Only the group owner can update. Ownership checked in the service.
 */
export async function update(req, res) {
  const group = await groupService.updateGroup(
    req.params.id,
    req.body,
    req.user.userId,
  );
  res.status(200).json(group);
}

/**
 * DELETE /groups/:id  (PROTECTED)
 *
 * Only the group owner can delete. Ownership checked in the service.
 * Prisma cascade removes all memberships automatically.
 */
export async function remove(req, res) {
  await groupService.deleteGroup(req.params.id, req.user.userId);
  res.status(204).end();
}
