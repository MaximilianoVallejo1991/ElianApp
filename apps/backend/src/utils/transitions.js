import { AppError } from './errors.js';

/**
 * Atomic state-transition guard — the Cycle 2 pattern, extracted verbatim.
 *
 * Moves the state predicate INTO the `where` of an `updateMany` so a caller
 * that lost the race writes nothing and `count` is 0. READ COMMITTED
 * re-evaluates a blocked UPDATE's WHERE against the newly committed row,
 * which is what makes this authoritative where a `SELECT` + `if` is not.
 *
 * MUST be the FIRST statement of its transaction at every call site (Cycle 2
 * ADR-4: Period before Group). 409 is hardcoded — all six call sites are lost
 * races. `where` and `data` pass through WHOLE: the payment sites carry a
 * `deletedAt: null` predicate the closure sites do not.
 *
 * @param {object} delegate — a Prisma MODEL delegate, e.g. `tx.period`
 * @param {{ where: object, data: object, errorCode: string, errorMessage: string }} opts
 * @returns {Promise<void>}
 * @throws {AppError} `errorCode` at 409 when exactly one row was not updated
 */
export async function assertAtomicTransition(delegate, { where, data, errorCode, errorMessage }) {
  const guard = await delegate.updateMany({ where, data });
  if (guard.count !== 1) {
    throw new AppError(errorCode, 409, errorMessage);
  }
}
