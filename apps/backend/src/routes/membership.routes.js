import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { inviteSchema } from '../schemas/group.schemas.js';
import * as membershipController from '../controllers/membership.controller.js';

// ---------------------------------------------------------------------------
//  Membership Routes
// ---------------------------------------------------------------------------
//  All routes are mounted under /groups by index.js (prefixed with groupId).
//
//  Middleware order: validate (body) → authenticate (JWT cookie) → handler
//  Ownership checks are enforced in the service layer.
// ---------------------------------------------------------------------------

const router = Router({ mergeParams: true });

// --- All routes protected ---------------------------------------------------
router.use(authenticate);

// POST /groups/:groupId/invite
// Owner invites a user by email or nickName. Creates PENDING membership.
router.post('/invite', validate(inviteSchema), membershipController.invite);

// POST /groups/:groupId/accept
// User accepts their own pending invitation. Sets ACTIVE + joinedAt.
router.post('/accept', membershipController.accept);

// POST /groups/:groupId/reject
// User rejects their own pending invitation. Deletes membership record.
router.post('/reject', membershipController.reject);

// DELETE /groups/:groupId/members/:userId
// Owner removes a member (soft-delete: status → REMOVED).
router.delete('/members/:userId', membershipController.removeMember);

// POST /groups/:groupId/members/:userId/freeze
// Owner freezes a member (isFrozen: true). Frozen members cannot create expenses.
router.post('/members/:userId/freeze', membershipController.freeze);

// POST /groups/:groupId/members/:userId/unfreeze
// Owner unfreezes a member (isFrozen: false).
router.post('/members/:userId/unfreeze', membershipController.unfreeze);

// POST /groups/:groupId/leave
// Member leaves the group. Owner cannot leave.
router.post('/leave', membershipController.leave);

// GET /groups/:groupId/members
// List all ACTIVE members of a group.
router.get('/members', membershipController.getMembers);

export default router;
