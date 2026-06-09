import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  createExpenseSchema,
  updateExpenseSchema,
  createItemSchema,
  updateItemSchema,
} from '../schemas/expense.schemas.js';
import * as expenseController from '../controllers/expense.controller.js';
import * as balanceController from '../controllers/balance.controller.js';

// ---------------------------------------------------------------------------
//  Expense Routes
// ---------------------------------------------------------------------------
//  Mounted under /groups/:groupId by index.js.
//  mergeParams: true gives access to req.params.groupId.
//
//  Middleware order: validate (body) → authenticate (JWT cookie) → handler
//  All routes are protected. Ownership checks are enforced in the service layer.
// ---------------------------------------------------------------------------

const router = Router({ mergeParams: true });

// --- All routes protected ---------------------------------------------------
router.use(authenticate);

// POST /groups/:groupId/expenses
// Create an expense. Body validated by Zod. Split math validated by service.
router.post(
  '/expenses',
  validate(createExpenseSchema),
  expenseController.create,
);

// GET /groups/:groupId/expenses
// List all expenses for the group, newest first.
router.get('/expenses', expenseController.list);

// GET /groups/:groupId/expenses/:id
// Get a single expense with all splits populated.
router.get('/expenses/:id', expenseController.getOne);

// PUT /groups/:groupId/expenses/:id
// Update an expense. Only payer/creator can update.
router.put(
  '/expenses/:id',
  validate(updateExpenseSchema),
  expenseController.update,
);

// DELETE /groups/:groupId/expenses/:id
// Delete an expense (hard delete). Only payer/creator can delete.
router.delete('/expenses/:id', expenseController.remove);

// POST /groups/:groupId/expenses/:id/items
// Report (upsert) an item for a COLLECTIVE expense.
router.post(
  '/expenses/:id/items',
  validate(createItemSchema),
  expenseController.addItem,
);

// PATCH /groups/:groupId/expenses/:id/items/:itemId
// Update an existing item on a COLLECTIVE expense.
router.patch(
  '/expenses/:id/items/:itemId',
  validate(updateItemSchema),
  expenseController.updateItem,
);

// DELETE /groups/:groupId/expenses/:id/items/:itemId
// Delete an item from a COLLECTIVE expense.
router.delete('/expenses/:id/items/:itemId', expenseController.removeItem);

// GET /groups/:groupId/expenses/:id/items/status
// Get item reporting status for a COLLECTIVE expense.
router.get('/expenses/:id/items/status', expenseController.getItemStatus);

// POST /groups/:groupId/expenses/:id/unlock
// Unlock a COMPLETED COLLECTIVE expense for further item edits.
router.post('/expenses/:id/unlock', expenseController.unlock);

// --- Balance route (mounted under the same /groups/:groupId prefix) ---------

// GET /groups/:groupId/balances
// Get net balances for all active members. Only for DYNAMIC groups.
// Computed on every read from expenses, splits, and payments.
router.get('/balances', balanceController.getBalances);

export default router;
