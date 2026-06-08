import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as inviteController from '../controllers/invite.controller.js';

// ---------------------------------------------------------------------------
//  Invite Routes
// ---------------------------------------------------------------------------
//  Two mount points in index.js:
//    - /groups/:groupId/invite-link  (protected — requires auth as owner)
//    - /invites                       (public — token validation)
//
//  This single router handles both via mergeParams.
// ---------------------------------------------------------------------------

const router = Router({ mergeParams: true });

// --- Protected: generate invite link (owner only) ----------------------------
// POST /groups/:groupId/invite-link
router.post('/invite-link', authenticate, inviteController.generate);

// --- Public: validate invite token -------------------------------------------
// GET /invites/:token
router.get('/:token', inviteController.validate);

// --- Protected: accept invite (logged-in user) ------------------------------
// POST /invites/:token/accept
router.post('/:token/accept', authenticate, inviteController.accept);

export default router;
