# Tasks: Permissions and Process Cleanup

## Testing Philosophy

This change applies `ponytail` discipline: **one small test per real case, no combinatorial
matrices, backend-already-enforced frontend logic gets minimal coverage.** A branch, a loop, money
or security code gets ONE small test proving the real case — not a truth table, not a RED/GREEN/
structural/`invocationCallOrder` suite per function. If a future reader (including an `sdd-apply`
sub-agent) is tempted to "helpfully" pad a test count back up toward Cycle 1/2's levels: don't — the
fix design (30 ADRs) is unchanged and still correct; only test ceremony was over-specified in the
prior draft of this file, and this version corrects it.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~725 total across 5 PRs (sum of per-PR estimates below) — down from the prior draft's ~1315 |
| 400-line budget risk | Low (every PR is comfortably under; the largest, PR2, is ~46% of budget) |
| Chained PRs recommended | Yes (unchanged — for dependency/isolation reasons, not line-count pressure, see below) |
| Suggested split | PR1 ~120 → PR2 ~185 → PR3 ~170 → PR4 ~110 → PR5 ~140 |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: **No.** At the prior draft's sizes (PR3 ~350/400, PR5 ~340/400) the
`ask-on-risk` gate had a real go/no-go to make. At these sizes nothing comes close: the largest PR
(PR2, ~185) is under half the budget. No exception, no split decision, no owner sign-off needed on
size grounds.

### Did the 5-PR split survive the recompute, or should it consolidate?

**Re-verified, kept at 5 — but not because of line count.** Every individual PR is now so far under
budget (max 46%) that line count alone no longer justifies 5 separate PRs; the prior draft's
justification (two PRs sitting at 85-90% of budget) is gone. Checked every consolidation that would
reduce PR count and found none that is both safe and faithful to the design's own decisions:

- **Merging PR2+PR3** (both backend validation, item 3 already split across their two files) would
  land at ~355/400 (89%) — *this* is "approaching 400," the exact thing to avoid. It also erases the
  only real estimate-error margin in this plan. Not recommended.
- **Merging PR4+PR5** (item 6 + item 7) would fit easily at ~250/400, but it directly contradicts an
  explicit design decision, not a line-count convenience: the proposal's Risk/Rollback sections say
  item 7 ships "**last and alone so revert is isolated**" because it is the one item that can regress
  already-verified Cycle 2 concurrency code. Overriding that to save a PR is the wrong trade. Not
  recommended.
- **Merging PR1 with any backend PR** crosses the frontend/backend domain boundary for no benefit —
  no shared file, no shared dependency, different review context. Not recommended.

Net: the 5-PR split is justified by file/domain separation and two explicit revert-isolation
decisions (items 6 and 7), not by the line-count pressure that drove the prior draft's over-testing.
Risk rating is downgraded **Medium → Low**; the split and `stacked-to-main` chain stand unchanged.
Dependency order is unchanged: PR3 still needs PR2's `assertSplitsSumToTotal` export; PR5 (item 7)
still needs PR1-4 merged and stable first, per the design's explicit "item 7 goes last" ordering rule
— neither of those is a line-budget artifact, so recomputing line counts does not loosen them.

### What actually shrank, and what did not

- **Prod line estimates are unchanged from design.md's own Review Budget table** (~330 total across
  5 PRs) — the fix design for all 30 ADRs is untouched, confirming no item's actual logic was
  weakened, only test depth.
- **Test line estimates dropped ~395 total** (was ~965): item 1's frontend truth table (4 roles × 3
  actions + state rows) collapsed to ~5-6 representative cases; item 2/3's per-guard matrix collapsed
  to one test per real guard/case (~9 tests, not a cross-product); item 7's planned NEW per-site
  barrier suite (`transition-helper-concurrency.test.js`, ADR-29's "narrow" scope, still ~250 lines)
  is dropped entirely — the four EXISTING Cycle 2 suites passing with a zero-line diff already are
  that proof; only the new helper itself gets 2-3 small tests.
- **Item 6 is the one place test count barely moved** (2-4 small tests either way): it is the first
  test file `deleteGroup` has ever had, and it is a destructive, data-loss operation — ponytail's own
  rule never cuts "error handling that prevents data loss," so bare-minimum coverage of its core
  precondition checks is in scope even under this stricter discipline, just not exhaustive coverage of
  every pre-existing branch the change does not touch.

## Suggested Work Units

| Unit | Goal | PR | Files | Lines (prod/test/total) | Depends on |
|------|------|-----|-------|------:|------------|
| 1 | Frontend permission alignment + swallowed-403 fix (item 1) | PR 1 `[frontend]` | `expensePermissions.js` (new), its test (new), `GroupDetailPage.jsx` | 75 / 45 / **~120** | none |
| 2 | `item-reporting.service.js` deletedAt/participation guards + orphan-item sum fix + portable sum guard (items 2, 3-reporting-half) | PR 2 `[backend]` | `item-reporting.service.js`, `utils/splits.js`, `splits.test.js`, prisma mock, `errors.js` docblock | 70 / 115 / **~185** | none |
| 3 | `expense.service.js` orphan rejection + membership validation + splits-reconstruction normalization + PERCENTAGE adjacent fix (item 3-expense-half, 4, 5) | PR 3 `[backend]` | `expense.service.js`, its test | 75 / 95 / **~170** | PR 2 (`assertSplitsSumToTotal` export) |
| 4 | `deleteGroup` lock reordering (item 6) | PR 4 `[backend]` | `group.service.js`, `group.service.test.js` (new), `closure.service.js` (comment), prisma mock | 25 / 85 / **~110** | none |
| 5 | `assertAtomicTransition` extraction, 6-site retrofit (item 7) | PR 5 `[backend]` | `transitions.js` (new), its test (new), `closure.service.js`, `payment.service.js` | 85 / 55 / **~140** | PR 1-4 merged (item 7 is last by design, not retrofitted onto an in-flight baseline) |

Test-case counts per PR, for traceability back to the spec: PR1 ≈5-6 cases (1 file). PR2 ≈9 cases (7
guard tests + 1 orphan-exclusion test + 1 sum-guard test). PR3 ≈5 cases (1 orphan-rejection + 3
membership cases + 1 splits-reconstruction case). PR4 ≈3 cases (lock-order + happy-path +
one-precondition). PR5 ≈3 cases, all on the new helper itself; zero new cases on the 6 retrofitted
call sites (the 4 existing Cycle 2 suites are the proof there).

## Phase 1: Frontend Permission Alignment — PR 1 `[frontend]`

- [x] 1.1 [RED] `expensePermissions.test.js` — a handful of representative cases, NOT a full
      4-role × 3-action truth table: `canEditExpense` payer-not-creator-not-owner → true (the
      accidentally-already-correct rule, pinned per ADR-3); `canDeleteExpense` payer-not-creator →
      false (the actual bug this item fixes) and creator → true; `canUnlockExpense`
      creator+COLLECTIVE+COMPLETED → true, and creator+PENDING → false (the state-gate ADR-2 adds,
      not just authorization). ~5-6 cases total.
- [x] 1.2 [GREEN] Create `apps/frontend/src/utils/expensePermissions.js`: `canEditExpense` /
      `canDeleteExpense` / `canUnlockExpense`, pure `(expense, group, currentUserId)`, per design
      ADR-1/2/3
- [x] 1.3 [GREEN] `GroupDetailPage.jsx` L1091-1094: delete `isCreator`, call the three helpers; wire
      delete button (L1161) to `canDeleteExpense`, unlock gate (L1192) to `canUnlockExpense` — no
      dedicated test for the wiring itself; backend is authoritative, worst case is a button that
      403s or over-hides, no data risk (verified by 1.5)
- [x] 1.4 [GREEN] `GroupDetailPage.jsx` L1196-1202: replace bare `catch {}` with
      `catch (err) { alert(err.message || 'Failed to unlock expense.'); }` + `loadGroup()` (ADR-4) —
      a one-line catch-clause fix; trivial changes need no dedicated test under ponytail, covered by
      1.5's walkthrough instead
- [x] 1.5 [Verify] Walk the spec scenarios (expense-management) against the diff, no new suite:
      "Payer who is not creator does not see unlock control", "Refused unlock surfaces a visible
      error", "Payer who is not creator or owner no longer sees delete control"

**Addendum (PR 1, post-apply code review)** — fixed in commit `abd9bca`: removed `canUnlockExpense`'s
unused `group` param (risked a future "fix" granting owners unlock rights the backend doesn't allow),
removed the redundant `isCollective` check in `GroupDetailPage.jsx`'s JSX gate (duplicated what
`canUnlockExpense` already checks internally), fixed JSDoc comments that pinned exact backend line
numbers, and removed a CAPS-emphasis comment per this project's no-persona-emphasis rule.

Deliberately NOT fixed (genuine findings, but expand scope beyond "align these 3 frontend actions to
their existing backend rules" — per ponytail, nobody asked for these here):
- `group?.ownerId === currentUserId` is duplicated across 7 call sites in the codebase (not just this
  PR's 2). A shared `isGroupOwner(group, userId)` helper is a real improvement but belongs to its own
  small follow-up, not bundled into this fix.
- `canDeletePayment` (`GroupDetailPage.jsx` ~L570) has the identical actor-or-owner shape as the new
  `canDeleteExpense` but was left inline — consistent with "don't touch what wasn't asked," not an
  oversight.
- Backend authorization rules are never exposed on the expense API response, so the frontend must
  hand-maintain a duplicate synced only by a comment. The deeper fix (compute `canEdit`/`canDelete`/
  `canUnlock` server-side, return them on the expense object) is an API-shape change, out of scope here.

## Phase 2: Item-Reporting Guards + Sum Fix — PR 2 `[backend]`

- [ ] 2.1 [RED] `item-reporting.service.test.js` — one small test per guard, 5 deletedAt checks + 2
      participant checks = 7 tests total, each proving its own specific rejection, not a cross-product
      with every other state:
      - `reportItem` → `EXPENSE_NOT_FOUND` 404 when `deletedAt !== null`
      - `updateItem` → same
      - `deleteItem` → same
      - `getItemStatus` → same
      - `recomputeAndPersist` → returns `null`, no mutation, on a soft-deleted expense
      - `updateItem` → `NOT_PARTICIPANT` 403 for the item's own owner once removed from
        `participantIds`; 403 precedes `EXPENSE_LOCKED`
      - `deleteItem` → same
- [ ] 2.2 [GREEN] `item-reporting.service.js`: `deletedAt` guard after the `!expense`/`!item` 404 in
      `reportItem` (after L32), `updateItem` (after L92), `deleteItem` (after L135), `getItemStatus`
      (after L242) (ADR-5/6/8); widen `recomputeAndPersist` (L166) to return `null` when
      `deletedAt !== null` (ADR-7)
- [ ] 2.3 [GREEN] `item-reporting.service.js`: add `NOT_PARTICIPANT` check after the `FORBIDDEN`
      ownership check in `updateItem` (L94-96) / `deleteItem` (L137-139) (ADR-9)
- [ ] 2.4 [RED] ONE money-bug regression test — repro 150/[A,B]/A=50,B=50,orphan D=50 → `MISMATCH`,
      `expenseSplit.createMany` not called, `isLocked: false`. This is the real case; getItemStatus's
      identical filter (ADR-14) reuses the same derived `participantItems` logic and is intentionally
      NOT given its own duplicate test — one real case, not re-asserted per call site.
- [ ] 2.5 [GREEN] `recomputeAndPersist` L170: derive `participantItems = expense.items.filter(Set(participantIds).has)`,
      use for `itemsSum` AND pass to `generateSplits` (ADR-10)
- [ ] 2.6 [GREEN] `getItemStatus` L244: apply the same `participantItems` filter (ADR-14) — no new
      test per 2.4's note
- [ ] 2.7 [RED] `splits.test.js` — ONE test: sum mismatch throws `VALIDATION_ERROR` 400. Mirrors the
      sibling passing-case test already in the file; no new combinatorial suite for
      `assertSplitsSumToTotal`.
- [ ] 2.8 [GREEN] `utils/splits.js`: export `assertSplitsSumToTotal(splits, totalAmount)` (ADR-12);
      `generateSplits` gains `totalAmount` param, calls it between `calculateCollectiveSplits` and
      `createMany`
- [ ] 2.9 [infra] `src/lib/__mocks__/prisma.js`: add `expenseItem.findUnique`/`update`/`delete` stubs
      (ADR-30)
- [ ] 2.10 [docs] `errors.js` docblock: register `INVALID_PARTICIPANTS`, `EXPENSE_LOCKED`,
      `INVALID_SPLIT_TYPE` — zero new codes
- [ ] 2.11 [Verify] Spec scenarios (expense-management): soft-deleted status check / report / update /
      delete, departed-participant orphan 403, orphan-excluded MISMATCH, inert recompute on
      soft-delete — walkthrough against 2.1/2.4's tests, no new suite

## Phase 3: expense.service.js — Orphan Rejection, Membership, Reconstruction — PR 3 `[backend]`

- [ ] 3.1 [RED] ONE test: `createExpense` COLLECTIVE with an item outside `participantIds` →
      `INVALID_PARTICIPANTS` 400, nothing created (item 3's third and last case — PR2 covered the
      other two)
- [ ] 3.2 [GREEN] `createExpense` after L229-231: reject any `items[].userId` not in
      `data.participantIds` (ADR-13); call `assertSplitsSumToTotal` after generating splits in the
      COLLECTIVE inline block (reuse from PR 2)
- [ ] 3.3 [RED] ONE test: EQUAL `participantIds` with a non-member/departed member →
      `INVALID_PARTICIPANTS` 400 (covers both `createExpense` and `updateExpense` call paths with one
      representative case, not one test per caller)
- [ ] 3.4 [GREEN] Add private `assertActiveMembers(groupId, userIds)` near L66 (ADR-16/18);
      `computeSplits` gains 6th param `{ participantIdsAreCallerProvided = true } = {}`; EQUAL branch
      validates via `assertActiveMembers` only when the flag is true; replace the inline sum check
      (L126-129) with `assertSplitsSumToTotal` (ADR-12)
- [ ] 3.5 [RED] ONE test: `PUT { amount }` on an EQUAL expense with a departed-member persisted split
      → succeeds (the confirmed exception — reconstructed list is not re-validated)
- [ ] 3.6 [GREEN] `updateExpense`: declare `participantIdsAreCallerProvided = true` alongside
      `effectiveParticipantIds` (L584-585); flip to `false` on the line immediately after
      `effectiveParticipantIds = reconstructedParticipantIds` (L675, ADR-17); pass the option into the
      `computeSplits` call (L703-709)
- [ ] 3.7 [RED] ONE test: PERCENTAGE request with explicit `splits` and NO `participantIds`,
      containing a non-member `userId` → `INVALID_PARTICIPANTS` 400 (adjacent-gate fix, user-confirmed
      fold-in)
- [ ] 3.8 [GREEN] `computeSplits` PERCENTAGE branch: hoist the
      `assertActiveMembers(groupId, filteredSplits.map(...))` call out of the
      `if (participantIds && length > 0)` gate so it always runs
- [ ] 3.9 [RED] ONE test: `PUT { amount, splits: [] }` on PERCENTAGE → reconstructs and succeeds (was
      `INVALID_SPLITS` 400) — mirrors the already-existing EQUAL-side test, no new suite
- [ ] 3.10 [GREEN] `needsSplitsReconstruction` L620-621: `effectiveSplitsInput === undefined` →
      `!effectiveSplitsInput || effectiveSplitsInput.length === 0`; `effectiveSplitType !== 'EQUAL'`
      stays the first conjunct (ADR-20)
- [ ] 3.11 [Verify] No new tests: existing PERCENTAGE `INVALID_PARTICIPANTS` test (L323) and sum-guard
      test (L93) pass unedited; EQUAL + explicit `participantIds` still skips the
      `expenseSplit.findMany`/`getActiveMemberIds` pair (Fix 2 gate) — confirm the existing assertions
      hold, don't duplicate them
- [ ] 3.12 [Verify] Spec scenarios (expense-management): explicit non-member rejected create/update,
      reconstructed-fallback succeeds, empty-splits-array reconstructs on PERCENTAGE, EQUAL unaffected
      by empty splits array

## Phase 4: deleteGroup Lock Reordering — PR 4 `[backend]`

Two to four small tests total — this is the first test file `deleteGroup` has ever had, and it is a
destructive, data-loss operation, so bare-minimum coverage of its core preconditions is warranted
even under ponytail's stricter discipline. Not exhaustive coverage of every pre-existing branch this
change does not touch.

- [ ] 4.1 [RED] Create `group.service.test.js`: `deleteGroup` runs inside `$transaction`;
      `invocationCallOrder` proves `period.deleteMany` before `group.delete` — the actual fix being
      tested
- [ ] 4.2 [GREEN] `group.service.js` L277: replace bare `prisma.group.delete` with
      `prisma.$transaction(async (tx) => { await tx.period.deleteMany({ where: { groupId } }); await tx.group.delete({ where: { id: groupId } }); })`
      (ADR-21)
- [ ] 4.3 [RED] ONE basic happy-path test: `deleteGroup` succeeds end-to-end when preconditions pass
- [ ] 4.4 [RED] ONE precondition test: `deleteGroup` still refuses (409) before the transaction opens
      when an active-expense/payment precondition fails — proves the existing guard logic survives,
      one representative case, not a test per pre-existing branch
- [ ] 4.5 [docs] `closure.service.js` L425-429: delete the stale lock-order comment, replace with a
      one-line pointer to design's lock-order section, same commit (ADR-25)
- [ ] 4.6 [infra] prisma mock: add `group.delete`, `period.deleteMany` stubs (ADR-30)
- [ ] 4.7 [Verify] Spec scenario (group-management): "Period rows are deleted before the Group row"

## Phase 5: assertAtomicTransition Extraction — PR 5 `[backend]`

Item 7 is the one genuinely concurrency-critical item — money/security-class, per ponytail's own
carve-out. It still gets its check. But the check is on the NEW helper only: the four EXISTING Cycle
2 suites passing with a ZERO-LINE diff are the regression proof for the 6 retrofitted call sites — no
new combinatorial per-site barrier suite is written (dropping the prior draft's planned
`transition-helper-concurrency.test.js`, ~250 lines, entirely).

- [ ] 5.1 [RED] `transitions.test.js`: `count: 1` resolves without throwing
- [ ] 5.2 [RED] `transitions.test.js`: `count: 0` and `count: 2` both throw the caller's exact
      `errorCode` + message at 409
- [ ] 5.3 [RED] `transitions.test.js`: `where`/`data` are forwarded verbatim, including
      `deletedAt: null` — the one real risk in this item (a helper that drops the payment sites' soft-
      delete predicate), test it directly
- [ ] 5.4 [GREEN] Create `apps/backend/src/utils/transitions.js`:
      `assertAtomicTransition(delegate, { where, data, errorCode, errorMessage })` (ADR-26/27)
- [ ] 5.5 [GREEN] `closure.service.js`: retrofit `startClosure` (L185-192), `completeClosure`
      (L255-264), `partialClosure` (L343-352), `finalClosure` (L430-441) — helper as the FIRST
      statement, `where`/`data` unchanged
- [ ] 5.6 [GREEN] `payment.service.js`: retrofit `acceptPayment` (L304-309), `rejectPayment`
      (L375-383), preserving `deletedAt: null` in `where` (ADR-27)
- [ ] 5.7 [Verify — ZERO-LINE DIFF, this IS the regression proof] `closure-concurrency.test.js`,
      `payment-concurrency.test.js`, `concurrency-barrier.test.js`, `soft-delete-filters.test.js` pass
      unedited. If any requires an edit to pass: STOP, revert the retrofit — do not adapt the test, and
      do not write a replacement combinatorial suite instead
- [ ] 5.8 [Verify] Grep sweep: no inline `updateMany` + `count !== 1` pair remains in
      `closure.service.js` or `payment.service.js`

## Phase 6: Final Verification (after all 5 PRs merged)

- [ ] 6.1 Run `pnpm --filter backend test && pnpm --filter frontend test` — full suite green
- [ ] 6.2 Run `pnpm -r run build` — passes
- [ ] 6.3 Grep sweep: no `isCreator` remains in `GroupDetailPage.jsx`; no unguarded `deletedAt` path
      remains in `item-reporting.service.js`
- [ ] 6.4 Run the ADR-10/13 money-bug repro against the real stack (not mocked); confirm `MISMATCH`
      and zero persisted splits before merge, per Migration/Rollout step 4
- [ ] 6.5 Optional: run ADR-15's detection query for pre-existing orphans (informational only —
      forward-fix only, no backfill)
