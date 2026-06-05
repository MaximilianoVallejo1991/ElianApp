import * as membershipService from '../services/membership.service.js';

// ---------------------------------------------------------------------------
//  Membership Controller
// ---------------------------------------------------------------------------
//  Request / response layer for group membership lifecycle.
//  Express 5 automatically forwards rejections from async handlers to the
//  error middleware — no manual try/catch required.
//
//  All handlers assume req.user is set by the authenticate middleware.
// ---------------------------------------------------------------------------

/**
 * POST /groups/:groupId/invite  (PROTECTED, owner only)
 *
 * Body validated by Zod middleware before this handler runs.
 * The invitee is identified by email OR nickName.
 */
export async function invite(req, res) {
  const { groupId } = req.params;
  const invitation = await membershipService.inviteMember(
    groupId,
    req.body, // { email } or { nickName } — already validated by Zod
    req.user.userId,
  );
  res.status(201).json(invitation);
}

/**
 * POST /groups/:groupId/accept  (PROTECTED)
 *
 * The authenticated user accepts their own pending invitation.
 */
export async function accept(req, res) {
  const { groupId } = req.params;
  const membership = await membershipService.acceptInvitation(
    groupId,
    req.user.userId,
  );
  res.status(200).json(membership);
}

/**
 * POST /groups/:groupId/reject  (PROTECTED)
 *
 * The authenticated user rejects their own pending invitation.
 * The membership record is deleted entirely.
 */
export async function reject(req, res) {
  const { groupId } = req.params;
  await membershipService.rejectInvitation(groupId, req.user.userId);
  res.status(204).end();
}

/**
 * DELETE /groups/:groupId/members/:userId  (PROTECTED, owner only)
 *
 * Owner removes a specific member. Soft-deletes by setting status to REMOVED.
 * The owner cannot remove themselves.
 */
export async function removeMember(req, res) {
  const { groupId, userId: targetUserId } = req.params;
  await membershipService.removeMember(groupId, targetUserId, req.user.userId);
  res.status(204).end();
}

/**
 * POST /groups/:groupId/leave  (PROTECTED)
 *
 * The authenticated user leaves the group. Owners cannot leave.
 */
export async function leave(req, res) {
  const { groupId } = req.params;
  await membershipService.leaveGroup(groupId, req.user.userId);
  res.status(200).json({ message: 'Left group successfully' });
}

/**
 * GET /groups/:groupId/members  (PROTECTED)
 *
 * Returns all ACTIVE members of a group.
 */
export async function getMembers(req, res) {
  const { groupId } = req.params;
  const members = await membershipService.getGroupMembers(groupId);
  res.status(200).json(members);
}
