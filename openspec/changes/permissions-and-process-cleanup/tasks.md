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

**Addendum (PR 2, scope expansion confirmed in apply dispatch)** — two pieces of design.md's ADR-12
were pulled forward into this PR instead of PR 3, because both of their dependencies
(`assertSplitsSumToTotal`, `AppError('INVALID_PARTICIPANTS', ...)`) are created in PR 2 and neither
needs PR 3's `assertActiveMembers`/`participantIdsAreCallerProvided` work:
- `computeSplits`' inline sum-check (`expense.service.js` L126-129) was redirected to call the new
  shared `assertSplitsSumToTotal` instead of keeping its own copy of the comparison — confirmed by
  grep sweep there is now exactly ONE sum-check implementation, not two.
- `createExpense`'s COLLECTIVE inline path (ADR-13) now rejects an `items[].userId` outside
  `data.participantIds` with `INVALID_PARTICIPANTS` 400, with its own RED/GREEN test
  (`expense.service.test.js`, describe `createExpense — COLLECTIVE orphan-item rejection`).
  **Not yet done** (still PR 3's job, task 3.2's remainder): calling `assertSplitsSumToTotal` inside
  `createExpense`'s inline split-generation block as additional defense-in-depth — ADR-13's rejection
  already makes that guard unreachable there, so it was deliberately deferred rather than added
  speculatively (ponytail: don't add a check nothing can currently trigger).
- `computeSplits`' EQUAL branch, `assertActiveMembers`, `participantIdsAreCallerProvided`, and
  `needsSplitsReconstruction` (items 4/5) were NOT touched — still entirely PR 3's job.

- [x] 2.1 [RED] `item-reporting.service.test.js` — one small test per guard, 5 deletedAt checks + 2
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
- [x] 2.2 [GREEN] `item-reporting.service.js`: `deletedAt` guard after the `!expense`/`!item` 404 in
      `reportItem` (after L32), `updateItem` (after L92), `deleteItem` (after L135), `getItemStatus`
      (after L242) (ADR-5/6/8); widen `recomputeAndPersist` (L166) to return `null` when
      `deletedAt !== null` (ADR-7)
- [x] 2.3 [GREEN] `item-reporting.service.js`: add `NOT_PARTICIPANT` check after the `FORBIDDEN`
      ownership check in `updateItem` (L94-96) / `deleteItem` (L137-139) (ADR-9)
- [x] 2.4 [RED] ONE money-bug regression test — repro 150/[A,B]/A=50,B=50,orphan D=50 → `MISMATCH`,
      `expenseSplit.createMany` not called, `isLocked: false`. This is the real case; getItemStatus's
      identical filter (ADR-14) reuses the same derived `participantItems` logic and is intentionally
      NOT given its own duplicate test — one real case, not re-asserted per call site.
- [x] 2.5 [GREEN] `recomputeAndPersist` L170: derive `participantItems = expense.items.filter(Set(participantIds).has)`,
      use for `itemsSum` AND pass to `generateSplits` (ADR-10)
- [x] 2.6 [GREEN] `getItemStatus` L244: apply the same `participantItems` filter (ADR-14) — no new
      test per 2.4's note
- [x] 2.7 [RED] `splits.test.js` — ONE test: sum mismatch throws `VALIDATION_ERROR` 400. Mirrors the
      sibling passing-case test already in the file; no new combinatorial suite for
      `assertSplitsSumToTotal`.
- [x] 2.8 [GREEN] `utils/splits.js`: export `assertSplitsSumToTotal(splits, totalAmount)` (ADR-12);
      `generateSplits` gains `totalAmount` param, calls it between `calculateCollectiveSplits` and
      `createMany`
- [x] 2.9 [infra] `src/lib/__mocks__/prisma.js`: add `expenseItem.findUnique`/`update`/`delete` stubs
      (ADR-30)
- [x] 2.10 [docs] `errors.js` docblock: register `INVALID_PARTICIPANTS`, `EXPENSE_LOCKED`,
      `INVALID_SPLIT_TYPE` — zero new codes
- [x] 2.11 [Verify] Spec scenarios (expense-management): soft-deleted status check / report / update /
      delete, departed-participant orphan 403, orphan-excluded MISMATCH, inert recompute on
      soft-delete — walkthrough against 2.1/2.4's tests, no new suite

## Phase 3: expense.service.js — Orphan Rejection, Membership, Reconstruction — PR 3 `[backend]`

- [x] 3.1 [RED] ONE test: `createExpense` COLLECTIVE with an item outside `participantIds` →
      `INVALID_PARTICIPANTS` 400, nothing created (item 3's third and last case — PR2 covered the
      other two) — **done in PR 2** (apply dispatch pulled ADR-13 forward; see Phase 2's addendum).
      Test lives in `expense.service.test.js`, describe `createExpense — COLLECTIVE orphan-item
      rejection (ADR-13, expanded scope)`.
- [x] 3.2 [GREEN] `createExpense` after L229-231: reject any `items[].userId` not in
      `data.participantIds` (ADR-13) — **done in PR 2**. Remainder done here: calls
      `assertSplitsSumToTotal(splits, total)` right after `calculateCollectiveSplits` in the COLLECTIVE
      inline block, before `deleteMany`/`createMany` — mirrors `generateSplits`' placement. Re-checked
      reachability per the apply dispatch: under normal input it is unreachable to FAIL (ADR-13's
      rejection + `computeCollectiveStatus`'s own epsilon already guarantee agreement before this point
      is ever reached with `newStatus === 'COMPLETED'`), but it IS reachable and testable via mocking
      `calculateCollectiveSplits` to return a bad sum — same defense-in-depth pattern already used for
      PERCENTAGE's `calculatePercentageSplits` mock test in this same file. Added with its own RED/GREEN
      test (`createExpense — COLLECTIVE split-sum guard`), not left out — ADR-12 names this exact call
      site alongside `generateSplits` and `computeSplits`.
- [x] 3.3 [RED] ONE test: EQUAL `participantIds` with a non-member → `INVALID_PARTICIPANTS` 400, via
      `createExpense` (the shared `computeSplits` EQUAL branch is the single code path both callers go
      through with the default `participantIdsAreCallerProvided = true`, so one representative case
      covers both, per the task's own note — not duplicated for `updateExpense`)
- [x] 3.4 [GREEN] Added private `assertActiveMembers(groupId, userIds)` near `getActiveMemberIds`
      (ADR-16/18); `computeSplits` gained 6th param `{ participantIdsAreCallerProvided = true } = {}`;
      EQUAL branch validates via `assertActiveMembers` only when the flag is true; PERCENTAGE's inline
      loop replaced by the same shared call (same error code/message/order, zero behavior change —
      confirmed by the pre-existing PERCENTAGE tests passing unedited)
- [x] 3.5 [RED] ONE test: `PUT { amount }` on an EQUAL expense with a departed-member persisted split
      → succeeds. **Honesty note (ponytail, no ceremony theater)**: this test does NOT actually go RED
      between 3.4 and 3.6 — `updateExpense`'s reconstruction already filters the persisted list to
      ACTIVE members only (pre-existing code, 60 lines up), so the departed member is excluded from
      `effectiveParticipantIds` before `computeSplits` ever sees it, regardless of the flag's value.
      ADR-16 names this exact non-locality ("that proof is non-local... depends on a filter 60 lines
      away staying in place"). The test still passes and is kept as the spec's required regression
      scenario; 3.6's flag is defensive against that filter being weakened later, not a fix for a
      currently-reachable bug.
- [x] 3.6 [GREEN] `updateExpense`: declared `participantIdsAreCallerProvided = true` alongside
      `effectiveParticipantIds`; flipped to `false` on the line immediately after
      `effectiveParticipantIds = reconstructedParticipantIds` (ADR-17); option passed into the
      `computeSplits` call
- [x] 3.7 [RED] ONE test: PERCENTAGE request with explicit `splits` and NO `participantIds`,
      containing a non-member `userId` → `INVALID_PARTICIPANTS` 400 (adjacent-gate fix, user-confirmed
      fold-in)
- [x] 3.8 [GREEN] `computeSplits` PERCENTAGE branch: hoisted the
      `assertActiveMembers(groupId, filteredSplits.map(...))` call out of the
      `if (participantIds && length > 0)` gate so it always runs. Required updating 3 pre-existing
      tests' fixtures to add an active-member mock they previously didn't need (same "stale fixture,
      not a production bug" class as PR 2's `deletedAt` fixture fix) — the asserted outcomes of those
      tests are unchanged.
- [x] 3.9 [RED] ONE test: `PUT { amount, splits: [] }` on PERCENTAGE → reconstructs and succeeds (was
      `INVALID_SPLITS` 400) — mirrors the already-existing EQUAL-side test, no new suite
- [x] 3.10 [GREEN] `needsSplitsReconstruction`: `effectiveSplitsInput === undefined` →
      `!effectiveSplitsInput || effectiveSplitsInput.length === 0`; `effectiveSplitType !== 'EQUAL'`
      stays the first conjunct (ADR-20)
- [x] 3.11 [Verify] No new tests: existing PERCENTAGE `INVALID_PARTICIPANTS` test and sum-guard test
      pass unedited (behavior-preserving refactor confirmed); EQUAL + explicit `participantIds` still
      skips the `expenseSplit.findMany` reconstruction query (Fix 2 gate) — confirmed, that assertion
      still holds (it does now also call `groupMember.findMany` via the new validation, which the test
      doesn't assert against, so no conflict)
- [x] 3.12 [Verify] Spec scenarios (expense-management) walked against the diff: explicit non-member
      rejected on create (3.3) and reconstructed-fallback succeeds on update (3.5) both covered;
      empty-splits-array reconstructs on PERCENTAGE (3.9) and EQUAL unaffected by an empty splits array
      (pre-existing `(Second addendum regression — Bug 1)` test, unedited) both covered. Full suite:
      `pnpm --filter backend test && pnpm --filter frontend test` — 88/88 backend, 50/50 frontend.

**Addendum (PR 3, post-apply code review)** — 3 real findings, none a correctness bug, triaged:

1. **NOT fixed, needs its own careful TDD pass, not a quick edit** — `participantIdsAreCallerProvided` is
   honored by the EQUAL branch (skips re-validation on a reconstructed list) but ignored by PERCENTAGE's
   `assertActiveMembers` call, which always re-runs even on reconstructed data — a wasted `groupMember.findMany`
   on every `PUT { amount }`-style PERCENTAGE reconstruction. The obvious fix (gate PERCENTAGE's call on the
   same flag) is riskier than it looks: the flag tracks whether `participantIds` was reconstructed, but
   PERCENTAGE's validation target is `filteredSplits`' userIds — and `splits` and `participantIds` can be
   reconstructed independently of each other (e.g. caller sends explicit `participantIds` but omits `splits`).
   Blindly reusing the flag here could skip a validation that still matters, or reject a legitimately
   reconstructed case. Deferred to a dedicated fix with its own RED/GREEN cases covering the independent
   reconstruction combinations, not folded into this PR.
2. **NOT fixed, deliberately out of scope** — `createExpense`'s COLLECTIVE path still validates membership
   with its own hand-rolled `groupMember.findMany` + length check instead of the new shared `assertActiveMembers`.
   Consolidating risks silently dropping its incidental duplicate-`userId` detection, which `assertActiveMembers`
   doesn't do. Real duplication, but not a bug today — noted for a future cleanup, not rushed here.
3. **Accepted, not fixed** — two findings about `computeSplits` trusting `participantIdsAreCallerProvided: false`
   via a doc comment with no internal assertion, and the flag being a separately-tracked `let` that could drift
   from `effectiveParticipantIds`'s reassignment if a future caller/branch is added carelessly. Both are
   speculative hardening against hypothetical future misuse with no current caller that triggers either risk —
   per `ponytail`, not building for a future nobody asked for.

## Phase 4: deleteGroup Lock Reordering — PR 4 `[backend]`

Two to four small tests total — this is the first test file `deleteGroup` has ever had, and it is a
destructive, data-loss operation, so bare-minimum coverage of its core preconditions is warranted
even under ponytail's stricter discipline. Not exhaustive coverage of every pre-existing branch this
change does not touch.

- [x] 4.1 [RED] Create `group.service.test.js`: `deleteGroup` runs inside `$transaction`;
      `invocationCallOrder` proves `period.deleteMany` before `group.delete` — the actual fix being
      tested
- [x] 4.2 [GREEN] `group.service.js` L277: replace bare `prisma.group.delete` with
      `prisma.$transaction(async (tx) => { await tx.period.deleteMany({ where: { groupId } }); await tx.group.delete({ where: { id: groupId } }); })`
      (ADR-21)
- [x] 4.3 [RED] ONE basic happy-path test: `deleteGroup` succeeds end-to-end when preconditions pass
- [x] 4.4 [RED] ONE precondition test: `deleteGroup` still refuses (409) before the transaction opens
      when an active-expense/payment precondition fails — proves the existing guard logic survives,
      one representative case, not a test per pre-existing branch
- [x] 4.5 [docs] `closure.service.js` L425-429: delete the stale lock-order comment, replace with a
      one-line pointer to design's lock-order section, same commit (ADR-25)
- [x] 4.6 [infra] prisma mock: add `group.delete`, `period.deleteMany` stubs (ADR-30)
- [x] 4.7 [Verify] Spec scenario (group-management): "Period rows are deleted before the Group row" —
      covered by task 4.1's test (service-level `$transaction` + `invocationCallOrder` proof); full
      suite green: `pnpm --filter backend test` 91/91, `pnpm --filter frontend test` 50/50.

**Addendum (PR 4, post-apply code review)** — 2 real findings, fixed directly (trivial):
- `group.controller.js`'s doc comment above `remove` said cascade handles everything, with no mention
  that Period rows are now deleted explicitly to control lock order — a future reader could "simplify"
  `deleteGroup` back to a bare `prisma.group.delete()` and silently reintroduce the Group-before-Period
  order this PR fixes. Updated to point at ADR-21.
- `group.service.test.js`'s "succeeds end-to-end when all preconditions pass" test was redundant with
  4.1's lock-order test — both use identical `mockPreconditionsPass()` and the lock-order test's
  unwrapped `await` already proves the happy path resolves. Removed; 4.1 and the precondition-failure
  test now cover task 4.3's intent between them (2 tests total, not 3 — still inside ponytail's 2-4
  budget for this item). Full suite after removal: `pnpm --filter backend test` 90/90.

Deliberately NOT fixed (genuine findings, but out of item 6's scope — "reorder deleteGroup's locks,"
not "make deleteGroup's preconditions atomic" or "add new business rules"):
- `deleteGroup`'s `GROUP_HAS_DATA` precondition counts are read before `$transaction` opens and never
  re-asserted inside it (unlike closure.service.js's atomic `updateMany`+count guards). A record created
  in the gap between the count read and commit gets silently cascade-deleted. **Pre-existing** — the old
  bare `prisma.group.delete()` had the identical gap; wrapping in a transaction didn't introduce or
  worsen it. Real bug, needs its own ADR for precondition atomicity, not bundled into a lock-order PR.
- `tx.group.delete` has no P2025 handling for a concurrent double-delete race. **Pre-existing** — the
  old single-statement delete had the same exposure; `error.middleware.js` already only special-cases
  `AppError`/P2002 for every other service, not just this one.
- `error.middleware.js` has no handling for P2028 (timeout) / P2034 (deadlock), which `deleteGroup` can
  now throw for the first time now that it's an interactive `$transaction`. Real gap, but it's the same
  gap closure.service.js's Cycle 2 transactions already have — a middleware-wide fix, not scoped to this
  item.
- Splitting one cascade statement into two sequential ones inside the transaction adds wall-clock time
  against Prisma's default 5s interactive-transaction timeout. Speculative at current data volumes
  (periods/expenses per group); not hardening against a risk nobody has hit.
- A `deleteGroup`/closure-function race could make `closure.service.js`'s `CLOSURE_BLOCKED` guard report
  "period no longer in CLOSING/OPEN status" when the real cause is the period being deleted mid-flight.
  Misleading message only (still a correct 409, not silent corruption) — not worth widening item 6's
  diff to disambiguate.

**Raised to the user, decided not worth tracking**: a CLOSED (`finalClosure`'d) group can still be
deleted once its historical records are soft-deleted to zero — `deleteGroup` only checks ownership and
active counts, never `group.status`. Confirmed in code (not just the review's claim), but the user's
call: deletion is an explicit, separate destructive owner action from closure, and closure's
"irreversible" docstring is about blocking new activity, not about blocking deletion. Not a bug, no
follow-up item.

## Phase 5: assertAtomicTransition Extraction — PR 5 `[backend]`

Item 7 is the one genuinely concurrency-critical item — money/security-class, per ponytail's own
carve-out. It still gets its check. But the check is on the NEW helper only: the four EXISTING Cycle
2 suites passing with a ZERO-LINE diff are the regression proof for the 6 retrofitted call sites — no
new combinatorial per-site barrier suite is written (dropping the prior draft's planned
`transition-helper-concurrency.test.js`, ~250 lines, entirely).

- [x] 5.1 [RED] `transitions.test.js`: `count: 1` resolves without throwing
- [x] 5.2 [RED] `transitions.test.js`: `count: 0` and `count: 2` both throw the caller's exact
      `errorCode` + message at 409
- [x] 5.3 [RED] `transitions.test.js`: `where`/`data` are forwarded verbatim, including
      `deletedAt: null` — the one real risk in this item (a helper that drops the payment sites' soft-
      delete predicate), test it directly
- [x] 5.4 [GREEN] Create `apps/backend/src/utils/transitions.js`:
      `assertAtomicTransition(delegate, { where, data, errorCode, errorMessage })` (ADR-26/27)
- [x] 5.5 [GREEN] `closure.service.js`: retrofit `startClosure` (L185-192), `completeClosure`
      (L255-264), `partialClosure` (L343-352), `finalClosure` (L430-441) — helper as the FIRST
      statement, `where`/`data` unchanged
- [x] 5.6 [GREEN] `payment.service.js`: retrofit `acceptPayment` (L304-309), `rejectPayment`
      (L375-383), preserving `deletedAt: null` in `where` (ADR-27)
- [x] 5.7 [Verify — ZERO-LINE DIFF, this IS the regression proof] `closure-concurrency.test.js`,
      `payment-concurrency.test.js`, `concurrency-barrier.test.js`, `soft-delete-filters.test.js` pass
      unedited. If any requires an edit to pass: STOP, revert the retrofit — do not adapt the test, and
      do not write a replacement combinatorial suite instead. Confirmed via
      `git diff main -- apps/backend/src/services/__tests__/closure-concurrency.test.js
      apps/backend/src/services/__tests__/payment-concurrency.test.js
      apps/backend/src/services/__tests__/concurrency-barrier.test.js
      apps/backend/src/services/__tests__/soft-delete-filters.test.js` → empty. Full suite:
      `pnpm --filter backend test` 93/93 (90 baseline + 3 new helper tests), `pnpm --filter frontend
      test` 50/50.
- [x] 5.8 [Verify] Grep sweep: no inline `updateMany` + `count !== 1` pair remains in
      `closure.service.js` or `payment.service.js` — confirmed, only comments mentioning `updateMany`
      remain (explaining why the follow-up `findUnique` is needed), all six sites now call
      `assertAtomicTransition` as their first transaction statement.

## Phase 6: Final Verification (after all 5 PRs merged)

- [ ] 6.1 Run `pnpm --filter backend test && pnpm --filter frontend test` — full suite green
- [ ] 6.2 Run `pnpm -r run build` — passes
- [ ] 6.3 Grep sweep: no `isCreator` remains in `GroupDetailPage.jsx`; no unguarded `deletedAt` path
      remains in `item-reporting.service.js`
- [ ] 6.4 Run the ADR-10/13 money-bug repro against the real stack (not mocked); confirm `MISMATCH`
      and zero persisted splits before merge, per Migration/Rollout step 4
- [ ] 6.5 Optional: run ADR-15's detection query for pre-existing orphans (informational only —
      forward-fix only, no backfill)
