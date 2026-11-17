# Archive Report: Permissions and Process Cleanup

**Change name**: permissions-and-process-cleanup
**Status**: COMPLETE
**Archive date**: 2026-11-16

## Executive summary

Seven items across frontend permission alignment, backend soft-delete/membership guards, a real money-correctness bug, `deleteGroup` lock ordering, and a duplicated concurrency-guard extraction. Shipped as 5 chained PRs (`stacked-to-main`), each independently reviewed (fresh-context code review) and verified (`sdd-verify`) before the next began.

The headline fix (items 2-3) is a real money bug: an `ExpenseItem` belonging to a user who was later removed from a COLLECTIVE expense's `participantIds` was still counted toward `itemsSum` when deciding completion status, while `generateSplits` silently excluded that same item from the persisted splits — so the expense could reach `COMPLETED` with a payer under-collected by exactly the orphan's amount. Fixed by deriving one filtered `participantItems` set that feeds both `itemsSum` and split generation, closed at both its entry points (surviving-orphan and inline-at-creation). Unlike Cycle 2, this fix's safety property was confirmed against a **real Postgres instance** in Phase 6, not only the mocked regression test — `itemsSum` correctly excludes the orphan, status lands on `MISMATCH`, zero `ExpenseSplit` rows persisted.

This change also closes two items Cycle 2's own archive report explicitly deferred: the `deleteGroup`↔`finalClosure` lock-order inversion (item 6) and extracting the 6x-duplicated atomic-guard pattern into a shared helper (item 7, the riskiest PR here — required a zero-line-diff regression proof against all 4 of Cycle 2's concurrency test suites, which held).

## PRs merged to main

| PR | Item(s) | Content | Lines (prod+test) | Status |
|----|---------|---------|------:|--------|
| #9 | 1 | Frontend `expensePermissions.js` (edit/delete/unlock gating), swallowed-403 fix, dropped an over-granted delete control | ~82 | Merged |
| #10 | 2, 3 (reporting half) | `item-reporting.service.js` `deletedAt`/participation guards, orphan-item sum fix (`participantItems` derivation), `assertSplitsSumToTotal` shared guard | ~354 | Merged |
| #11 | 3 (expense half), 4, 5 | `expense.service.js` `assertActiveMembers`, EQUAL membership validation, PERCENTAGE adjacent-gap fix, `splits:[]` reconstruction fix, COLLECTIVE sum-guard | ~266 | Merged |
| #12 | 6 | `deleteGroup` lock reorder (`$transaction`, Period before Group), post-review doc/test cleanup | ~76 | Merged |
| #13 | 7 | `assertAtomicTransition` helper extracted, 6 call sites retrofitted, zero-line-diff on all 4 Cycle 2 concurrency suites | ~132 | Merged |

Total: ~910 prod+test lines across 5 PRs (SDD planning/verify docs excluded from this count, per this project's standing convention — see `tasks.md`'s own Review Workload Forecast).

## Real bugs found

1. **Orphan-item money bug (items 2-3, PR #10/#11)** — the headline fix, described above. Confirmed against real Postgres in Phase 6, not just mocked.
2. **Frontend delete control over-granted (item 1, PR #9)** — `GroupDetailPage.jsx` derived delete access from the same `isCreator` flag used for edit, letting a payer who was not the creator or group owner see (and use) the delete control the backend would reject. Caught during spec review, fixed by gating delete through its own `canDeleteExpense` rule.
3. **Missing `deletedAt` guards on 5 item-reporting entry points (item 2, PR #10)** — `reportItem`, `updateItem`, `deleteItem`, `getItemStatus`, `recomputeAndPersist` all allowed mutating/reading items on a soft-deleted expense.
4. **EQUAL split had no membership validation (item 4, PR #11)** — PERCENTAGE already validated `participantIds` against active group membership; EQUAL did not, letting a non-member be added to a split.
5. **`deleteGroup`↔`finalClosure` lock-order inversion (item 6, PR #12)** — a bare `prisma.group.delete()` relied on FK cascade (`Group` locked before `Period`), the inverse of `finalClosure`'s `Period`-then-`Group` order; a documented deadlock-cycle risk from Cycle 2, resolved here with an explicit `$transaction`.

## The post-review findings — what was fixed vs. deliberately deferred

Each PR's fresh-context code review surfaced real findings beyond its own task list; full reasoning for every one lives in `tasks.md`'s per-phase addenda (preserved below, not summarized away):

- **PR #9**: fixed directly — unused `canUnlockExpense` param, redundant JSX `isCollective` check, stale JSDoc, a CAPS-emphasis comment violating this project's no-persona-emphasis rule. Deferred — a 7-site-duplicated `isGroupOwner` helper, an identical-shape `canDeletePayment` left inline, backend authorization rules not exposed on the expense API (all explicitly out of this PR's "align these 3 actions" scope).
- **PR #11**: 3 findings deferred, none a correctness bug — `participantIdsAreCallerProvided`'s flag not honored by PERCENTAGE's `assertActiveMembers` call (real but riskier to fix than it looks, needs its own TDD pass), COLLECTIVE's hand-rolled membership check not consolidated into the shared validator (would drop an incidental duplicate-detection side effect), and two speculative-hardening nits.
- **PR #12**: fixed directly — a stale doc comment that could lead a future maintainer to reintroduce the lock-order bug, one redundant test. Deferred — 5 pre-existing concurrency/error-handling gaps unrelated to lock order (`GROUP_HAS_DATA` TOCTOU, unhandled P2025/P2028/P2034, a misleading closure-guard message on a cross-function race), all pre-dating this PR. **Raised to the user and explicitly declined as a non-issue**: a `CLOSED` (`finalClosure`'d) group can still be deleted once its records are soft-deleted to zero, since `deleteGroup` never checks `group.status` — the user's call was that deletion is a separate, explicit owner action from closure, not a bug.
- **PR #13**: 0 findings. Clean, mechanical extraction — verified by diffing all 6 retrofitted call sites against `main` line-by-line and confirming `where`/`data` (including `deletedAt: null`) were forwarded unchanged.

## Specs synced to the live tree (`openspec/specs/`)

| Capability | Requirements touched | What changed |
|------------|----------------------|---------------|
| `group-management` | 1 modified (Delete Group) | Now documents the `$transaction`/lock-order behavior and its regression scenario. |
| `expense-management` | 6 modified, 5 added | Modified: Delete Expense, Report/Update/Delete Individual Item, Validate COLLECTIVE Status, Generate Splits on Completion. Added: Unlock Expense (COLLECTIVE), Get Item Reporting Status, EQUAL Split Membership Validation, PERCENTAGE Splits Reconstruction Treats Empty Array as Omitted, COLLECTIVE Create Rejects Items Outside Participants. |

Merge note: where a PR's delta spec restated a requirement's scenarios, pre-existing scenarios not superseded by the delta (e.g. "Creator reports item with default description," the generic non-orphan mismatch case) were kept alongside the new ones rather than dropped, to avoid silently losing accurate documentation of unrelated, still-true behavior.

## Deferred / not fixed in this change

- The 5 pre-existing concurrency/error-handling gaps noted under PR #12 above (GROUP_HAS_DATA TOCTOU, P2025/P2028/P2034 handling, closure-guard message ambiguity) — real, but out of item 6's lock-order-only scope.
- `CLOSED` groups remaining deletable via `deleteGroup` — raised to and declined by the user, not tracked as a follow-up.
- PERCENTAGE's `assertActiveMembers` not honoring `participantIdsAreCallerProvided` (PR #11 addendum) — needs its own careful TDD pass, not a quick edit.
- COLLECTIVE's hand-rolled membership check vs. the shared `assertActiveMembers` validator (PR #11 addendum) — real duplication, not a bug today.
- Two architecture ideas surfaced across this and prior cycles remain explicitly deferred in Engram: `architecture/payment-rejection-resolution-concept`, `architecture/expense-participantIds-authoritative-source`.

## Final verification (Phase 6)

- `pnpm --filter backend test && pnpm --filter frontend test` — 93/93 backend (9 files), 50/50 frontend (4 files), zero regression against each PR's own verify-report baseline.
- `pnpm -r run build` — passes (frontend clean; backend has no build script, pre-existing, test-only package).
- Grep sweep: no `isCreator` remains in `GroupDetailPage.jsx`; no unguarded `deletedAt` path remains in `item-reporting.service.js`.
- **Orphan-item money bug reproduced against a real Postgres instance** (not mocked): real `createExpense`/`reportItem`/`recomputeAndPersist` code path, orphan item inserted directly (the only way to produce it, since `reportItem` itself would reject a non-participant), `itemsSum` correctly excludes it (100, not 150), expense lands on `MISMATCH`, zero `ExpenseSplit` rows persisted. Test data created and cleaned up in the same run; no pre-existing data touched.
- ADR-15's orphan-detection query run against the real DB: 0 pre-existing orphaned `ExpenseItem` rows.

## Sign-off

All planned tasks (Phases 1-6) complete. 26 commits across this change's 5 PRs plus addenda and docs — zero `Co-Authored-By`/AI attribution confirmed by grepping the full commit range (`5e44bed^..HEAD`), including one case this session where a conflicting attribution instruction arrived via session context and was explicitly identified and ignored rather than applied.

The `permissions-and-process-cleanup` change is archived and the SDD cycle is closed.
