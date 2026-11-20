# Verify Report: Money Arithmetic Utility

**Change**: `money-arithmetic-utility`
**Branch**: `fix/apportion-cents-splits` (3 commits ahead of `main`, not pushed, not merged)
**Mode**: Full spec-driven verification (proposal/spec/design/tasks all present)
**Verdict**: PASS

## Completeness (tasks.md)

All 21 tasks (1.1-3.5) checked [x]. Re-derived against actual code/tests, not trusted from checkmarks alone - every task claim was independently re-verified below.

Addendum section present and accurate: lists one trivial post-review fix (applied, verified identical in both files), five deliberately-deferred findings with reasons, one rejected-outright finding, and one raised-to-user, deferred UI-preview finding. All spot-checked (see Correctness section).

## Build/Test Evidence (re-run by this verification, not copied from the apply report)

| Command | Result |
|---|---|
| pnpm --filter backend test | 101/101 passed, 9 test files |
| pnpm --filter frontend test | 52/52 passed, 4 test files |
| pnpm -r run build | Passed (frontend built; backend has no build script, 2 of 3 workspace projects, expected) |
| Real-DB check (tasks 3.4/3.5) | Re-run independently against live splitwise-db Postgres container (confirmed via docker ps, container up on port 5433). See below. |

### Real-DB re-run (independent, not a copy of the apply report claim)

Wrote a throwaway script invoking the real createExpense (EQUAL, 30 participants, amount=3.18) and createExpense + recomputeAndPersist (COLLECTIVE, 30 participants, literally zero ExpenseItem rows, sharedCosts=3.18) directly against the live container. Asserted every persisted ExpenseSplit.amount >= 0 and cents sum === 318 for both. Result:

EQUAL check PASSED. cents sum = 318 splits = 30
COLLECTIVE check PASSED. cents sum = 318 splits = 30
ALL REAL-DB CHECKS PASSED
Cleanup verification -> expenses: 0 members: 0 group: 0 users: 0
CLEANUP VERIFIED: zero rows remain

Note: this re-run called recomputeAndPersist directly for the COLLECTIVE case with truly zero items, which is a more literal match to the spec scenario (COLLECTIVE split with no reported items) than the apply report approach - the apply-progress record notes it had to route through reportItem with a dollar-zero-amount item, because literally zero items never triggers recomputeAndPersist through the public API surface. Both are valid live-DB exercises of the same generateSplits -> calculateCollectiveSplits -> apportionCents path; this re-run independently confirms the apply report claim and is slightly more faithful to the spec wording. All temp rows (2 expenses, splits, 1 group, 31 users, 31 memberships) were deleted and confirmed zero remaining via follow-up count queries, not just claimed.

## Correctness - re-derived against design.md ADRs

| Check | Result |
|---|---|
| apportionCents module-private (ADR-1) | Confirmed, no export keyword in either file |
| No added guards inside apportionCents (ADR-2) | Confirmed, function body is exactly: weight-sum, exact shares, floor, remainder, sort, bump loop. No precondition branch. |
| apportionCents byte-identical backend vs frontend | Confirmed by direct diff of the two function bodies against each other (not just against main), diff reports zero differences |
| normalizedPercentages deleted, not renamed (ADR-3) | Confirmed, zero matches in apps source via repo-wide grep; only matches are in openspec planning docs |
| PERCENTAGE validation (L69-85) unchanged (ADR-4) | Confirmed via git diff main..branch, the validation block is outside the diff hunks (untouched) in both files |
| Backend/frontend parity: AppError vs plain Error (ADR-5) | Confirmed, backend still throws AppError, frontend still throws plain Error |
| Empty-input guards kept verbatim (ADR-6) | Confirmed, both wrappers early-return empty-array lines are unchanged in the diff |
| Single PR, 4 files, parity risk reasoning (ADR-8) | Confirmed, exactly 4 source/test files plus tasks.md changed, one logical PR |
| All 3 wrappers are thin wrappers over apportionCents | Confirmed by reading both splits.js files in full, calculateEqualSplits, calculatePercentageSplits, calculateCollectiveSplits all call apportionCents and do no independent floor/remainder math |
| No second floor+remainder algorithm outside apportionCents | Confirmed, Math.floor/remainder grep hits exist only inside the apportionCents function body in each file |
| New calculateCollectiveSplits describe block in backend tests | Confirmed, backend test diff shows the entire describe block added (absent on main); ports frontend existing cases plus the new 30-participant non-negative case, matching design file-changes table |
| 3 re-expected existing test values | Confirmed via direct diff against main: backend EQUAL case (1), frontend EQUAL case (1), frontend COLLECTIVE case (1), exactly 3, matching design.md's exhaustive table of changed values. Both files use the ADR-7 integer-cents sum idiom, not float toBe assertions. |
| 4 existing PERCENTAGE cases pass unmodified | Confirmed, diff against main shows zero assertion changes in the calculatePercentageSplits describe block (one comment was updated for the epsilon case, no expect value changed); all 4 cases design.md traced pass in the 101/101 run |
| New non-negative regression tests exist and assert what they claim | Confirmed, calculateEqualSplits with amount 3.18 and 30 ids, and calculateCollectiveSplits with empty items, amount 3.18 and 30 ids (and frontend mirrors) assert amount is non-negative for all 30, exact 0.11/0.10 split (18/12), and integer-cents sum equals 318 |
| No AI/Claude/Anthropic/Co-Authored-By attribution | Confirmed, git log of commit bodies between main and HEAD contains no such strings in any of the 3 commits |

### Addendum spot-checks (3 of the deliberately-deferred reasons)

1. apportionCents has no runtime guard for sum of weights equal to zero - confirmed accurate by reading the function body: no such guard exists.
2. Unreachable given EQUAL/COLLECTIVE weights behind the existing empty-array early return - confirmed accurate: both calculateEqualSplits and calculateCollectiveSplits return an empty array before calling apportionCents when the id list is empty, so every live call has weights derived as ids mapped to 1, with ids.length at least 1, giving sum of weights at least 1 always.
3. calculatePercentageSplits throws the sum-mismatch error message even when the real failure is a negative percentage - confirmed accurate: the single throw covers three OR-ed conditions with one shared message, regardless of which condition fired.

## Design Coherence

Design and implementation agree on every ADR checked above. One deviation found: design.md's Interfaces / Contracts section still shows the pre-addendum apportionCents body (sort, then build a Set from order.slice, then has-lookup inside map), while the shipped code (both files) uses the addendum's simplified direct-loop bump instead. Functionally identical, confirmed by output equivalence across the full test suite, but design.md's code sample is now stale relative to what actually shipped. Not a spec or behavior violation (see SUGGESTION below).

## Review Workload

| Field | Forecast (tasks.md) | Actual (re-measured) |
|---|---|---|
| Changed lines, 4 code/test files | approx 310 | 412 (111+12 backend test, 59+55 backend src, 47+14 frontend test, 59+55 frontend src) |
| Changed lines incl. tasks.md | not forecast | 505 |
| Risk level | Medium | Realized size is closer to the stated 400-line review budget ceiling than forecast, see WARNING |

## Issues

CRITICAL: 0

WARNING: 1
1. Realized diff size for the 4 production/test files is 412 changed lines (505 including tasks.md), exceeding both design.md's own approx-310-line estimate and the project's stated 400-line PR review budget guard. ADR-8 already made an informed, well-justified decision not to split (splitting backend from frontend would ship a parity-broken intermediate commit), so no action is required before archive, but reviewers should budget for a larger-than-Medium review, and future estimates for this kind of mirrored-file change should pad the forecast.

SUGGESTION: 2
1. Sync design.md's Interfaces / Contracts apportionCents code sample with the addendum's shipped direct-loop bump implementation (currently only tasks.md's addendum documents the actual shipped form), so a reader of design.md alone does not see stale code.
2. The raised-to-the-user, deferred ExpenseForm.jsx inline-preview-drift finding is accurately characterized (confirmed predates this PR, correctly out of this change's Affected Areas) and the user already made the call to defer it, but it currently exists only as prose inside tasks.md's addendum, not as a tracked backlog item. Recommend opening an actual tracked follow-up before this note is lost to history.

## Final Verdict

PASS. All 21 tasks are genuinely complete and match the code state. apportionCents is module-private, guard-free per ADR-2, and byte-identical between backend and frontend (verified by direct diff of the two function bodies). All three split functions are thin wrappers; normalizedPercentages is gone from source, not renamed. Backend 101/101 and frontend 52/52 pass on independent re-run; the 3 re-expected test values and the 4 unmodified PERCENTAGE regression cases were confirmed by diffing test files against main, not by trusting checkmarks. The real-DB check was independently re-run against the live splitwise-db container (not just taken on the apply report's word) and cleanup was verified via follow-up row counts. No AI attribution in any of the 3 commits. The one WARNING (realized diff size vs forecast) does not block archive, since ADR-8's single-PR decision already accounted for the parity tradeoff that drives this change's size.

Ready for archive.
