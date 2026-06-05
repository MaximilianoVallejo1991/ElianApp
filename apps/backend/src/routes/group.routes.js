import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  createGroupSchema,
  updateGroupSchema,
} from '../schemas/group.schemas.js';
import * as groupController from '../controllers/group.controller.js';

// ---------------------------------------------------------------------------
//  Group Routes
// ---------------------------------------------------------------------------
//  All routes are mounted under /groups by index.js.
//
//  Middleware order: validate (body) → authenticate (JWT cookie) → handler
//  All routes are protected. Ownership checks are enforced in the service layer.
// ---------------------------------------------------------------------------

const router = Router();

// --- All routes protected ---------------------------------------------------
router.use(authenticate);

// POST /groups
// Create a new group. Creator becomes owner + ACTIVE member.
router.post('/', validate(createGroupSchema), groupController.create);

// GET /groups
// List all groups where the authenticated user is an ACTIVE member.
router.get('/', groupController.getMine);

// GET /groups/:id
// Get group details with members. Only members can view.
router.get('/:id', groupController.getOne);

// PUT /groups/:id
// Update group metadata. Only owner can update.
router.put('/:id', validate(updateGroupSchema), groupController.update);

// DELETE /groups/:id
// Delete group. Only owner can delete. Prisma cascade removes memberships.
router.delete('/:id', groupController.remove);

export default router;
