import * as collectiveExpenseService from '../services/collective-expense.service.js';

// ---------------------------------------------------------------------------
//  Collective Expense Controller
// ---------------------------------------------------------------------------
//  Request / response layer. Delegates to collectiveExpenseService for
//  domain logic. Express 5 automatically forwards rejections from async
//  handlers to the error middleware — no manual try/catch required.
//
//  All handlers assume:
//    - req.user is set by the authenticate middleware
//    - req.params.groupId is available from mergeParams routing
// ---------------------------------------------------------------------------

/**
 * POST /groups/:groupId/collective-expenses  (PROTECTED)
 *
 * Body validated by Zod middleware before this handler runs.
 */
export async function create(req, res) {
  const expense = await collectiveExpenseService.create(
    req.params.groupId,
    req.user.userId,
    req.body,
  );
  res.status(201).json(expense);
}

/**
 * GET /groups/:groupId/collective-expenses  (PROTECTED)
 *
 * Returns all collective expenses for the group, newest first.
 */
export async function list(req, res) {
  const expenses = await collectiveExpenseService.list(req.params.groupId);
  res.status(200).json(expenses);
}

/**
 * GET /groups/:groupId/collective-expenses/:id  (PROTECTED)
 *
 * Returns a single collective expense with items and participants.
 */
export async function getOne(req, res) {
  const expense = await collectiveExpenseService.getOne(req.params.id);
  res.status(200).json(expense);
}

/**
 * PUT /groups/:groupId/collective-expenses/:id  (PROTECTED)
 *
 * Only the creator can update. Blocked after items exist or if locked.
 */
export async function update(req, res) {
  const expense = await collectiveExpenseService.update(
    req.params.id,
    req.user.userId,
    req.body,
  );
  res.status(200).json(expense);
}

/**
 * DELETE /groups/:groupId/collective-expenses/:id  (PROTECTED)
 *
 * Only the creator can delete. Blocked if items exist.
 */
export async function remove(req, res) {
  await collectiveExpenseService.remove(req.params.id, req.user.userId);
  res.status(204).end();
}

/**
 * POST /groups/:groupId/collective-expenses/:id/unlock  (PROTECTED)
 *
 * Creator unlocks a completed expense, resetting status to PENDING.
 */
export async function unlock(req, res) {
  const expense = await collectiveExpenseService.unlock(
    req.params.id,
    req.user.userId,
  );
  res.status(200).json(expense);
}
