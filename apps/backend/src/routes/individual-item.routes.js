import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  createItemSchema,
  updateItemSchema,
} from '../schemas/collective-expense.schemas.js';
import * as individualItemController from '../controllers/individual-item.controller.js';

// ---------------------------------------------------------------------------
//  Individual Item Routes
// ---------------------------------------------------------------------------
//  Mounted under /groups/:groupId/collective-expenses/:id by index.js.
//  mergeParams: true gives access to req.params.groupId and req.params.id
//  (the collective expense ID).
//
//  All routes are protected. Ownership checks are enforced in the service layer.
// ---------------------------------------------------------------------------

const router = Router({ mergeParams: true });

// --- All routes protected ---------------------------------------------------
router.use(authenticate);

// POST /groups/:groupId/collective-expenses/:id/items
router.post(
  '/items',
  validate(createItemSchema),
  individualItemController.add,
);

// PUT /groups/:groupId/collective-expenses/:id/items/:itemId
router.put(
  '/items/:itemId',
  validate(updateItemSchema),
  individualItemController.update,
);

// DELETE /groups/:groupId/collective-expenses/:id/items/:itemId
router.delete('/items/:itemId', individualItemController.remove);

export default router;
