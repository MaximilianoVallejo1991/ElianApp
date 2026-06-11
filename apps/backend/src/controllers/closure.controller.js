import * as closureService from '../services/closure.service.js';

// ---------------------------------------------------------------------------
//  Closure Controller
// ---------------------------------------------------------------------------
//  Thin request/response layer for closure operations.
//  All handlers assume req.user is set by authenticate middleware.
// ---------------------------------------------------------------------------

/**
 * POST /groups/:groupId/closure/start  (owner only)
 *
 * Starts closure: OPEN → CLOSING
 */
export async function start(req, res) {
  const period = await closureService.startClosure(
    req.params.groupId,
    req.user.userId,
  );
  res.status(200).json(period);
}

/**
 * POST /groups/:groupId/closure/complete  (owner only)
 *
 * Completes closure: CLOSING → CLOSED
 */
export async function complete(req, res) {
  const period = await closureService.completeClosure(
    req.params.groupId,
    req.user.userId,
  );
  res.status(200).json(period);
}

/**
 * POST /groups/:groupId/closure/partial  (owner only)
 *
 * Partial closure: CLOSING → CLOSED + new OPEN period
 */
export async function partial(req, res) {
  const period = await closureService.partialClosure(
    req.params.groupId,
    req.user.userId,
  );
  res.status(200).json(period);
}

/**
 * POST /groups/:groupId/closure/final  (owner only)
 *
 * Final closure: CLOSING → FINAL, group.status = CLOSED
 */
export async function final(req, res) {
  const period = await closureService.finalClosure(
    req.params.groupId,
    req.user.userId,
  );
  res.status(200).json(period);
}