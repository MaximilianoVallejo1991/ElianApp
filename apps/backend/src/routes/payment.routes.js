import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { createPaymentSchema } from '../schemas/expense.schemas.js';
import * as paymentController from '../controllers/payment.controller.js';
import * as paymentService from '../services/payment.service.js';

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

// POST /groups/:groupId/payments/:id/accept
// Accept a PENDING payment. Only toUserId can accept.
router.post('/payments/:id/accept', async (req, res) => {
  const payment = await paymentService.acceptPayment(
    req.params.id,
    req.user.userId,
  );
  res.status(200).json(payment);
});

// POST /groups/:groupId/payments/:id/reject
// Reject a PENDING payment. Only toUserId can reject.
router.post('/payments/:id/reject', async (req, res) => {
  const payment = await paymentService.rejectPayment(
    req.params.id,
    req.user.userId,
    req.body.rejectionReason,
  );
  res.status(200).json(payment);
});

// DELETE /groups/:groupId/payments/:id
// Delete a payment. Only the sender can delete.
router.delete('/payments/:id', paymentController.remove);

export default router;
