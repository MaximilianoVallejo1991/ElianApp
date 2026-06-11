import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as periodController from '../controllers/period.controller.js';

// ---------------------------------------------------------------------------
//  Period Routes
// ---------------------------------------------------------------------------
//  Mounted under /groups/:groupId by index.js.
//  mergeParams: true gives access to req.params.groupId.
//
//  All routes require authentication and group membership (enforced in service).
// ---------------------------------------------------------------------------

const router = Router({ mergeParams: true });

// All routes protected
router.use(authenticate);

// GET /groups/:groupId/periods
// List all periods for the group, newest first.
router.get('/periods', periodController.list);

// GET /groups/:groupId/periods/:periodId
// Get a single period's details.
router.get('/periods/:periodId', periodController.getOne);

// GET /groups/:groupId/periods/:periodId/balances
// Get balances for a specific period.
router.get('/periods/:periodId/balances', periodController.getBalances);

// GET /groups/:groupId/periods/:periodId/expenses
// Get all expenses for a specific period.
router.get('/periods/:periodId/expenses', periodController.getExpenses);

// GET /groups/:groupId/periods/:periodId/payments
// Get all payments for a specific period.
router.get('/periods/:periodId/payments', periodController.getPayments);

export default router;