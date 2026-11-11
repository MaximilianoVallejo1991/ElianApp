## Verification Report

**Change**: money-correctness-fixes
**Scope**: PR 2 only (Phase 2 - Soft-Delete Filters + Prisma Mock Harness)
**Branch**: fix/soft-delete-filters (8 commits, off main post-PR-1-merge, not pushed, not merged)
**Version**: N/A (no spec version field)
**Mode**: Strict TDD

### Completeness
| Metric | Value |
|--------|-------|
| Phase 2 tasks total | 8 (2.1-2.8) |
| Phase 2 tasks complete | 8 |
| Phase 2 tasks incomplete | 0 |

### Build and Tests Execution

Tests: PASSED 36/36 (backend), PASSED 33/33 (frontend)

Command: pnpm --filter backend test
Result: Test Files 2 passed (2), Tests 36 passed (36)

Command: pnpm --filter frontend test
Result: Test Files 2 passed (2), Tests 33 passed (33)

Backend test files: src/utils/__tests__/splits.test.js (18 tests, Phase 1, unaffected), src/services/__tests__/soft-delete-filters.test.js (18 tests, Phase 2, new). Frontend is untouched by this PR (confirmed by the file list below); the 33/33 is the pre-existing frontend suite, run per the mandated two-package command.

Coverage: skipped, no coverage flag configured in either package test script. Informational only, not a failure.

### Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| payment-recording: Exclude Soft-Deleted Payments From Acceptance | Accept rejects a soft-deleted payment | soft-delete-filters.test.js: acceptPayment throws PAYMENT_NOT_FOUND for a soft-deleted payment and never calls update | COMPLIANT |
| payment-recording: Exclude Soft-Deleted Payments From Acceptance | Reject rejects a soft-deleted payment | soft-delete-filters.test.js: rejectPayment throws PAYMENT_NOT_FOUND for a soft-deleted payment and never calls update | COMPLIANT |
| payment-recording: Exclude Soft-Deleted Payments From Closure Blocking | Soft-deleted PENDING payment no longer blocks closure | soft-delete-filters.test.js: startClosure, completeClosure, partialClosure, finalClosure each exclude soft-deleted PENDING payments (4 tests, exceeds the single named scenario) | COMPLIANT |
| balance-calculation: Exclude Soft-Deleted Records | Soft-deleted payment excluded from group balances | soft-delete-filters.test.js: excludes soft-deleted ACCEPTED payments for a DYNAMIC group, and for a STATIC group with a periodId | COMPLIANT |
| balance-calculation: Exclude Soft-Deleted Records | Soft-deleted expense excluded from period expenses | soft-delete-filters.test.js: getPeriodExpenses excludes soft-deleted expenses | COMPLIANT |
| balance-calculation: Exclude Soft-Deleted Records | Soft-deleted payment excluded from period payment counts | soft-delete-filters.test.js: listPeriods filters _count relations and excludes soft-deleted payments from settlement counts | COMPLIANT |
| balance-calculation (bonus coverage, same requirement text) | getPeriodDetails _count, getPeriodBalances ACCEPTED query, getPeriodPayments, closure requireZeroBalances ACCEPTED query | soft-delete-filters.test.js: getPeriodDetails filters _count relations, getPeriodBalances excludes soft-deleted ACCEPTED payments, getPeriodPayments excludes soft-deleted payments, completeClosure excludes soft-deleted payments from the zero-balance check | COMPLIANT (bonus triangulation) |
| group-management: Get Group Details (MODIFIED) | Member views group | none found | UNTESTED, see note below |
| group-management: Get Group Details (MODIFIED) | Non-member views group | none found | UNTESTED, see note below |
| group-management: Get Group Details (MODIFIED) | Soft-deleted expense excluded from group detail | soft-delete-filters.test.js: getGroupById filters the expenses and payments includes on deletedAt null (asserts include.expenses.where) | COMPLIANT |
| group-management: Get Group Details (MODIFIED) | Soft-deleted payment excluded from group detail | same test, asserts include.payments.where | COMPLIANT (combined into one test, see Issues) |

Compliance summary: 9/11 scenarios compliant, 2 untested (both pre-existing, unmodified behavior, see Issues).

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|---|---|---|
| closure.service.js: deletedAt null on ACCEPTED query plus 4 PENDING counts | Implemented | requireZeroBalances L78-81; startClosure L157; completeClosure L218; partialClosure L279; finalClosure L351 |
| balance.service.js: deletedAt null on both paymentWhere branches | Implemented | L119-121 |
| period.service.js: filtered _count plus deletedAt null on 5 other sites | Implemented | listPeriods and getPeriodDetails _count; listPeriods PENDING count; getPeriodBalances; getPeriodExpenses; getPeriodPayments |
| group.service.js: where deletedAt null on expenses and payments includes | Implemented | getGroupById L119-120, L135-136 |
| payment.service.js: separate soft-delete guard in accept and reject | Implemented | Matches ADR-4 (separate block, not merged if), mirrors the unlockExpense pattern |

### Issues Found

CRITICAL: None.

WARNING:
1. Two group-management spec scenarios, Member views group and Non-member views group, have no covering automated test anywhere in the backend suite (confirmed: only 2 test files exist in apps/backend, neither covers the happy-path or 404-for-non-member cases of getGroupById). Per the skill rule, an untested spec scenario defaults to CRITICAL. This is deliberately downgraded to WARNING because: (a) no commit in this PR touches that logic, the membership and 404 branch inside getGroupById is byte-identical before and after this branch; (b) tasks.md Phase 2 (2.1-2.8) never assigned writing tests for these 2 scenarios, only the soft-delete filter behavior was in scope; (c) zero regression risk, the code path is untouched, so this PR cannot have broken it. This is a pre-existing test-coverage gap in the repo, not a defect introduced by PR 2. Recommend tracking as a follow-up item, not a blocker for this PR.
2. The two soft-deleted expense and payment excluded from group detail scenarios are proven by a single combined test asserting two separate include.where clauses, rather than two independent test cases. Functionally sound (both assertions run unconditionally in the same synchronous call), just thinner triangulation than the rest of the suite one-test-per-scenario style.

SUGGESTION: None beyond the above.

### Scope Containment

git diff main...fix/soft-delete-filters --stat:

 apps/backend/src/lib/__mocks__/prisma.js                        |  57 ++++
 apps/backend/src/services/__tests__/soft-delete-filters.test.js | 379 +++++++++++++++++++++
 apps/backend/src/services/balance.service.js                    |   4 +-
 apps/backend/src/services/closure.service.js                    |   7 +-
 apps/backend/src/services/group.service.js                      |   2 +
 apps/backend/src/services/payment.service.js                    |   8 +
 apps/backend/src/services/period.service.js                     |  21 +-
 openspec/changes/money-correctness-fixes/tasks.md                |  16 +-
 8 files changed, 473 insertions(+), 21 deletions(-)

Confirmed contained: exactly the files tasks.md Phase 2 assigns, plus tasks.md itself (checkbox updates). The extra commit chore(period): remove dead rejectedCount query (69303ad) only touches period.service.js, already in scope (verified by reading the commit diff; it deletes an unused rejectedCount query inside listPeriods, no behavior change). Confirmed NOT touched: expense.service.js, item-reporting.service.js, apps/backend/src/utils/splits.js, apps/frontend/src/utils/splits.js, GroupDetailPage.jsx; none appear in the diff. Review budget: 473 insertions and 21 deletions across 8 files, above the tasks.md estimate of about 195 lines (driven by test volume, already flagged in apply-progress), but still a single, independently revertible, backend-only concern.

### Commit Attribution Check

git log main..fix/soft-delete-filters --format=%B searched for co-authored, claude, generated, anthropic (case-insensitive) across all 8 commit messages: 0 matches. No AI attribution present on this branch. Compliant with the hard project rule.

---

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | YES | Found in apply-progress (sdd/money-correctness-fixes/apply-progress, PR 2 batch) |
| All tasks have tests | YES | 8/8 Phase 2 tasks map to soft-delete-filters.test.js |
| RED confirmed (tests exist) | YES | Test file exists at the stated path, 18 cases present as reported |
| GREEN confirmed (tests pass) | YES | 18/18 in-file, 36/36 full backend suite, confirmed by direct execution in this verify session |
| Triangulation adequate | MOSTLY | Closure (4 cases), balance (2), period (5) well-triangulated; group block is 1 combined test for 2 scenarios, see WARNING 2 |
| Safety Net for modified files | YES | Apply-progress reports incrementally increasing pass counts (5/5, 7/7, 12/12, 13/13, 18/18) before each new block was added, consistent with narrow-file-first TDD discipline |

TDD Compliance: 6/6 checks passed (1 with a noted triangulation caveat)

---

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 36 (backend, both files) | 2 | Vitest plus manual Prisma __mocks__ auto-mock |
| Integration | 0 | 0 | not used in this PR |
| E2E | 0 | 0 | not installed |
| Total (backend) | 36 | 2 | |

Frontend: 33 tests / 2 files, pre-existing, unaffected by this PR, run per the mandated two-package command.

---

### Changed File Coverage
Coverage analysis skipped, no coverage tool or flag configured in either package test script. Informational only, not a failure.

---

### Assertion Quality
All assertions verify real behavior. Scanned soft-delete-filters.test.js (379 lines, 18 test cases) for tautologies, orphan empty-checks, type-only assertions, ghost loops, smoke-test-only patterns, and implementation-detail coupling:
- No tautologies, no assertions without a production-code call.
- The one loop (iterating prisma.payment.count.mock.calls in the listPeriods test) is immediately followed by an explicit assertion that payment.count was called exactly once, so a zero-call scenario would still fail the test. This is not a ghost loop that always passes.
- Every test asserts concrete where and select shapes (deletedAt: null, specific nested filters) against real service-function calls, not implementation details like CSS classes or mock call counts.
- Mock-to-assertion ratio is reasonable for service-layer unit tests mocking a DB client, expected for this layer.

Assertion quality: 0 CRITICAL, 0 WARNING

---

### Quality Metrics
Linter: Not available (no lint script configured for backend)
Type Checker: Not available (plain JS, no TS config in backend)

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| ADR-1: shared vi.mock harness | YES | Implemented via the Vitest __mocks__ auto-mock convention instead of the design code sample inline-factory shape, documented as an intentional, equivalent, more-reusable choice in apply-progress |
| ADR-2/ADR-3: flat deletedAt null sibling key in where; nested where as first key of include/_count relations | YES | Confirmed by direct code read in all 5 service files |
| ADR-4: separate soft-delete guard block in accept and reject (not merged if) | YES | Confirmed in payment.service.js L282-284 and L341-343 |

### Verdict
PASS WITH WARNINGS

0 CRITICAL, 2 WARNING (both pre-existing test-coverage gaps unrelated to this PR diff, with explicit downgrade rationale above), 0 SUGGESTION. All 8 Phase 2 tasks complete, all new and full-suite tests green (36/36 backend, 33/33 frontend), scope fully contained to the tasks.md Phase 2 file list, no AI attribution in any of the 8 commits. Ready to push and open for human review.
