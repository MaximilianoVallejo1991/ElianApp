import * as paymentService from '../services/payment.service.js';

// ---------------------------------------------------------------------------
//  Payment Controller
// ---------------------------------------------------------------------------
//  Request / response layer. Delegates to paymentService for domain logic.
//  Express 5 automatically forwards rejections from async handlers to the
//  error middleware — no manual try/catch required.
//
//  All handlers assume:
//    - req.user is set by the authenticate middleware
//    - req.params.groupId is available from mergeParams routing
// ---------------------------------------------------------------------------

/**
 * POST /groups/:groupId/payments  (PROTECTED)
 *
 * Body validated by Zod middleware before this handler runs.
 * fromUserId in body must match the authenticated user (enforced in service).
 */
export async function create(req, res) {
  const payment = await paymentService.createPayment(
    req.params.groupId,
    req.body.fromUserId,
    req.body.toUserId,
    req.body.amount,
    req.body.method,
    req.body.paidAt,
    req.user.userId,
  );
  res.status(201).json(payment);
}

/**
 * GET /groups/:groupId/payments  (PROTECTED)
 *
 * Returns paginated payments for the group, ordered by paidAt descending.
 * Query params: `limit` (default: all), `offset` (default: 0).
 * For STATIC groups: `periodId` filters by period, `includeHistory=true` lists all.
 * Response: `{ data: Payment[], total: number, hasMore: boolean }`
 */
export async function list(req, res) {
  const limit = parseInt(req.query.limit, 10) || undefined;
  const offset = parseInt(req.query.offset, 10) || undefined;
  const periodId = req.query.periodId || undefined;
  const includeHistory = req.query.includeHistory === 'true';
  const result = await paymentService.listPayments(
    req.params.groupId,
    req.user.userId,
    { limit, offset, periodId, includeHistory },
  );
  res.status(200).json(result);
}

/**
 * DELETE /groups/:groupId/payments/:id  (PROTECTED)
 *
 * Only the payment sender can delete. Ownership checked in the service.
 * Returns 204 No Content on success.
 */
export async function remove(req, res) {
  await paymentService.deletePayment(req.params.id, req.user.userId);
  res.status(204).end();
}
