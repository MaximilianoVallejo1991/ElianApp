## Verification Report

**Change**: permissions-and-process-cleanup
**Scope**: PR 2 only (Phase 2 - item-reporting.service.js guards + orphan-item sum fix + portable sum guard)
**Branch**: fix/item-reporting-guards-and-orphan-sum (2 commits ahead of main, not pushed, not merged - see Note on commit count below)
**Version**: spec.md delta, items 2 and 3 (expense-management)
**Mode**: Strict TDD

### Completeness (Phase 2 tasks only)
| Metric | Value |
|--------|-------|
| Phase 2 tasks total | 11 (2.1-2.11) |
| Phase 2 tasks complete | 11/11 [x] |
| Phase 3 tasks pulled forward into PR2 | 3.1 [x] (done here), 3.2 [~] partial (accurately annotated, remainder genuinely deferred) |
| Phase 3 tasks remaining (3.3-3.12) | Correctly untouched, [ ] |

### Build and Tests Execution
Tests: PASS - 83 passed / 0 failed (backend), 50 passed / 0 failed (frontend)

pnpm --filter backend test
 Test Files  7 passed (7)
      Tests  83 passed (83)

pnpm --filter frontend test
 Test Files  4 passed (4)
      Tests  50 passed (50)

Both counts match the apply-progress report (73 baseline + 10 new backend tests; frontend untouched this PR, unchanged at 50).

Coverage: not available (no coverage tool detected) - skipped cleanly, not a failure.

### Scope Containment (git diff main...branch --stat)

 apps/backend/src/lib/__mocks__/prisma.js              |   6 +
 .../src/services/__tests__/expense.service.test.js    |  33 ++
 .../__tests__/item-reporting.service.test.js          | 178 ++++++++-
 apps/backend/src/services/expense.service.js          |  36 +-
 apps/backend/src/services/item-reporting.service.js   |  62 ++-
 apps/backend/src/utils/__tests__/splits.test.js       |  15 +
 apps/backend/src/utils/errors.js                      |   3 +-
 apps/backend/src/utils/splits.js                      |  21 +
 .../permissions-and-process-cleanup/tasks.md          |  53 ++-
 9 files changed, 371 insertions(+), 36 deletions(-)

apps/frontend - zero changes (confirmed via git diff --stat -- apps/frontend, empty output).

Confirmed via direct diff of expense.service.js: only two hunks exist -
(1) computeSplits's inline sum comparison redirected to assertSplitsSumToTotal,
(2) createExpense's new ADR-13 orphan-item rejection block. computeSplits' EQUAL
branch, assertActiveMembers, participantIdsAreCallerProvided, and
needsSplitsReconstruction (L620-621, L632-690) are untouched by this diff -
genuinely still PR 3's job, not just claimed to be.

### Finding 2 re-verification (participant-item filter dedup, commit 7b51057)
Confirmed present and correct. item-reporting.service.js now has a single
filterParticipantItems(expense) helper (L21-24); both recomputeAndPersist
(L209) and getItemStatus (L293) call it instead of duplicating the Set+filter
logic. Grep confirms no second inline copy remains.

### Finding 1 re-verification (createExpense inline COLLECTIVE split block, no assertSplitsSumToTotal call)
Confirmed real but currently unreachable, and accurately tracked.
createExpense's inline split-generation block (L283-298 after the diff) calls
calculateCollectiveSplits then expenseSplit.createMany directly, with no
assertSplitsSumToTotal call. ADR-13's new rejection loop (L231-245) runs first
and throws before this block can ever see an item outside participantIds, so
the gap cannot currently trigger. tasks.md Phase 3 task 3.2 explicitly marks
this as the REMAINING item for this PR, not silently dropped. Deferral is
honestly described.

### Grep sweep: single source of sum-check truth

grep -rn "computedTotal" apps/backend/src
apps/backend/src/utils/splits.js:150:  const computedTotal = (splits || []).reduce(...)
apps/backend/src/utils/splits.js:151:  if (Math.abs(computedTotal - totalAmount) > 0.01) {

Confirmed: assertSplitsSumToTotal in utils/splits.js is the ONLY
implementation of the sum-mismatch check. computeSplits (expense.service.js)
and generateSplits (item-reporting.service.js) both call it; neither keeps
its own copy.

### Money-bug scenario - concrete trace (the exact repro from the discovery)
Setup: COLLECTIVE expense, amount=150, sharedCosts=0, participantIds=[A,B],
items A=50, B=50, D=50 (D removed from participantIds, orphaned).

Before this fix (pre-PR2 code, reconstructed from git history): itemsSum
summed ALL items including D -> 50+50+50=150. computeCollectiveStatus(150,0,150)
is within +/-0.01, so status became COMPLETED. generateSplits via
calculateCollectiveSplits maps over participantIds only (A,B), looking up each
one's item via itemMap.get(userId) - D's 50 is in the map but D is never
iterated, so it is silently dropped. Persisted splits: A=50, B=50, summing to
100, while expense.amount is 150. A COMPLETED, locked expense with splits
under-summing the total by exactly the orphan's amount - the money bug.

After this fix: filterParticipantItems excludes D up front, so
participantItems = [A,B] and itemsSum = 100. computeCollectiveStatus(100,0,150)
gives |100-150|=50 which is greater than 0.01, so status becomes MISMATCH.
recomputeAndPersist takes the else branch: expense.update sets status
MISMATCH, isLocked false. generateSplits is never called, expenseSplit.createMany
is never called. Confirmed by the actual test
(item-reporting.service.test.js:223-249) using these exact numbers, asserting
result === 'MISMATCH', expenseSplit.createMany not called, and the correct
expense.update call.

The fix genuinely closes the root cause (the sum no longer silently matches),
not just the symptom - it was traced through the real code paths, not
asserted from the test alone.

### Spec Compliance Matrix (items 2 and 3, expense-management)
| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Get Item Reporting Status | Status check on soft-deleted expense | item-reporting.service.test.js > getItemStatus deletedAt guard | COMPLIANT |
| Report Individual Item (COLLECTIVE) | Report item on a soft-deleted expense | reportItem > new rejects EXPENSE_NOT_FOUND test | COMPLIANT |
| Report Individual Item (COLLECTIVE) | Non-participant cannot add items | reportItem (pre-existing test, re-run green, unaffected) | COMPLIANT |
| Update Individual Item (COLLECTIVE) | Update item on a soft-deleted expense | updateItem > new rejects EXPENSE_NOT_FOUND test | COMPLIANT |
| Update Individual Item (COLLECTIVE) | Departed participant cannot update own orphaned item | updateItem > new NOT_PARTICIPANT test | COMPLIANT |
| Delete Individual Item (COLLECTIVE) | Delete item on a soft-deleted expense | deleteItem > new rejects EXPENSE_NOT_FOUND test | COMPLIANT |
| Delete Individual Item (COLLECTIVE) | Departed participant cannot delete own orphaned item | deleteItem > new NOT_PARTICIPANT test | COMPLIANT |
| Validate COLLECTIVE Status | Orphaned item excluded, flips to MISMATCH | recomputeAndPersist > orphan-exclusion test | COMPLIANT |
| Validate COLLECTIVE Status | Recompute on soft-deleted expense is inert | recomputeAndPersist > inert test | COMPLIANT |
| Validate COLLECTIVE Status | Items sum matches total (happy path) | none found | PARTIAL - pre-existing gap, predates this PR, out of scope |
| Generate Splits on COLLECTIVE Completion | Mismatched generated splits rejected, not persisted | splits.test.js assertSplitsSumToTotal unit test plus structural read of generateSplits call site | COMPLIANT (unit-level, consistent with ponytail scope) |
| Generate Splits on COLLECTIVE Completion | Generate splits on completion (happy path) | none found | PARTIAL - pre-existing gap, predates this PR, out of scope |
| (no spec.md requirement exists for this) | createExpense COLLECTIVE rejects item outside participantIds (ADR-13) | expense.service.test.js ADR-13 test | Implemented and tested, but has no corresponding spec.md scenario (see WARNING-1) |

Compliance summary: 9/9 scenarios that have both a spec requirement AND fall
in this PR's delta scope are COMPLIANT. 2 pre-existing scenarios (happy-path
COMPLETED cases) have no unit test anywhere in the codebase, predate this PR,
and are correctly out of this PR's scope per the ponytail testing-philosophy
instruction in tasks.md - not treated as a PR2 defect.

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | Yes | apply-progress documents git-stash RED isolation methodology |
| All tasks have tests | Yes | 2.1/2.4/2.7 are RED tasks, each with a matching GREEN task |
| RED confirmed (tests exist) | Yes | All 10 new test cases found in the 3 test files |
| GREEN confirmed (tests pass) | Yes | Re-ran independently: 83/83 backend pass now |
| Triangulation adequate | Yes | One test per real guard/case, matches tasks.md's own ponytail-scoped count (7 guard + 1 money-bug + 1 sum-guard + 1 ADR-13 = 10) |
| Safety Net for modified files | Yes | apply-progress documents 3 pre-existing fixture gaps found and fixed (missing deletedAt: null), root-caused correctly as stale fixtures, not production bugs |

TDD Compliance: 6/6 checks passed (based on cross-referencing apply-progress's
self-report against actual re-execution; the RED-state git-stash isolation
itself was not independently re-run by this verification, only GREEN was
re-verified by direct execution)

### Assertion Quality
No violations found in the 10 new test cases across item-reporting.service.test.js,
splits.test.js, expense.service.test.js. All assertions call production code
(reportItem, updateItem, deleteItem, recomputeAndPersist, getItemStatus,
createExpense, assertSplitsSumToTotal) and assert on concrete returned/thrown
values or mock call presence tied to a real behavioral claim (e.g.
expenseSplit.createMany not called). No tautologies, no ghost loops, no
smoke-test-only patterns.

Assertion quality: All assertions verify real behavior

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 10 (new) | 3 | vitest |
| Integration | 0 | - | not used in this PR |
| E2E | 0 | - | not used in this PR |

### Issues Found

CRITICAL: None

WARNING:
1. design.md's Open Questions section (L480-485) flags ADR-13 (createExpense's
   orphan-item rejection) as an API behavior change requiring owner
   confirmation - a previously-200 request now returns 400
   INVALID_PARTICIPANTS. That checkbox is still unchecked in design.md, even
   though a separate, broader "Risk row 1 / option (b)" checkbox (L493-495)
   was marked resolved. The behavior was implemented and shipped in this PR
   (pulled forward from PR 3) without a corresponding spec.md scenario
   documenting it, and without visible confirmation that the owner/user
   explicitly signed off on this specific breaking-change implication.
   Recommend: get explicit confirmation before merging to main, and add the
   missing scenario to specs/expense-management/spec.md (either now or as
   part of PR 3, since PR 3 is where ADR-13 was originally scoped).
2. Two spec scenarios ("Items sum matches total" happy path, "Generate
   splits on completion" happy path) have no covering unit test anywhere in
   the codebase. This predates PR2, is not introduced or regressed by this
   PR, and is explicitly out of scope per tasks.md's ponytail testing
   philosophy and this verification's instructions - flagged here only for
   traceability completeness, not as a blocker.

SUGGESTION:
1. The dispatch described this PR as "3 commits"; git rev-list --count
   main..fix/item-reporting-guards-and-orphan-sum shows 2 commits (9d79801,
   7b51057). The original commit c9af282 (which apply-progress references)
   was amended into 9d79801 to strip an accidental AI co-author line, then
   superseded - reflog confirms this. Purely a factual correction for the
   human reviewer, not a defect.

### Attribution Check

git log --format="%H%n%B%n===END===" main..fix/item-reporting-guards-and-orphan-sum | grep -i "co-authored"
(no matches)

Confirmed clean in both final commits (9d79801, 7b51057). The earlier
c9af282 (superseded by amend, per reflog) is no longer reachable from the
branch tip.

### Verdict
PASS WITH WARNINGS

Phase 2 is complete, correctly scoped, fully tested per the ponytail-scoped
plan (10 new tests, matching tasks.md's own count), and the money-bug fix is
genuinely closed at the root cause (traced through concrete numbers, not
just asserted by the test). Both code-review findings are confirmed accurate:
the dedup fix is real and used at both call sites; the deferred gap is real,
currently unreachable, and honestly tracked. Scope containment is clean - no
PR 3 territory (computeSplits EQUAL branch, needsSplitsReconstruction,
assertActiveMembers) was touched. No AI attribution remains in either commit.
The one open item worth a human decision before merge is WARNING-1 (ADR-13's
unconfirmed owner sign-off) - this does not block opening the PR for review
(review is in fact the right venue to get that confirmation), but it should
be called out explicitly in the PR description.
