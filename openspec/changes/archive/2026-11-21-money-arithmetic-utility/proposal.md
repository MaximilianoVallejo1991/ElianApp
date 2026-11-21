# Proposal: Money Arithmetic Utility

## Intent

`calculateEqualSplits` (`splits.js` L20-33) and `calculateCollectiveSplits` (L168-189) still use "last participant absorbs the remainder", which can hand that participant a **negative** amount. Confirmed by executing the real functions: `calculateEqualSplits(3.18, <30 ids>)` → last member `-0.01`; `calculateCollectiveSplits([], 3.18, <30 ids>)` → same. Reachable through the normal API: no max group size exists, `amount` is only `z.number().positive()`, and EQUAL's `validateSplits()` is a no-op. `assertSplitsSumToTotal` does **not** catch it — it checks the sum (still exactly right), never an individual amount's sign. The common COLLECTIVE case is a participant with no reported items, so their split *is* the shared-cost share.

Cycle 1 fixed this same defect class in `calculatePercentageSplits` via Hamilton apportionment and its ADR-5 deferred consolidating all three functions to this change by name. This is that change.

## Scope

### In Scope
- One shared primitive `apportionCents(totalCents, weights[]) -> cents[]` (floor + largest-remainder, tie-break lowest original index)
- `calculateEqualSplits`, `calculatePercentageSplits`, `calculateCollectiveSplits` all become thin wrappers over it
- Mirrored byte-for-byte into `apps/frontend/src/utils/splits.js` in the same PR (Cycle 1 parity rule)
- Updated EQUAL/COLLECTIVE tests + a RED non-negative test per function, modeled on the existing percentage one

### Out of Scope — asked and declined, do not re-raise
- Historical detection/backfill of already-corrupted splits (no Cycle 3 ADR-15-style query) — forward-fix only
- Any group-size cap; the fix must be correct at any `n`
- Any restriction on a zero-item COLLECTIVE participant — `itemAmount = 0` is valid and must simply not go negative

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `expense-management`: generalize *Percentage Splits Sum Exactly to Total* to every computed split type; add that no generated split amount may be negative, and that the leftover cent goes to the largest fractional remainder (tie: lowest index), not the last participant

## Approach

1. `apportionCents(totalCents, weights)` → `exact = totalCents * w[i] / sum(w)`, floor, rank remainders desc (tie: lower index), bump the first `leftover`. Weight-agnostic, so `calculatePercentageSplits`'s `normalizedPercentages` rescale (L89-94) becomes redundant and is **deleted** — net code reduction.
2. EQUAL → `apportionCents(cents, Array(n).fill(1))`.
3. COLLECTIVE → `apportionCents(sharedCostsCents, Array(n).fill(1))`, then `amount = itemAmount + share`. Items never enter the primitive; only `sharedCosts` is apportioned.
4. Percentage-specific validation (sum-100, negative, NaN) stays in its wrapper, not the primitive.
5. Strict TDD: RED test first per function, backend and frontend.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/backend/src/utils/splits.js` | Modified | New `apportionCents`; three functions rewritten as wrappers; rescale step removed |
| `apps/frontend/src/utils/splits.js` | Modified | Identical mirror |
| `apps/backend/src/utils/__tests__/splits.test.js` | Modified | Remainder-recipient expectations updated; non-negative tests added |
| `apps/frontend/src/utils/__tests__/splits.test.js` | Modified | Same cases |

Callers are unchanged: `expense.service.js` L135/L321 and `item-reporting.service.js` L253 keep the same signatures.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Remainder recipient moves from last index to largest-remainder — exact cent distribution changes for uneven EQUAL/COLLECTIVE splits | High (accepted) | User signed off explicitly; existing tests asserting last-index amounts get updated because the rule changed, not because they were wrong |
| Backend/frontend `splits.js` drift | Med | Same PR, same commit, identical test cases both sides |
| Primitive subtly breaks the already-correct PERCENTAGE path | Med | Keep Cycle 1's percentage tests untouched as the regression net; they must pass unmodified |
| Recomputing an old expense (edit/unlock) shifts a cent between members | Low | Pre-production, no real users; totals stay exact |

## Rollback Plan

Single revert of one commit touching two utility files and two test files. No schema, no migration, no data mutation. Reverting restores the negative-share bug but leaves persisted `ExpenseSplit` rows untouched (computed at write time).

## Dependencies

- `AppError` in `apps/backend/src/utils/errors.js` (already used by `calculatePercentageSplits`)
- Vitest in both apps; Strict TDD active

## Success Criteria

- [ ] No generated split amount is negative for any `totalAmount > 0` and any `n`, EQUAL / PERCENTAGE / COLLECTIVE
- [ ] `calculateEqualSplits(3.18, <30 ids>)` yields no negative amount and still sums to 3.18
- [ ] `calculateCollectiveSplits([], 3.18, <30 ids>)` same; a zero-item participant gets their shared share, never negative
- [ ] All three functions delegate remainder distribution to `apportionCents` — no second copy of the algorithm remains
- [ ] `normalizedPercentages` is gone and Cycle 1's percentage tests pass unmodified
- [ ] Backend and frontend `splits.js` return identical amounts for identical inputs
- [ ] A failing test preceded each fix; `pnpm --filter backend test && pnpm --filter frontend test` and `pnpm -r run build` pass
