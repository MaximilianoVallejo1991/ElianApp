## Verification Report

**Change**: money-correctness-fixes -- PR 3 (Phase 3 only)
**Branch**: fix/compute-splits-and-item-participant-guard (off main, which already has PR 1 + PR 2 merged)
**Version**: N/A
**Mode**: Strict TDD

### Commit Count Correction
The briefing stated "9 commits." Actual count via git log --oneline main..fix/compute-splits-and-item-participant-guard is 7 commits:
75e424b, d16619f, 38c6bcf, 4c458c5, e8b6439, 187998e, f2a1202.
Not a defect, just correcting the input for the record. All 7 are present, in the order described in apply-progress (base fix, then item-reporting fix, docs, 1st addendum, docs, 2nd addendum, 3rd addendum).

### Completeness
| Metric | Value |
|--------|-------|
| Phase 3 tasks total | 4 (3.1 to 3.4) plus 3 documented addenda |
| Tasks complete | 4/4, all addenda applied |
| Tasks incomplete | 0 |

### Build & Tests Execution
Tests (backend): PASSED 54/54 (4 test files). Command: pnpm --filter backend test. Output: "Test Files 4 passed (4)", "Tests 54 passed (54)". Matches apply-progress claimed count exactly.

Tests (frontend): PASSED 33/33 (2 test files), unchanged from PR 1/PR 2 baseline, confirming PR 3 did not touch frontend. Command: pnpm --filter frontend test. Output: "Test Files 2 passed (2)", "Tests 33 passed (33)".

Coverage: not available, no coverage tool configured in this repo.

### Scope Containment
git diff main...fix/compute-splits-and-item-participant-guard --stat shows exactly 7 files changed:
- apps/backend/src/lib/__mocks__/prisma.js
- apps/backend/src/services/__tests__/expense.service.test.js
- apps/backend/src/services/__tests__/item-reporting.service.test.js
- apps/backend/src/services/expense.service.js
- apps/backend/src/services/item-reporting.service.js
- apps/backend/src/utils/errors.js
- openspec/changes/money-correctness-fixes/tasks.md

Total: 880 insertions, 34 deletions.

GroupDetailPage.jsx, splits.js, closure.service.js, and payment.service.js are untouched, confirmed absent from the diff.

One file outside the three named domains appears: apps/backend/src/utils/errors.js. The diff is a single-line JSDoc comment update that adds VALIDATION_ERROR to the documented error-code list, no logic change, directly necessitated by computeSplits new defense-in-depth guard. Not a scope violation in substance, flagged as SUGGESTION only.

### Commit Attribution
Read full commit messages for all 7 commits (git log main..branch --format). No Co-Authored-By or AI attribution present in any commit. Consistent with the project convention and prior PRs.

### Spec Compliance Matrix
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Splits Re-Validated After Participant Filtering | Filtered split subset still sums to total | expense.service.test.js rejects a PERCENTAGE expense when participantIds filters the splits below 100% (PR 1 own guard) plus rejects via the generic amount-sum guard when calculatePercentageSplits returns a mismatched sum (defense-in-depth, Fix A, task 3.2) plus still creates a valid PERCENTAGE expense when the unfiltered splits correctly sum to the amount (positive control) | COMPLIANT (see note 1) |
| Add Individual Item (MODIFIED) | Participant adds own item | item-reporting.service.test.js allows a listed participant to report their own item | COMPLIANT |
| Add Individual Item (MODIFIED) | Non-participant cannot add items | item-reporting.service.test.js rejects a non-participant with NOT_PARTICIPANT and never calls the upsert | COMPLIANT |
| Add Individual Item (MODIFIED) | Non-participant cannot update via upsert | item-reporting.service.test.js rejects a non-participant with NOT_PARTICIPANT even when the expense is also locked | PARTIAL (see note 2) |

Compliance summary: 3/3 Phase-3-relevant scenarios have a passing covering test; 1 of the 3 has a minor literal-fidelity gap (SUGGESTION, not blocking).

Note 1: The spec text for "Splits Re-Validated After Participant Filtering" literally says "GIVEN an EXACT-split expense." The EXACT splitType was removed from the codebase (expense.routes.js explicitly pre-rejects splitType EXACT with "EXACT split type no longer supported"). The actual tests correctly substitute PERCENTAGE, the only live splitType with explicit per-user split content that can mismatch after participantIds filtering, to exercise the same re-validation behavior the requirement describes. Behaviorally correct; the spec wording is stale. SUGGESTION: update the spec scenario GIVEN clause to say PERCENTAGE-split expense in a cleanup pass.

Note 2: The "non-participant cannot update via upsert" scenario literal GIVEN (which would otherwise upsert an item for D) is not simulated with a pre-existing ExpenseItem row for the intruder; the covering test only proves the guard fires before prisma.expenseItem.upsert is ever called, for both the unlocked and locked cases. Since the guard in reportItem runs unconditionally before the single upsert call (no separate create/update branches in application code, Prisma upsert makes that decision internally), this is sufficient to prove the scenario by construction. Downgraded from UNTESTED to PARTIAL/effectively-compliant; SUGGESTION only.

### Correctness: Four-Combination Matrix Audit
Per the explicit request to scrutinize updateExpense handling of {splits provided/omitted} x {participantIds provided/omitted}, including empty-array variants, for both EQUAL and PERCENTAGE:

| Split Type | splits state | participantIds state | Behavior | Test coverage |
|---|---|---|---|---|
| EQUAL | omitted | omitted | Reconstructs original participant subset from persisted splits | COVERED: Bug 2 regression test |
| EQUAL | omitted | empty [] | Reconstructs, treated as not-provided | COVERED: Third addendum Fix 1 test |
| EQUAL | omitted | nonempty | Uses caller explicit list, no reconstruction, no wasted query | COVERED: Third addendum Fix 2 test plus Second addendum Bug 2 test |
| EQUAL | empty [] | omitted | Reconstructs, splits content proven ignored for EQUAL | COVERED: Second addendum Bug 1 test |
| EQUAL | nonempty | any | Splits content still ignored for EQUAL | Not explicitly tested, but provably equivalent by code structure, no real gap |
| PERCENTAGE | omitted | omitted | Reconstructs both | COVERED: base fallback test plus Bug 1 regression (departed member) |
| PERCENTAGE | omitted | nonempty | Reconstructs splits, scopes to caller explicit participantIds, no-op re-filter proven | COVERED: Second addendum verification test |
| PERCENTAGE | omitted | empty [] | Falls into same participantIdsNotProvided branch as omitted; behaviorally identical | Not explicitly tested for PERCENTAGE (only for EQUAL); low risk, SUGGESTION to add dedicated test |
| PERCENTAGE | nonempty | omitted | Explicit splits used as-is, no active-member filtering applied | COVERED: does not fall back test |
| PERCENTAGE | nonempty | nonempty | Explicit splits plus explicit participantIds passed through unchanged to computeSplits | Not tested as a direct updateExpense case, only indirectly via createExpense equivalent test; pure passthrough, SUGGESTION |
| PERCENTAGE | empty [] | omitted / empty / nonempty (all three) | CONFIRMED BUG, see below | UNTESTED, confirmed via live diagnostic run |

CONFIRMED BUG: needsSplitsReconstruction checks effectiveSplitsInput === undefined strictly. An explicit [] is NOT undefined, so reconstruction is skipped entirely. The literal [] then reaches computeSplits, which calls validateSplits for PERCENTAGE with an empty array, sum equals 0, which throws AppError INVALID_SPLITS 400 ("Split percentages must sum to 100").

### Runtime Proof of the Confirmed Bug
A diagnostic test was appended to expense.service.test.js, run, and then fully reverted via git checkout; git status confirmed a clean working tree afterward with no residual changes left on the branch. The diagnostic:

    await updateExpense(expenseId, { amount: 200, splits: [] }, userId);
    // PERCENTAGE expense with an existing persisted 60/40 split

Result: the call threw "AppError: Split percentages must sum to 100", raised at validateSplits (expense.schemas.js line 127), called from computeSplits (expense.service.js line 79), called from updateExpense (expense.service.js line 703). After reverting the diagnostic, the full backend suite was re-run and confirmed back at 54/54 passed, matching the pre-diagnostic baseline exactly.

### Why This Matters
This is the same bug class the second addendum fixed for EQUAL (splits: [] must not be treated as "caller wants to change this" when it should be treated as "omitted/untouched"), and the same bug class the third addendum fixed for participantIds: [] on both EQUAL and PERCENTAGE. The one remaining untreated quadrant is splits: [] for PERCENTAGE own splits-reconstruction trigger: needsSplitsReconstruction was never given the same "empty-or-undefined" normalization that participantIdsNotProvided received. A client sending PUT { amount, splits: [] } on a PERCENTAGE expense (a "send the whole form unchanged" shape, the same plausible shape the second addendum explicitly called out) gets an incorrect 400 instead of the amount being re-split against the existing persisted percentages. This reintroduces, for this one specific input shape, the exact regression task 3.2 was created to fix.

Mitigating factor: this fails closed (400 rejection), not open. No split is silently miscalculated and no money is misassigned. It is a completeness/UX bug, not a data-corruption bug. Still, it directly contradicts the "final addendum, all undefined-vs-[] gaps for both splits and participantIds are closed" framing in tasks.md and apply-progress, which is the main reason to surface it as CRITICAL rather than downgrade it to SUGGESTION. The claimed scope of "done" is not quite accurate for this one fallback.

### Other Findings
- Minor inefficiency (not blocking): when updateExpense reconstructs both effectiveParticipantIds and effectiveSplitsInput for PERCENTAGE (the omitted+omitted case), it forwards the reconstructed non-empty participantIds into computeSplits, whose own PERCENTAGE branch then calls getActiveMemberIds a second time to re-validate membership, redundant with the active-member fetch updateExpense already just did. Correctness is unaffected; one avoidable DB round-trip. SUGGESTION.
- Assertion quality: all assertions in expense.service.test.js and item-reporting.service.test.js verify real behavior. No tautologies, no ghost loops over possibly-empty collections, no smoke-test-only patterns. Each test calls production code and asserts concrete values. Good variance across expected values across tests, adequate triangulation.
- Mock/assertion ratio: service-layer tests necessarily mock the Prisma client extensively, appropriate for this layer; ratio stays reasonable, not flagged as mock-heavy.

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | YES | apply-progress documents RED-then-GREEN sequence per task/addendum with explicit before/after counts (e.g. 52/52 to 54/54) |
| All tasks have tests | YES | 4/4 Phase 3 tasks plus 3 addenda, all with dedicated regression tests |
| RED confirmed (tests exist) | YES | expense.service.test.js (16 tests including all addenda regressions), item-reporting.service.test.js (3 tests) both exist, verified by direct read |
| GREEN confirmed (tests pass) | YES | 54/54 backend, 33/33 frontend, confirmed by direct execution in this verification |
| Triangulation adequate | YES | Multiple distinct scenarios per behavior (positive/negative/edge for both createExpense and updateExpense, both split types) |
| Safety Net for modified files | YES | expense.service.js and item-reporting.service.js were both pre-existing files with pre-existing passing tests before PR 3; all prior tests remain green |

TDD Compliance: 6/6 checks passed

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 19 (16 + 3) | 2 | Vitest plus manual Prisma __mocks__ |
| Integration | 0 | 0 | not used in this PR |
| E2E | 0 | 0 | not installed |
| Total (PR 3 scope) | 19 | 2 | |

### Issues Found

CRITICAL:
1. updateExpense PERCENTAGE splits-reconstruction trigger (needsSplitsReconstruction) is gated on effectiveSplitsInput === undefined instead of the same empty-or-undefined normalization applied to participantIds (participantIdsNotProvided). A PUT { amount, splits: [] } on an existing PERCENTAGE expense throws INVALID_SPLITS 400 instead of reconstructing from persisted splits. Confirmed by live execution against the actual branch code (diagnostic added, run, and reverted; no residual changes). Zero test coverage for this input shape. Reintroduces, for this one specific input shape, the exact regression class task 3.2 and the second/third addenda were built to eliminate.

WARNING: None beyond the CRITICAL item above.

SUGGESTION:
1. Spec wording for "Splits Re-Validated After Participant Filtering" references the removed EXACT splitType; tests correctly use PERCENTAGE instead. Update spec prose in a cleanup pass.
2. "Non-participant cannot update via upsert" scenario covering test does not simulate a pre-existing item for the intruder; sufficient by code construction (guard runs before the single upsert call) but not literal-fidelity to the GIVEN clause.
3. apps/backend/src/utils/errors.js is touched outside the three named domains; trivial, justified (JSDoc comment only, documents the new VALIDATION_ERROR code), not a real scope violation.
4. PERCENTAGE plus participantIds: [] (omitted-equivalent) and PERCENTAGE plus explicit nonempty splits and participantIds together are not directly tested against updateExpense (only proven equivalent by code structure or indirectly via createExpense). Low risk; add dedicated regression tests for completeness.
5. Minor redundant getActiveMemberIds DB round-trip when updateExpense reconstructs PERCENTAGE participantIds and splits together. Performance-only, not correctness.

### Verdict
PASS WITH WARNINGS -- escalated attention required before this PR is considered fully closed.

All 3 Phase-3-relevant spec scenarios pass with covering tests, scope containment is clean (one trivial doc-only exception), no AI attribution in any commit, and the full suite is green (54/54 backend, 33/33 frontend). However, the explicitly-requested four-combination-matrix audit found one genuine, confirmed, untested gap: PUT { amount, splits: [] } on a PERCENTAGE expense incorrectly 400s instead of reconstructing. This contradicts this PR own "final addendum, all undefined-vs-[] gaps closed" framing. It fails closed (no money miscalculation), so it does not block the two cited spec requirements from being COMPLIANT, but it should not be considered a fully closed edge-case sweep. Recommend either a fourth addendum (symmetric fix: needsSplitsReconstruction should treat splits: [] as not-provided for PERCENTAGE, mirroring the participantIdsNotProvided pattern) before merging, or an explicit user decision to accept and defer this specific quadrant (similar to how the EQUAL active-membership gap and the authoritative-participantIds architecture recommendation were explicitly deferred elsewhere in this change).
