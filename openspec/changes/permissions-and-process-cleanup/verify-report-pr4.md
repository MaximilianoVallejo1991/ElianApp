## Verification Report

**Change**: permissions-and-process-cleanup
**Scope**: PR 4 only (Phase 4 - deleteGroup lock-order reordering, item 6)
**Branch**: fix/delete-group-lock-order (3 commits ahead of main, not pushed, not merged)
**Version**: specs/group-management/spec.md delta, "Delete Group" requirement - scenario "Period rows are deleted before the Group row"
**Mode**: Strict TDD

### Completeness (Phase 4 tasks only)
| Metric | Value |
|--------|-------|
| Phase 4 tasks total | 7 (4.1-4.7) |
| Phase 4 tasks complete | 7/7 [x] |
| Addendum items (post-apply code review) | 2 real findings, both fixed directly in commit b5731aa |
| Deliberately deferred findings | 4, each with a stated reason |
| Raised-to-user item | 1 (CLOSED-group deletion), explicit user decision recorded as not worth tracking |

All 7 checkboxes were re-derived from the diff, not trusted from the marks:
- 4.1 - group.service.test.js test 1 asserts $transaction called once, period.deleteMany/group.delete called with correct args, and invocationCallOrder[0] for period.deleteMany is less than for group.delete. Confirmed present and is the actual fix being tested.
- 4.2 - group.service.js L277 now reads exactly prisma.$transaction(async (tx) => { await tx.period.deleteMany({ where: { groupId } }); await tx.group.delete({ where: { id: groupId } }); }), matching what ADR-21 specifies. Preconditions (owner check, active-expense count, active-payment count) are untouched, outside the transaction.
- 4.3 - the originally-written happy-path test was removed in the addendum commit as redundant (see Addendum Accuracy below); task box left [x] but tasks.md's own addendum text explains why - this is accurate self-reporting, not a stale checkmark.
- 4.4 - group.service.test.js test 2 ("still refuses with GROUP_HAS_DATA 409 before the transaction opens...") confirmed present, asserts prisma.$transaction is never called when expense.count returns 1.
- 4.5 - closure.service.js L422-429 stale 5-line comment ("the real fix belongs to deleteGroup and is out of scope here") is gone, replaced with a 2-line pointer to design.md's "Item 6 - lock order" (ADR-21/22). Confirmed in the FIRST commit (a95a660), satisfying ADR-25's "same commit" requirement.
- 4.6 - src/lib/__mocks__/prisma.js now has group.delete: vi.fn() and period.deleteMany: vi.fn(), plus an updated docblock. Confirmed additive only - no pre-existing stub signature changed, consistent with ADR-30's "extend, never redefine."
- 4.7 - re-ran both suites independently: pnpm --filter backend test gave 90/90, pnpm --filter frontend test gave 50/50. Matches the addendum's post-removal count exactly.

### Build and Tests Execution
Tests: PASS - 90 passed / 0 failed (backend), 50 passed / 0 failed (frontend)

```text
pnpm --filter backend test
 Test Files  8 passed (8)
      Tests  90 passed (90)

pnpm --filter frontend test
 Test Files  4 passed (4)
      Tests  50 passed (50)
```

Coverage: not available (no coverage tool detected in apps/backend/package.json scripts) - skipped cleanly, not a failure.
Lint/type-check: not available (no lint/typecheck script in apps/backend/package.json) - skipped cleanly, consistent with prior PR verify reports in this change.

### Regression Check - Cycle 2 concurrency baseline (PR 5 dependency)
Ran the 4 named suites directly and confirmed a zero-line diff against main:

```text
git diff main..fix/delete-group-lock-order --stat -- \
  "**/closure-concurrency.test.js" "**/payment-concurrency.test.js" \
  "**/concurrency-barrier.test.js" "**/soft-delete-filters.test.js"
(no output - confirmed unedited)

npx vitest run src/services/__tests__/closure-concurrency.test.js \
  src/services/__tests__/payment-concurrency.test.js \
  src/services/__tests__/concurrency-barrier.test.js \
  src/services/__tests__/soft-delete-filters.test.js
 Test Files  4 passed (4)
      Tests  37 passed (37)
```

All 37 tests across the 4 suites pass unedited. PR 5's planned ADR-28 zero-line-diff regression contract is intact going into this PR; PR 4 did not touch any of these 4 files.

### Scope Containment (git diff main..fix/delete-group-lock-order --stat)

```text
apps/backend/src/controllers/group.controller.js                     |  3 +-
apps/backend/src/lib/__mocks__/prisma.js                             |  6 ++-
apps/backend/src/services/__tests__/group.service.test.js            | 51 +++++++++++++++
apps/backend/src/services/closure.service.js                         |  7 +--
apps/backend/src/services/group.service.js                           |  9 ++-
openspec/changes/permissions-and-process-cleanup/tasks.md            | 56 +++++++++++++--
6 files changed, 117 insertions(+), 15 deletions(-)
```

Well under the 400-changed-line PR review budget. No touch to expense.service.js, payment.service.js, item-reporting.service.js, transitions.js (doesn't exist yet - PR 5's job), or any frontend file. Exactly the 5 files design.md's File Changes table names for item 6 (group.service.js, group.controller.js, closure.service.js, group.service.test.js, prisma.js mock), plus tasks.md.

### ADR Compliance (design.md)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| ADR-21 (the transaction, exact shape) | Yes | group.service.js diff matches the specified $transaction block; preconditions stay outside, unchanged |
| ADR-22 (verified real lock-order reversal, not a no-op) | Yes (design-level, not re-litigated) | Postgres AFTER-ROW-trigger reasoning is sound; this PR's test proves the application-level call order the design predicts, which is the testable surface of ADR-22's claim |
| ADR-23 (cascade stays, not removed) | Yes | schema.prisma untouched - confirmed no diff to that file |
| ADR-24 (new SET NULL lock acquisitions, accepted no-guard) | Yes | No new guard added; correctly treated as accepted, documented side effect, not a defect |
| ADR-25 (stale comment deleted same commit) | Yes | Done in the first commit (a95a660), not deferred to the addendum |
| ADR-30 (mock extended, not redefined) | Yes | Only group.delete and period.deleteMany added; every pre-existing stub is untouched |

### Spec Compliance Matrix (group-management)
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Delete Group | Owner deletes empty group | none (no controller/HTTP-layer test exists anywhere in this codebase - pre-existing project-wide convention, not a PR 4 gap) | PARTIAL - pre-existing, out of scope |
| Delete Group | Owner deletes group with expenses | none (same reason) | PARTIAL - pre-existing, out of scope |
| Delete Group | Non-owner deletes group | none dedicated (pre-existing FORBIDDEN throw untouched by this PR, no regression) | PARTIAL - pre-existing, out of scope |
| Delete Group | Period rows are deleted before the Group row | group.service.test.js > "runs inside $transaction with tx.period.deleteMany invoked before tx.group.delete (ADR-21)" | COMPLIANT |

Compliance summary: 1/1 scenario in this PR's actual delta is COMPLIANT, with a runtime-executed covering test. The other 3 scenarios under "Delete Group" have no HTTP/controller-level test anywhere in the backend test suite - confirmed by a repo-wide search for a DELETE /groups or group.controller-targeting test file (none found); this is a pre-existing, codebase-wide testing-layer gap (the project has no supertest/HTTP integration layer at all, only mocked-Prisma service unit tests), not something PR 4 introduced or was asked to close. Flagged for traceability only, consistent with how PR 2 and PR 3's verify reports treated equivalent pre-existing gaps.

The new scenario's test is genuine coverage, not just an assertion dressed up as one: it calls the real deleteGroup through the real prisma.$transaction path (the mock's $transaction implementation runs the callback against the same mock object as tx, so invocationCallOrder comparisons are a true cross-call ordering proof, not a tautology), and a regression to the old prisma.group.delete({ where: { id: groupId } }) bare call (no transaction) would fail this test immediately ($transaction never called).

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | Yes | apply-progress (Engram sdd/permissions-and-process-cleanup/apply-progress) documents the RED-to-GREEN sequence narratively; no literal "TDD Cycle Evidence" table, consistent with this project's established self-report format in PR 1-3 |
| All tasks have tests | Yes | 4.1 [RED] and 4.4 [RED] both have matching test cases in group.service.test.js |
| RED confirmed (tests exist) | Yes | Both test files/cases verified present in the current tree |
| GREEN confirmed (tests pass) | Yes | Re-ran independently: 90/90 backend pass now |
| Triangulation adequate | Single (expected) | Only one scenario exists for the lock-order fix itself (4.1); this is correct per tasks.md - there is exactly one spec scenario for item 6, not under-triangulated |
| Safety Net for modified files | Partial | group.service.js and closure.service.js were both modified with no pre-existing test file to run as a safety net before this PR - group.service.test.js is brand new. This is unavoidable (the file genuinely had zero tests before), explicitly acknowledged in tasks.md's Phase 4 preamble, not a gap this PR could have closed differently |

TDD Compliance: 5/6 checks pass cleanly; the 6th (Safety Net) is a structural pre-existing condition (no tests existed to run), not a process failure - tasks.md's own framing ("first test file deleteGroup has ever had") already discloses this.

Apply-progress accuracy note: Engram's stored apply-progress (id 567) still describes the pre-addendum state (3 tests, 91/91) and was not updated after the addendum commit (b5731aa) dropped the redundant happy-path test to reach 90/90, 2 tests. tasks.md IS current and accurate (see Addendum Accuracy below). This is a documentation-sync gap in Engram only, not a code or test defect - see SUGGESTION-1.

### Assertion Quality
No violations found in group.service.test.js. Both tests call real production code (deleteGroup) through the mocked Prisma client; both assert on concrete, behavior-tied outcomes ($transaction invocation, argument values, cross-call ordering, and a rejected promise matching { code, status }) rather than implementation-detail-only checks. Mock/assertion ratio is reasonable (1 vi.mock() call vs. 4-6 expect() calls per test) and is itself the correct test layer for this behavior - deleteGroup's only externally observable effect is which Prisma calls fire, in what order, so asserting on the mock IS asserting on behavior here, not an implementation-detail leak.

Assertion quality: All assertions verify real behavior

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 2 (new) | 1 | vitest |
| Integration | 0 | - | not used anywhere in this backend |
| E2E | 0 | - | not used anywhere in this backend |

### Addendum Accuracy (tasks.md, PR 4 post-apply code review)
Both "fixed directly" findings were independently re-verified against the diff, not trusted from the text:
1. group.controller.js's stale doc comment ("Prisma cascade removes all memberships automatically.") - confirmed replaced with a pointer to ADR-21, in the addendum commit (b5731aa), not the original fix commit. The original commit (a95a660) did not touch group.controller.js at all - confirmed via git show a95a660 --stat. The addendum's framing (a future reader could "simplify" deleteGroup back to a bare call) is an accurate description of the real risk this comment drift created.
2. The redundant happy-path test - confirmed removed in the same addendum commit, diff shows exactly the 6-line it("succeeds end-to-end when all preconditions pass", ...) block deleted, nothing else in the test file touched. The addendum's math checks out: 91 (pre-removal) minus 1 = 90 (post-removal), matching the independently re-run count exactly.

The 4 deliberately-deferred findings and 1 raised-to-user item are all genuine out-of-scope-for-item-6 items with stated, specific reasons (not generic "out of scope" hand-waving) - e.g. the precondition-count-staleness gap is explicitly tied to being pre-existing and unchanged by wrapping the delete in a transaction, confirmed true: the old bare prisma.group.delete had the identical read-then-act gap.

### Attribution Check

```text
git log main..HEAD --format=%B
```

All 3 commit messages (a95a660, 223d92f, b5731aa) read in full. No Co-Authored-By trailer, no AI/Claude attribution anywhere in any of the 3 messages.

### Issues Found

CRITICAL: None

WARNING: None

SUGGESTION:
1. Engram's apply-progress artifact (topic key sdd/permissions-and-process-cleanup/apply-progress, id 567) was not updated after the addendum commit - it still reports the pre-addendum test count (3 tests, 91/91) and does not mention the controller doc-comment fix or the test removal. tasks.md is accurate and current; Engram is stale. Recommend a follow-up mem_save to the same topic_key before archive, so a future session reading apply-progress alone (without reading tasks.md's addendum) does not get a stale picture.
2. The three non-lock-order "Delete Group" scenarios (empty group, group with expenses, non-owner) have no runtime-executed test anywhere in the backend suite - this is a pre-existing, whole-codebase gap (no HTTP/controller test layer exists at all, confirmed by a repo-wide search), not something PR 4 was scoped to fix, and is flagged only for traceability, matching how PR 2/PR 3's verify reports treated equivalent gaps.

### Verdict
PASS

Phase 4 is complete, each of the 7 checkboxes was re-derived from the actual diff (not trusted from the marks), and the one real behavioral claim this PR makes - Period rows locked and deleted before the Group row - has a genuine, runtime-executed covering test that would fail on a regression to the old bare-delete shape. Both addendum findings were independently confirmed as real fixes, correctly applied in the addendum commit. All 4 deferred findings and the 1 raised-to-user item have specific, sound reasons, not generic deferrals. The 4 Cycle 2 concurrency suites PR 5 depends on remain a verified zero-line, 37/37-passing baseline. No AI attribution in any of the 3 commits. The only output of this verification is two non-blocking SUGGESTIONs (a stale Engram artifact, and a pre-existing codebase-wide HTTP-test-layer gap that predates and is unrelated to this PR). PR 4 is ready to push and open for human review.
