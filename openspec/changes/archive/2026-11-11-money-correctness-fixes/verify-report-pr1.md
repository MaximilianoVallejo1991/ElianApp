## Verification Report

**Change**: money-correctness-fixes -- PR 1 (Phase 1: Split Arithmetic)
**Branch**: fix/percentage-split-rounding (5 commits: 414627a, efc284d, e8bbfdb, e44435f, 0e901c4; not pushed, not merged)
**Version**: spec expense-management delta, requirement "Percentage Splits Sum Exactly to Total" only (other requirements in the same spec file belong to PR 3 and are explicitly out of scope for this verification)
**Mode**: Strict TDD

### Completeness
| Metric | Value |
|--------|-------|
| Phase 1 tasks total | 8 (1.1-1.4 + four addenda 1.5-1.8) |
| Phase 1 tasks complete | 8 |
| Phase 1 tasks incomplete | 0 |

### Build and Tests Execution
Tests: 51 passed / 0 failed / 0 skipped
```text
pnpm --filter backend test   -> Test Files 1 passed (1),  Tests 18 passed (18)
pnpm --filter frontend test  -> Test Files 2 passed (2),  Tests 33 passed (33)
```
Counts match apply-progress claims exactly (18/18 backend, 33/33 frontend). Manually re-counted it(...) blocks in both splits.test.js files to confirm no inflation: backend 6 (calculateEqualSplits) + 12 (calculatePercentageSplits) = 18; frontend 6+12+5(computeCollectiveStatus)+5(calculateCollectiveSplits) = 28 in splits.test.js, plus 5 pre-existing/unrelated tests in the frontend second test file = 33.

Lint: No errors/warnings (npx eslint on both changed frontend files; backend has no lint config, consistent with project config)
Coverage: not measured in this pass (no --coverage flag run)

### Scope Containment Check
```text
git diff main...fix/percentage-split-rounding --stat
 apps/backend/src/utils/__tests__/splits.test.js   | 143 ++
 apps/backend/src/utils/splits.js                  |  76 ++
 apps/frontend/src/utils/__tests__/splits.test.js  | 132 ++
 apps/frontend/src/utils/splits.js                 |  70 ++
 openspec/changes/money-correctness-fixes/tasks.md |  89 ++
 5 files changed, 486 insertions(+), 24 deletions(-)
```
Confirmed: only the 5 expected files (2 prod, 2 test, 1 planning doc). Nothing touched in expense.service.js, payment.service.js, closure.service.js, balance.service.js, group.service.js, item-reporting.service.js, or GroupDetailPage.jsx. Phase 2/3/4 scope did not leak into PR 1.

### Spec Compliance Matrix (requirement: "Percentage Splits Sum Exactly to Total")
| Scenario | Test | Result |
|----------|------|--------|
| Non-equal percentages sum exactly to total (10 -> 33.33/33.33/33.34 -> 3.33/3.33/3.34 = 10.00) | backend splits.test.js > "handles fractional percentages and sums exactly to the total" (L68-83); frontend splits.test.js > same name (L68-83) | COMPLIANT (both files, literal values match spec exactly) |
| Backend and frontend splits.js produce identical output | No direct cross-package test exists. Verified instead via (a) line-by-line source diff of both calculatePercentageSplits bodies -- algorithm, guards, epsilon, rescale, largest-remainder logic are byte-identical except the deliberately-documented AppError (backend) vs plain Error (frontend) difference, and (b) both test files assert the same literal expected numbers independently and both pass. | PARTIAL -- behaviorally confirmed via source inspection plus mirrored literal assertions, but there is no automated test that imports both modules and asserts equality programmatically, so nothing would catch future drift automatically. |

Compliance summary: 1/2 scenarios directly COMPLIANT via a dedicated runtime test; 1/2 PARTIAL (confirmed correct by source inspection and mirrored tests, but not by a dedicated parity test).

### Additional Hardening Found by Review (beyond spec text, all in-scope for calculatePercentageSplits)
| Addendum | Defect | Test | Result |
|----------|--------|------|--------|
| 1st | Filtered subset not summing to 100 silently over/under-bills | "regression: a filtered subset with percentage well below 100 must reject..." (both files) | COMPLIANT |
| 2nd | Last-absorbs-remainder could go negative with many participants | "largest-remainder method never produces a negative amount with many small percentages" (both files) | COMPLIANT |
| 3rd (Bug A) | Within-epsilon-but-not-exact-100 sums corrupt cents math | "rescales percentages within epsilon tolerance..." (both files) | COMPLIANT |
| 3rd (Bug B) | NaN percentage bypasses sum guard | "throws ... when a percentage is missing or NaN" (both files) | COMPLIANT |
| 3rd (Bug C) | Empty array bypassed guard via early return | "throws ... for an empty splits array when totalAmount > 0" (both files) | COMPLIANT |
| 4th | Individual negative percentage bypasses sum guard via offsetting pair | "throws ... when a split has a negative percentage" (both files) | COMPLIANT |

All six addendum fixes have dedicated RED-then-GREEN regression tests in both backend and frontend test files, confirmed passing at runtime in this session.

### Correctness (Static + Runtime Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| Percentage splits sum exactly to total | Implemented | Largest-remainder (Hamilton apportionment) in integer cents; provably sums to totalCents and cannot go negative given non-negative percentages |
| Backend/frontend identical algorithm | Implemented (source-verified) | Byte-identical logic; only the error-throwing mechanism differs (AppError vs Error), a documented, deliberate, spec-compatible divergence since frontend has no AppError equivalent |

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | Yes | Present in apply-progress, but only the 4th addendum uses the formal RED/GREEN/REFACTOR table; tasks 1.1-1.4 and addenda 1-3 are documented narratively (specific failure messages, before/after test counts quoted) rather than in the standard table |
| All tasks have tests | Yes | 8/8 |
| RED confirmed (tests exist) | Yes | All 6 addendum-driving test cases exist in both splits.test.js files, verified by direct file read |
| GREEN confirmed (tests pass) | Yes | 18/18 backend, 33/33 frontend, confirmed by this session own test run, not just trusted from the report |
| Triangulation adequate | Yes | 12 calculatePercentageSplits test cases per file covering the spec scenario plus 6 reviewer-found edge cases, each asserting distinct expected values |
| Safety Net for modified files | Yes | Both splits.js files were pre-existing (modified, not new); incrementing pass counts across addenda (15 to 17 to 18 backend) show prior tests were re-run, not skipped |

TDD Compliance: 6/6 checks passed (format of evidence for early tasks is narrative, not tabular -- WARNING, not a trust/correctness issue)

### Assertion Quality
All assertions verify real behavior. No tautologies, no ghost loops over possibly-empty collections (all forEach assertions operate on arrays with hardcoded non-zero length), no mock usage (pure functions, zero vi.mock calls), no smoke-test-only patterns. Every test calls the real production function and asserts specific numeric or error values.

### Quality Metrics
Linter: No errors (frontend changed files; backend has no lint config per project convention)
Type Checker: Not available (no tsconfig.json in backend; both files are plain .js)

### Issues Found

CRITICAL: None

WARNING:
1. Spec scenario "Backend and frontend splits.js produce identical output" has no dedicated automated parity test -- only independently-mirrored literal assertions in two separately maintained files, verified consistent by this session manual source diff. This PR already required four rounds of fresh-context review to keep both copies synced; a future change could silently desync them with nothing failing. Recommend adding a lightweight cross-import equality test before PR 3/4 touch this area again.
2. PR 1 actual diff is 510 changed lines (486 insertions + 24 deletions across 5 files; 421 lines excluding the tasks.md documentation-only changes), well above both the original ~90-line forecast and the project 400-line review budget. This grew legitimately through four separate real-defect-fixing addenda (not scope creep), but the human reviewer should be told the size grew roughly 5x before requesting review.
3. TDD Cycle Evidence in apply-progress is only in the skill expected tabular RED/GREEN/REFACTOR format for the 4th addendum; tasks 1.1-1.4 and addenda 1-3 use narrative evidence instead. The narrative evidence is specific and credible (quoted failure messages, incrementing test counts), so this is a format gap, not a credibility gap.

SUGGESTION:
1. Add a cross-package parity test (import both apps/backend/src/utils/splits.js and apps/frontend/src/utils/splits.js in one test file, or in CI, and assert deepEqual output across a fixture set) as a permanent regression guard -- ties directly to WARNING 1.
2. Per the apply-progress own note: four review rounds have now found four real defects in this one function. If a fifth round surfaces more, strongly consider closing PR 1 as-is and deferring further hardening to money-arithmetic-utility, as already planned -- this verification found no fifth defect, so PR 1 can close now.

### Verdict
PASS WITH WARNINGS -- 0 CRITICAL, 3 WARNING, 2 SUGGESTION. All 8 Phase 1 tasks complete, both test suites green (18/18 backend, 33/33 frontend, independently re-run), scope cleanly contained to the 5 expected files, and the spec primary numeric scenario is directly and exactly covered by passing tests in both packages. The one PARTIAL scenario (byte-identical backend/frontend output) is true in substance (verified by source diff) but lacks a dedicated automated guard -- not a blocker for this PR, but worth fixing before PR 3/4 touch this code again. Ready to push and open for human review.
