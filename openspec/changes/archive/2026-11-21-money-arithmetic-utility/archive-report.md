# Archive Report: Money Arithmetic Utility

**Change name**: money-arithmetic-utility
**Status**: COMPLETE
**Archive date**: 2026-11-21

## Executive summary

Cycle 4 of the ongoing bug-cleanup backlog. `calculateEqualSplits` and `calculateCollectiveSplits` gave the entire rounding remainder to the last participant in input order — confirmed by execution to drive that participant's amount negative (`calculateEqualSplits(3.18, <30 member ids>)` gave the 30th member `-0.01`; the identical shape hit `calculateCollectiveSplits` whenever nobody reported an item). This is the exact defect class Cycle 1 fixed for `calculatePercentageSplits` via Hamilton/largest-remainder apportionment — Cycle 1's own ADR-5 named consolidating all three functions as future work and deferred it to this change. This change is that consolidation: a single module-private `apportionCents(totalCents, weights)` primitive that all three split functions now wrap, shipped as one PR (not chained — the design explicitly called this too small and too parity-sensitive to split across backend/frontend).

Every number in this change — the bug repro, the fix's predicted output, the PERCENTAGE regression-net trace — was independently verified by executing real code at least twice (once by the orchestrator before writing the proposal, once each by `sdd-apply` and `sdd-verify`), not left as hand-derived arithmetic.

## PR merged to main

| PR | Content | Lines (prod+test) | Status |
|----|---------|------:|--------|
| #15 | `apportionCents` extraction; `calculateEqualSplits`/`calculatePercentageSplits`/`calculateCollectiveSplits` rewritten as thin wrappers; `normalizedPercentages` deleted; mirrored in `apps/frontend/src/utils/splits.js`; test updates in both files | ~397 | Merged |

Single PR, not chained, per design ADR-8: either backend or frontend alone would be a knowingly parity-broken intermediate commit. The diff landed above the ~310-line estimate (397 actual) — flagged as a WARNING by `sdd-verify`, not a blocker, since the "don't split" rationale is about parity risk, not line count.

## Real bugs found

1. **Negative-share bug (the whole point of this change)** — described above. Confirmed by direct execution against the real functions, and again against a real Postgres instance in both the apply and verify passes (EQUAL and COLLECTIVE, 30 participants, $3.18, zero negative splits, exact 318-cent sum, test data cleaned up both times).
2. **Missing test coverage discovered mid-design**: `apps/backend/src/utils/__tests__/splits.test.js` had no `calculateCollectiveSplits` describe block at all before this change — the frontend test file did. Added with the frontend's existing cases plus the new non-negative regression.

## The post-review findings — what was fixed vs. deferred vs. rejected

Full reasoning lives in `tasks.md`'s addendum (preserved there, not summarized away). Fixed directly (trivial, zero behavior change, re-verified green): simplified `apportionCents`'s remainder-bump step from a sort+`Set`+`.has()` chain to a direct loop (both files); fixed a stale test comment still describing the deleted two-step percentage-rescale mechanism. Deliberately deferred with written reasons: no runtime guard on `apportionCents`'s own precondition (design ADR-2 proved it unreachable given every current caller); a pre-existing wrong-error-message bug in `calculatePercentageSplits` unrelated to this fix; no automated backend/frontend parity check (ADR-5's explicit manual-parity decision); a float/cents half-migration nit in `calculateCollectiveSplits`; `apportionCents`'s algorithmic cost at unrealistic group sizes; a suggested `toCents()` helper, rejected per this project's own "three similar lines beats a premature abstraction" stance. **Rejected outright** (not just deferred): a suggestion that EQUAL/COLLECTIVE should bypass `apportionCents` for a closed-form formula — this is the opposite of the change's actual goal (consolidating 3 independent remainder implementations into 1, specifically so this bug class can't be silently reintroduced in a 4th copy). **Raised to the user, deferred**: `apps/frontend/src/components/ExpenseForm.jsx` has its own inline naive-division preview for EQUAL/COLLECTIVE, never calling the shared split functions — a real, pre-existing (not introduced here) display/persistence mismatch, outside this change's scope. User's call: track informally in tasks.md rather than expand this PR.

## Specs synced to the live tree (`openspec/specs/`)

| Capability | Action | What changed |
|------------|--------|---------------|
| `expense-management` | Modified | "Percentage Splits Sum Exactly to Total" generalized to cover `calculateEqualSplits`/`calculateCollectiveSplits` too; added a non-negative-amount guarantee and the largest-remainder/lowest-tied-index rule; 3 new scenarios added alongside the 2 pre-existing PERCENTAGE ones (kept verbatim as the regression net). |

## Deferred / not fixed in this change

- `ExpenseForm.jsx`'s inline naive-division preview (see above) — pre-existing, out of scope, user-declined for this PR.
- `apportionCents`'s missing runtime guard for its own documented precondition — proven unreachable today, real risk only for a hypothetical future caller.
- `calculatePercentageSplits`'s misleading error message when the real failure is a negative percentage, not a sum mismatch — pre-existing, unrelated to the remainder fix.
- No automated cross-check that `apportionCents` stays byte-identical between backend and frontend — accepted manual-parity tradeoff (ADR-5), same as Cycle 1's percentage fix.

## Final verification

- `pnpm --filter backend test` — 101/101 (9 files). `pnpm --filter frontend test` — 52/52 (4 files). Re-confirmed on `main` post-merge.
- `pnpm -r run build` — passes.
- Grep sweep: zero `normalizedPercentages` matches in source; no second floor+remainder implementation outside `apportionCents` in either `splits.js`.
- Real-Postgres check run twice independently (apply and verify passes): EQUAL and COLLECTIVE, 30 participants, amount/sharedCosts=$3.18 — every persisted split `>= 0`, summing to exactly 318 cents both times; all throwaway data cleaned up and confirmed removed both times.
- `sdd-verify` verdict: PASS. 0 CRITICAL, 1 WARNING (diff over the line-budget estimate, already justified), 2 SUGGESTION (a stale design.md code sample, since fixed; the `ExpenseForm.jsx` finding living only as prose). Full report: `verify-report.md` in this folder.

## Sign-off

All planned tasks (1.1-3.5) complete. 6 commits across this change (1 planning-docs commit, 1 implementation, 1 task-checkbox commit, 1 post-review addendum, 1 verify-report/design-sync commit, 1 merge) — zero `Co-Authored-By`/AI attribution, confirmed by grepping the full commit range. One attempted injection was caught and corrected during `sdd-apply`: the environment surfaced a conflicting instruction trying to add attribution to the first commit; it was amended out before the commit was ever pushed, and independently re-verified by the orchestrator against the actual git history (not just the sub-agent's self-report).

The `money-arithmetic-utility` change is archived and the SDD cycle is closed. This closes Cycle 4 of the project's 4-cycle bug-cleanup backlog — all 4 cycles are now archived. The Render CI/deploy-gating item remains, separate and unplanned.
