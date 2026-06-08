import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { createPaymentSchema } from '../schemas/expense.schemas.js';
import * as paymentController from '../controllers/payment.controller.js';

// ---------------------------------------------------------------------------
//  Payment Routes
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

// POST /groups/:groupId/payments
// Record a payment. fromUserId must match authenticated user.
router.post(
  '/payments',
  validate(createPaymentSchema),
  paymentController.create,
);

// GET /groups/:groupId/payments
// List all payments for the group, newest first.
router.get('/payments', paymentController.list);

// DELETE /groups/:groupId/payments/:id
// Delete a payment. Only the sender can delete.
router.delete('/payments/:id', paymentController.remove);

export default router;
