## Verification Report

**Change**: closure-concurrency-guards
**Scope**: PR 3 only (Phase 4 of tasks.md)

### Test
```text
pnpm --filter backend test
Test Files  7 passed (7)
```
It's a test with apostrophe's and "quotes" and `backticks`.

### Chunk A
**Branch**: fix/payment-acceptance-concurrency-guards (3 commits: db18013 -> b7bbdae -> 0e088e0), not pushed, not merged, branched off main with PR1/PR2 already merged
**Mode**: Strict TDD

### Completeness
| Metric | Value |
|--------|-------|
| Phase 4 tasks total | 7 (4.1-4.7) |
| Phase 4 tasks complete | 7 |
| Phase 4 tasks incomplete | 0 |

All 7 Phase 4 checkboxes are [x] in tasks.md, plus the post-apply addendum describing the deletedAt fix is present and accurate against the code.

### Build and Tests Execution
Backend: 73 passed / 0 failed (7 files)
Frontend: 45 passed / 0 failed (3 files)

Counts match the apply-progress claim (73 backend / 45 frontend) exactly, re-run independently, not trusted from the report.

### Unicode test
Em dash — test, arrow → test, check ✅ cross ❌ warn ⚠️.

### Scope Containment
git diff main...fix/payment-acceptance-concurrency-guards --stat:
```
apps/backend/src/services/__tests__/payment-concurrency.test.js  | 200 ++++++++++++
apps/backend/src/services/__tests__/soft-delete-filters.test.js  |  66 +++--
apps/backend/src/services/payment.service.js                     |  92 ++++---
apps/backend/src/utils/errors.js                                 |   5 +-
openspec/changes/closure-concurrency-guards/tasks.md              |  16 +-
5 files changed, 322 insertions(+), 57 deletions(-)
```
Exactly the 5 expected files. No touch to closure.service.js, GroupDetailPage.jsx, or schema.prisma.

### Attribution Check
All 3 commits (db18013, b7bbdae, 0e088e0) inspected via git log --format='%B' — none contain Co-Authored-By or any AI-attribution trailer. Clean.

### deletedAt: null Guard Fix - Verified Present, Not Just Claimed
Read the literal where objects in both functions in apps/backend/src/services/payment.service.js:
- acceptPayment L305: where: { id: paymentId, status: 'PENDING', deletedAt: null }
- rejectPayment L376: where: { id: paymentId, status: 'PENDING', deletedAt: null }

Both confirmed literally present (not objectContaining-masked in production code - this is the real predicate).

Dedicated test coverage for the fix (not just prose in apply-progress):
- soft-delete-filters.test.js L362-367 (acceptPayment exact-match where: { id, status: 'PENDING', deletedAt: null }) and L403-407 (same for rejectPayment) - these are exact-object assertions, so they fail if deletedAt: null were ever removed from the predicate.
- payment-concurrency.test.js L119-124 and L191-196 - structural objectContaining assertions on the same predicate, run alongside the race tests.
- soft-delete-filters.test.js L327-335 / L371-379 - dedicated scenarios: a soft-deleted PENDING payment is rejected with PAYMENT_NOT_FOUND 404 at the pre-check (not the guard) for the simple non-racing case, with a companion "still accepts a non-deleted PENDING payment" triangulation test (L337-369, L381-410) so the assertion isn't vacuous.

Verdict: the fix is genuinely present in the literal where clause and has 4 distinct covering tests (2 exact-match structural, 2 pre-check behavioral), not merely asserted in the apply-progress narrative.

### Residual Gap Check on the deletedAt Fix
Re-read both full functions (not just the guard line). The guard's where now carries { id, status: 'PENDING', deletedAt: null }. Tracing the only mutator that can set deletedAt mid-flight - deletePayment (L227-258) - it performs a plain prisma.payment.update({ where: { id } }) with no status precondition. Two sub-cases:
1. Soft-delete lands before the guard's updateMany executes: guard's deletedAt: null predicate no longer matches, count !== 1, NOT_PENDING 409. Closed.
2. Soft-delete lands between the guard's updateMany and the transaction commit: blocked by Postgres row-level locking (the guard's updateMany holds the row lock for the duration of the $transaction; deletePayment's unguarded update targeting the same row blocks until commit, then operates on the now-ACCEPTED/REJECTED row). This can soft-delete an already-terminal payment, but it cannot cause a false ACCEPT/REJECT success - the race described in the addendum is closed.

No further gap found in acceptPayment/rejectPayment for this race class. (Whether soft-deleting an already-accepted/rejected payment should be allowed at all is a separate, unrelated question, out of scope for this guard and not a concurrency-guard defect.)

### Spec Compliance Matrix (specs/payment-acceptance/spec.md)
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Accept Payment | Concurrent accept requests yield exactly one winner | payment-concurrency.test.js > acceptPayment concurrency guard > double-fire accept+accept | COMPLIANT |
| Accept Payment | Guard predicate / no unguarded update | payment-concurrency.test.js (2 structural tests) + soft-delete-filters.test.js L362-367 | COMPLIANT |
| Reject Payment | Concurrent accept and reject yield one terminal status, loser's error matches actual DB outcome | payment-concurrency.test.js > rejectPayment concurrency guard > double-fire accept+reject | COMPLIANT (see detailed check below) |
| Reject Payment | Guard predicate / no unguarded update | payment-concurrency.test.js (2 structural tests) + soft-delete-filters.test.js L403-407 | COMPLIANT |
| (New, addendum) Soft-deleted payment cannot be accepted/rejected mid-race | deletedAt: null in guard where, pre-check 404 | soft-delete-filters.test.js L327-335, L371-379 + exact-match where tests above | COMPLIANT |
| Accept Payment | Creditor accepts in STATIC group during closure | none found | UNTESTED - out of PR3 scope: not a Phase 4 task, code path unmodified by this PR's diff |
| Accept Payment | Creditor accepts in DYNAMIC group, no closure involved | none found | UNTESTED - out of PR3 scope, same reason |
| Accept Payment | Non-receiver cannot accept (403 FORBIDDEN) | none found | UNTESTED - out of PR3 scope, logic unchanged by this PR |
| Reject Payment | Creditor rejects in DYNAMIC group | none found | UNTESTED - out of PR3 scope |
| Reject Payment | Non-receiver cannot reject (403 FORBIDDEN) | none found | UNTESTED - out of PR3 scope |
| Rejection Blocks STATIC Closure | Rejected payment prevents STATIC closure | none found, and current closure.service.js code (L229, L306, L397) explicitly only blocks on PENDING, with a comment "REJECTED payments are historical, not blocking", contradicting this requirement | UNTESTED / likely FAILING if exercised - out of PR3 scope (file not touched by this branch; pre-existing from PR1/PR2 or earlier, flagged for follow-up) |

Compliance summary (concurrency-relevant scenarios, i.e. PR3's actual deliverable): 5/5 compliant.
Compliance summary (full spec file): 5/11 scenarios compliant, 6 untested, all 6 are scenarios this PR's diff does not touch (confirmed by git diff --stat), so they are not a PR3 regression, but they are real spec gaps worth a follow-up ticket, especially the REJECTED-payments-block-closure mismatch which looks like an actual code/spec contradiction rather than a missing test.

### Deceptive-Success Scenario - Explicit Proof, Not "Some 409 Happened"
Re-inspected payment-concurrency.test.js L146-181 (double-fire accept+reject):
- The mock sequences updateMany as mockResolvedValueOnce({ count: 1 }) (accept wins) then mockResolvedValue({ count: 0 }) (reject loses) - this is a controlled, known DB outcome, not an arbitrary race result.
- Assertions: fulfilled[0].value matches { status: 'ACCEPTED' } (the accept call) and rejected[0].reason matches { code: 'NOT_PENDING', status: 409 } (the reject call) - the test explicitly ties the loser's error to the fact that the row ended up ACCEPTED, not an unrelated failure mode.
- This is a genuine proof that the loser's 409 corresponds to the real mocked DB state (accept committed first), not a coincidental 409 from some other cause.

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | Yes | Tasks 4.1/4.2/4.4 marked [RED], 4.3/4.5/4.6/4.7 marked [GREEN]; addendum documents its own RED to GREEN cycle |
| All tasks have tests | Yes | 7/7 |
| RED confirmed (tests exist) | Yes | payment-concurrency.test.js and updated soft-delete-filters.test.js both exist and contain the described cases |
| GREEN confirmed (tests pass) | Yes | 73/73 backend pass on this run |
| Triangulation adequate | Yes | Accept+accept, accept+reject, structural (x2 per function), soft-delete pre-check (x2), soft-delete triangulation companion (x2) - 10 distinct cases across 2 files for 2 functions |
| Safety Net for modified files | Yes | soft-delete-filters.test.js pre-existing payment assertions continue to pass unmodified; only the payment-specific block was touched |

TDD Compliance: 6/6 checks passed

### Test Layer Distribution
Unit: 10 (new/modified, PR3 scope) across 2 files (payment-concurrency.test.js, soft-delete-filters.test.js payment block), vitest + mocked Prisma client.
Integration: 0. E2E: 0.

Informational only (SUGGESTION level): all PR3 coverage is unit-level against a mocked Prisma client; no integration/E2E harness exercises real Postgres row locking for this guard. The test file's own header comment (L8-17) is explicit and correct about this limitation - it proves the conflict branch and statement structure, not Postgres-level atomicity. This is a documented, accepted limitation (ADR-13 per the comment), not a hidden gap.

### Assertion Quality
Scanned payment-concurrency.test.js and the payment block of soft-delete-filters.test.js for banned patterns (tautologies, ghost loops, mock/assertion ratio, smoke-tests-only, implementation-detail coupling): none found. All assertions call production code (acceptPayment/rejectPayment) and assert on real return values or thrown error shapes.

Assertion quality: All assertions verify real behavior.

### Changed File Coverage
Coverage tool not invoked in this run (no coverage script wired into the test command for either workspace). Reported as skipped per strict-tdd-verify.md, not a failure.

### Issues Found

CRITICAL: None.

WARNING:
1. Spec scenario "Rejected payment prevents STATIC closure" (specs/payment-acceptance/spec.md) appears contradicted by the current closure.service.js code (L229, L306, L397: comment "REJECTED payments are historical, not blocking" - only PENDING payments block closure). This file is untouched by PR3's diff, so it is not a regression introduced here, but it is a real spec/code mismatch that predates or was introduced by PR1/PR2 and has no test coverage anywhere in the suite. Recommend a follow-up task before this SDD change is archived.
2. 5 non-concurrency scenarios in the full payment-acceptance spec (STATIC-closing accept, DYNAMIC accept, non-receiver-forbidden x2, DYNAMIC reject) have zero test coverage anywhere in the backend test suite (no payment.service.test.js or route-level test exists). Not introduced by PR3 and not part of its Phase 4 task list, but worth flagging since the spec file verified against is the full requirement, not a PR3-scoped delta.

SUGGESTION:
1. All PR3 concurrency coverage is unit-level only (mocked Prisma), consistent with the project's accepted ADR-13 tradeoff - no action needed, noting for completeness per the strict-TDD test-layer audit.

### Verdict
PASS for PR3's actual deliverable (Phase 4: acceptPayment/rejectPayment atomic guards + the deletedAt soft-delete fix). All 7 Phase 4 tasks complete, 73/73 backend + 45/45 frontend tests pass, scope is contained to the 5 expected files, no AI-attribution in commits, and the deletedAt: null fix is genuinely present with dedicated test coverage and no residual gap in the same race class. The 2 WARNING items above are pre-existing gaps outside this PR's diff and should not block pushing/opening PR3 for human review, but should be tracked before the overall closure-concurrency-guards change is archived.
