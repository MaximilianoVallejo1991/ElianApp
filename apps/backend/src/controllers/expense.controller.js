import * as expenseService from '../services/expense.service.js';

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
 * Returns all expenses for the group, ordered by createdAt descending.
 */
export async function list(req, res) {
  const expenses = await expenseService.listExpenses(
    req.params.groupId,
    req.user.userId,
  );
  res.status(200).json(expenses);
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
