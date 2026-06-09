import * as expenseService from '../services/expense.service.js';
import * as itemReportingService from '../services/item-reporting.service.js';

// ---------------------------------------------------------------------------
//  Expense Controller
// ---------------------------------------------------------------------------
//  Request / response layer. Delegates to expenseService for domain logic.
//  Express 5 automatically forwards rejections from async handlers to the
//  error middleware — no manual try/catch required.
//
//  All handlers assume:
//    - req.user is set by the authenticate middleware
//    - req.params.groupId is available from mergeParams routing
// ---------------------------------------------------------------------------

/**
 * POST /groups/:groupId/expenses  (PROTECTED)
 *
 * Body validated by Zod middleware before this handler runs.
 */
export async function create(req, res) {
  const expense = await expenseService.createExpense(
    req.params.groupId,
    req.body,
    req.user.userId,
  );
  res.status(201).json(expense);
}

/**
 * GET /groups/:groupId/expenses  (PROTECTED)
 *
 * Returns paginated expenses for the group, ordered by createdAt descending.
 * Query params: `limit` (default: all), `offset` (default: 0).
 * Response: `{ data: Expense[], total: number, hasMore: boolean }`
 */
export async function list(req, res) {
  const limit = parseInt(req.query.limit, 10) || undefined;
  const offset = parseInt(req.query.offset, 10) || undefined;
  const result = await expenseService.listExpenses(
    req.params.groupId,
    req.user.userId,
    { limit, offset },
  );
  res.status(200).json(result);
}

/**
 * GET /groups/:groupId/expenses/:id  (PROTECTED)
 *
 * Returns a single expense with all splits, payer, and creator populated.
 */
export async function getOne(req, res) {
  const expense = await expenseService.getExpense(
    req.params.id,
    req.user.userId,
  );
  res.status(200).json(expense);
}

/**
 * PUT /groups/:groupId/expenses/:id  (PROTECTED)
 *
 * Only the payer or creator can update. Ownership checked in the service.
 */
export async function update(req, res) {
  const expense = await expenseService.updateExpense(
    req.params.id,
    req.body,
    req.user.userId,
  );
  res.status(200).json(expense);
}

/**
 * DELETE /groups/:groupId/expenses/:id  (PROTECTED)
 *
 * Only the payer or creator can delete. Ownership checked in the service.
 * Prisma cascade removes ExpenseSplits automatically.
 */
export async function remove(req, res) {
  await expenseService.deleteExpense(req.params.id, req.user.userId);
  res.status(204).end();
}

/**
 * POST /groups/:groupId/expenses/:id/items  (PROTECTED)
 *
 * Report (upsert) an item for a COLLECTIVE expense.
 * Body: { amount: number, description?: string }
 */
export async function addItem(req, res) {
  const result = await itemReportingService.reportItem(
    req.params.id,
    req.user.userId,
    req.body.amount,
    req.body.description,
  );
  res.status(201).json(result);
}

/**
 * PATCH /groups/:groupId/expenses/:id/items/:itemId  (PROTECTED)
 *
 * Update an existing item on a COLLECTIVE expense.
 * Body: { amount?: number, description?: string }
 * Returns 403 if user doesn't own the item.
 * Returns 409 if expense is locked.
 */
export async function updateItem(req, res) {
  const result = await itemReportingService.updateItem(
    req.params.itemId,
    req.user.userId,
    req.body.amount,
    req.body.description,
  );
  res.status(200).json(result);
}

/**
 * DELETE /groups/:groupId/expenses/:id/items/:itemId  (PROTECTED)
 *
 * Delete an item from a COLLECTIVE expense.
 * Returns 403 if user doesn't own the item.
 * Returns 409 if expense is locked.
 */
export async function removeItem(req, res) {
  await itemReportingService.deleteItem(req.params.itemId, req.user.userId);
  res.status(204).end();
}

/**
 * GET /groups/:groupId/expenses/:id/items/status  (PROTECTED)
 *
 * Get the current item reporting status for a COLLECTIVE expense.
 * Returns { status, itemsSum, sharedCosts, total, discrepancy }
 */
export async function getItemStatus(req, res) {
  const status = await itemReportingService.getItemStatus(req.params.id);
  res.status(200).json(status);
}

/**
 * POST /groups/:groupId/expenses/:id/unlock  (PROTECTED)
 *
 * Unlock a COMPLETED COLLECTIVE expense for further item edits.
 * Only the creator can unlock.
 * Resets status to PENDING, isLocked to false, and deletes existing splits.
 */
export async function unlock(req, res) {
  const expense = await expenseService.unlockExpense(
    req.params.id,
    req.user.userId,
  );
  res.status(200).json(expense);
}
