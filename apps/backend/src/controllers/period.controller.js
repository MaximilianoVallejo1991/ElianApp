import * as periodService from '../services/period.service.js';

// ---------------------------------------------------------------------------
//  Period Controller
// ---------------------------------------------------------------------------
//  Thin request/response layer for period queries.
//  All handlers assume req.user is set by authenticate middleware.
// ---------------------------------------------------------------------------

/**
 * GET /groups/:groupId/periods
 *
 * List all periods for the group, newest first.
 */
export async function list(req, res) {
  const periods = await periodService.listPeriods(
    req.params.groupId,
    req.user.userId,
  );
  res.status(200).json(periods);
}

/**
 * GET /groups/:groupId/periods/:periodId
 *
 * Get a single period's details.
 */
export async function getOne(req, res) {
  const period = await periodService.getPeriodDetails(
    req.params.periodId,
    req.params.groupId,
    req.user.userId,
  );
  res.status(200).json(period);
}

/**
 * GET /groups/:groupId/periods/:periodId/balances
 *
 * Get balances for a specific period.
 */
export async function getBalances(req, res) {
  const result = await periodService.getPeriodBalances(
    req.params.periodId,
    req.params.groupId,
    req.user.userId,
  );
  res.status(200).json(result);
}

/**
 * GET /groups/:groupId/periods/:periodId/expenses
 *
 * Get all expenses for a specific period.
 */
export async function getExpenses(req, res) {
  const expenses = await periodService.getPeriodExpenses(
    req.params.periodId,
    req.params.groupId,
    req.user.userId,
  );
  res.status(200).json(expenses);
}

/**
 * GET /groups/:groupId/periods/:periodId/payments
 *
 * Get all payments for a specific period.
 */
export async function getPayments(req, res) {
  const payments = await periodService.getPeriodPayments(
    req.params.periodId,
    req.params.groupId,
    req.user.userId,
  );
  res.status(200).json(payments);
}