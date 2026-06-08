import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  createCollectiveExpenseSchema,
  updateCollectiveExpenseSchema,
  unlockSchema,
} from '../schemas/collective-expense.schemas.js';
import * as collectiveExpenseController from '../controllers/collective-expense.controller.js';

// ---------------------------------------------------------------------------
//  Collective Expense Routes
// ---------------------------------------------------------------------------
//  Mounted under /groups/:groupId/collective-expenses by index.js.
//  mergeParams: true gives access to req.params.groupId.
//
//  All routes are protected. Ownership checks are enforced in the service layer.
// ---------------------------------------------------------------------------

const router = Router({ mergeParams: true });

// --- All routes protected ---------------------------------------------------
router.use(authenticate);

// POST /groups/:groupId/collective-expenses
router.post(
  '/',
  validate(createCollectiveExpenseSchema),
  collectiveExpenseController.create,
);

// GET /groups/:groupId/collective-expenses
router.get('/', collectiveExpenseController.list);

// GET /groups/:groupId/collective-expenses/:id
router.get('/:id', collectiveExpenseController.getOne);

// PUT /groups/:groupId/collective-expenses/:id
router.put(
  '/:id',
  validate(updateCollectiveExpenseSchema),
  collectiveExpenseController.update,
);

// DELETE /groups/:groupId/collective-expenses/:id
router.delete('/:id', collectiveExpenseController.remove);

// POST /groups/:groupId/collective-expenses/:id/unlock
router.post(
  '/:id/unlock',
  validate(unlockSchema),
  collectiveExpenseController.unlock,
);

export default router;
