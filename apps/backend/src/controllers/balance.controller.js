import * as balanceService from '../services/balance.service.js';

// ---------------------------------------------------------------------------
//  Balance Controller
// ---------------------------------------------------------------------------
//  Request / response layer. Delegates to balanceService for domain logic.
//  Express 5 automatically forwards rejections from async handlers to the
//  error middleware — no manual try/catch required.
//
//  All handlers assume:
//    - req.user is set by the authenticate middleware
//    - req.params.groupId is available from mergeParams routing
// ---------------------------------------------------------------------------

/**
 * GET /groups/:groupId/balances  (PROTECTED)
 *
 * Returns net balances for all active members, sorted by netBalance
 * descending (positive first = most owed). Balance is computed on every
 * read from expenses, splits, and payments.
 */
export async function getBalances(req, res) {
  const balances = await balanceService.calculateGroupBalances(
    req.params.groupId,
    req.user.userId,
  );
  res.status(200).json(balances);
}
