import * as inviteService from '../services/invite.service.js';

// ---------------------------------------------------------------------------
//  Invite Controller
// ---------------------------------------------------------------------------
//  Request / response layer for invitation links.
//  Express 5 automatically forwards rejections from async handlers to the
//  error middleware — no manual try/catch required.
// ---------------------------------------------------------------------------

/**
 * POST /groups/:groupId/invite-link  (PROTECTED, owner only)
 *
 * Generates a shareable invite URL with an expiring token.
 * The authenticated user must be the group owner.
 */
export async function generate(req, res) {
  const { groupId } = req.params;
  const result = await inviteService.generateInviteLink(groupId, req.user.userId);
  res.status(201).json(result);
}

/**
 * GET /invites/:token  (PUBLIC)
 *
 * Validates an invite token and returns group info for the registration page.
 * Returns 404 if the token is invalid; 410 if expired.
 */
export async function validate(req, res) {
  const { token } = req.params;
  const groupInfo = await inviteService.validateInviteToken(token);
  res.status(200).json(groupInfo);
}

/**
 * POST /invites/:token/accept  (PROTECTED — logged-in user)
 *
 * Allows an already-authenticated user to join a group via invite link.
 * Consumes the invite token and creates an ACTIVE GroupMember record.
 */
export async function accept(req, res) {
  const { token } = req.params;
  const userId = req.user.userId;
  const result = await inviteService.consumeInviteToken(token, userId);
  res.status(200).json(result);
}
