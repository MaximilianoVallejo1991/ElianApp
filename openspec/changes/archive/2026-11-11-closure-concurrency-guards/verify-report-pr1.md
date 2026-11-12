## Verification Report

**Change**: closure-concurrency-guards (PR 1 of 4 — Phases 1-2 only)
**Branch**: `fix/partial-closure-concurrency-guard` (2 commits, off `main`, not pushed, not merged)
**Version**: N/A
**Mode**: Strict TDD

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total (Phases 1-2) | 7 |
| Tasks complete | 7 |
| Tasks incomplete | 0 |
| Tasks out of scope (Phases 3-6, correctly unchecked) | 20 |

### Build & Tests Execution
**Build**: ➖ Not run (no build-script gate in this repo for a backend/frontend unit-test PR; vitest run is the relevant gate)

**Tests — backend**: ✅ 60 passed / 0 failed (6 files)
```text
$ pnpm --filter backend test -- --run
Test Files  6 passed (6)
     Tests  60 passed (60)
```

**Tests — frontend**: ✅ 45 passed / 0 failed (3 files)
```text
$ pnpm --filter frontend test
Test Files  3 passed (3)
     Tests  45 passed (45)
```
Combined: ✅ 105/105 passed, 0 failed, 0 skipped. Matches apply-progress's claimed counts exactly (fresh re-run, not trusted from the report).

**Coverage**: ➖ Not available (no coverage tool/script configured in `apps/backend/package.json` or `apps/frontend/package.json`)

### Spec Compliance Matrix
(Scope: only the `partialClosure`-related requirement from `period-management/spec.md`. The other 3 closure transitions and the payment-acceptance delta spec are PR 2/PR 3 scope — intentionally not evaluated here.)

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Partial Closure State Transition — atomic guard is transaction statement #1, before `period.create` | (structural, implied by requirement text) | `closure-concurrency.test.js > runs the guard as the first statement of the transaction, before period.create` — asserts `prisma.period.updateMany.mock.invocationCallOrder[0] < prisma.period.create.mock.invocationCallOrder[0]` | COMPLIANT |
| Partial Closure State Transition — guard re-asserts `status: 'CLOSING'` inside the write, never a separate read-then-write | (structural, implied by requirement text) | `closure-concurrency.test.js > asserts the status predicate inside the where...` — asserts `updateMany` called with `where: {id, status:'CLOSING'}` AND `prisma.period.update` never called | COMPLIANT |
| Concurrent partial-closure requests never produce two current periods | Concurrent partial-closure requests never produce two current periods | `closure-concurrency.test.js > double-fire: exactly one fulfilled, one rejected with CLOSURE_BLOCKED 409, period.create called exactly once` — `Promise.allSettled` on 2 concurrent calls via `createBarrier(2)`; asserts 1 fulfilled / 1 rejected `AppError{code:'CLOSURE_BLOCKED', status:409}`; asserts `prisma.period.create` called exactly 1 time | PARTIAL (see note) |

**Note on the PARTIAL rating**: the test proves the conflict branch (1 winner / 1 loser / `period.create` called exactly once) against a mocked Prisma client that cannot model real Postgres row-locking or write visibility — the test file's own header explicitly documents this boundary (not Postgres-level atomicity; the DB-level defense-in-depth unique index is Phase 5/PR 4, not in scope here). This is the project's deliberately accepted test strategy (design.md ADR-13), not a defect introduced by this PR — flagging as a documented scope boundary (SUGGESTION), not CRITICAL. Given the boundary is honestly disclosed in the test file and matches the design's accepted tradeoff, I treat this scenario as effectively compliant for PR 1's declared scope.

**Compliance summary**: 3/3 scenarios/structural clauses compliant within PR 1's declared scope (1 with a documented mock-vs-real-DB boundary noted above, not a failure).

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| Guard is `tx.period.updateMany({where:{id, status:'CLOSING'}, data:{status:'CLOSED', isCurrent:false, closedAt}})` as statement #1 | Implemented | `closure.service.js` L315-322, confirmed by direct read |
| `guard.count !== 1` throws `AppError('CLOSURE_BLOCKED', 409, ...)` before any further write | Implemented | L324-326 |
| `period.create` runs only after the guard succeeds, no follow-up read, no `Group` write | Implemented | L332-338; confirmed no `Group` table touched anywhere in `partialClosure` |
| `requireZeroBalances` pre-check stays above the `$transaction`, not re-verified inside it | Implemented (and now documented) | matches ADR-6 accepted tradeoff; comment added in `101c35f` explicitly calls this out |

### Scope Containment
`git diff main...fix/partial-closure-concurrency-guard --stat`:
```
 apps/backend/src/lib/__mocks__/prisma.js                        |  11 +-
 apps/backend/src/services/__tests__/closure-concurrency.test.js | 128 +++++
 apps/backend/src/services/__tests__/concurrency-barrier.js      |  28 +++
 apps/backend/src/services/__tests__/concurrency-barrier.test.js |  49 +++
 apps/backend/src/services/__tests__/soft-delete-filters.test.js |   2 +-
 apps/backend/src/services/closure.service.js                    |  35 ++--
 openspec/changes/closure-concurrency-guards/tasks.md             |  76 +++
 7 files changed, 319 insertions(+), 10 deletions(-)
```
Confirmed clean: no `payment.service.js`, no `GroupDetailPage.jsx`, no `schema.prisma`. Within `closure.service.js`, the diff hunk touches only the `partialClosure` function body (approx L292-331); `startClosure` (~L182), `completeClosure` (~L237), `finalClosure` (~L371) bodies are untouched — confirmed by reading the diff hunk boundaries directly, not inferred from the stat alone.

### Deferred Findings Check (6 items — confirmed genuinely out of PR 1 scope)
All 6 relate to `startClosure`/`completeClosure`/`finalClosure` still using unguarded `period.update`, `payment.service.js`'s `acceptPayment`/`rejectPayment` still unguarded, and a frontend refetch gap in `GroupDetailPage.jsx`. Verified directly against the diff (not the apply-progress narrative): none of those 4 files/functions appear in the diff at all. These are legitimately PR 2/PR 3/future-frontend-work scope per `tasks.md`'s Phase 3/4 breakdown and are not slipping through — nothing was silently left half-done inside PR 1's own files.

### Comment-Fix Follow-Up Commit Check (`101c35f`)
Read the full diff of `101c35f` directly. It touches exactly 2 files, with 3 distinct comment edits:
1. `closure.service.js` — added a new comment above `requireZeroBalances` documenting the ADR-6 staleness tradeoff (previously just said "Check all balances are zero", no caveat). Present.
2. `closure.service.js` — rewrote the guard comment: removed the "non-negotiable" absolute framing and the unqualified "closes the TOCTOU race" claim, replaced with "closes the status-based TOCTOU race... it does not re-check balances (see the comment on `requireZeroBalances` above)". Present, correctly qualified.
3. `apps/backend/src/lib/__mocks__/prisma.js` — docblock rewritten from implying `period.updateMany`/`payment.updateMany` were "added for the closure/payment concurrency guards" (ambiguous, reads as both already guarded) to explicitly stating "as of PR 1, only `partialClosure` actually calls `period.updateMany`... `payment.service.js` still calls the unguarded `payment.update` until PR 3 lands; do not assume `payment.updateMany` being stubbed here means payments are already guarded." Present.

Minor count note: the task brief described "4 findings," the diff shows 3 distinct edit locations across 2 files (2 edits inside the same `closure.service.js` function, 1 in the mock docblock). Reads as a benign enumeration difference (the guard-comment hunk arguably fixes two separate overclaims within one hunk), not a missing fix. SUGGESTION-level only, does not block.

### Attribution Check
`git log -2 --format='%H %s%n%b'` on both commits (`7c7c959`, `101c35f`): no `Co-Authored-By`, no `Claude`, no AI-attribution footer in either subject, body, or trailer. Both commits authored by `MaximilianoVallejo1991 <jmaximilianovallejo@gmail.com>`. Confirmed clean — the earlier sub-agent attribution issue is genuinely gone from this branch's history, not just reported gone.

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | Yes | Found in apply-progress's "TDD Cycle Evidence" table |
| All tasks have tests | Yes | 7/7 Phase 1-2 tasks have covering test files |
| RED confirmed (tests exist) | Yes | `concurrency-barrier.test.js`, `closure-concurrency.test.js` both exist and contain the described cases |
| GREEN confirmed (tests pass) | Yes | 60/60 backend tests pass on fresh execution, including all of the above |
| Triangulation adequate | Yes | 3 distinct test cases for the single `partialClosure` guard scenario (double-fire outcome, structural predicate, structural ordering) |
| Safety Net for modified files | Yes | Full suite green (60 backend + 45 frontend) after modifying `closure.service.js`, `soft-delete-filters.test.js`, `prisma.js` mock — re-verified by fresh run, not just trusted from report |

**TDD Compliance**: 6/6 checks passed

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 6 (3 barrier + 3 guard) | 2 (`concurrency-barrier.test.js`, `closure-concurrency.test.js`) | Vitest + manual Prisma mock |
| Integration | 0 | 0 | not applicable to this PR's scope |
| E2E | 0 | 0 | not installed |
| **Total (new to this PR)** | **6** | **2** | |

Critical business logic (the concurrency guard) is covered only at unit level against a mocked Prisma client; this is a SUGGESTION-level observation already acknowledged and scoped out by the test file's own header and ADR-13 — not a gap introduced by this verification.

### Changed File Coverage
Coverage analysis skipped — no coverage tool detected in `apps/backend/package.json` (`test` script is `vitest run`, no `--coverage` configured).

### Assertion Quality
No violations found. All assertions in `concurrency-barrier.test.js` and `closure-concurrency.test.js` call production code (`createBarrier`, `partialClosure`) and assert concrete values (fulfillment counts, error code/status, exact call counts, call-order indices, `where`/`data` shape) — no tautologies, no ghost loops, no smoke-test-only patterns, no CSS/implementation-detail coupling. Mock/assertion ratio in `closure-concurrency.test.js`: 1 `vi.mock()` call vs 11 total `expect()` calls across 3 tests — well under the 2x threshold.

**Assertion quality**: All assertions verify real behavior.

### Quality Metrics
**Linter**: Not available (no lint script in `apps/backend/package.json`)
**Type Checker**: Not available (JS backend, no TypeScript config detected for this package)

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| Guard as transaction statement #1, no follow-up read | Yes | confirmed in code + test |
| Reuse `createBarrier` + extended Prisma mock for PR 2/PR 3 without further mock-file edits | Yes | mock extends existing object, doesn't redefine; docblock now explicitly documents reuse boundary |
| Tasks.md correction (only L99 collateral fixed in PR 1, L53/74/121 deferred to PR 2) | Yes | confirmed by reading `soft-delete-filters.test.js` directly — L53/74/121 still stub `period.update`, L99 now stubs `period.updateMany` |

### Issues Found
**CRITICAL**: None
**WARNING**: None
**SUGGESTION**:
1. The "exactly one current period" scenario is tested only at the mock-conflict/structural level, not against real Postgres row-locking — explicitly disclosed by the test file and accepted by design ADR-13; the real guarantee closes once the Phase 5 (PR 4) partial unique index lands. Worth flagging in PR 1's description for reviewers unfamiliar with that boundary.
2. Minor enumeration mismatch: task brief said "4" comment-wording fixes in `101c35f`; the diff shows 3 distinct edit locations (one hunk arguably contains 2 separate overclaim fixes). No missing fix, purely a counting nuance.

### Verdict
**PASS**
PR 1 (Phases 1-2) is implementation-complete, fully tested (105/105 passing on a fresh re-run), scope-contained to the 7 files it should touch, free of AI-attribution in its commit history, and its follow-up comment-fix commit (`101c35f`) is verified present and substantively correct. The 6 deferred findings are confirmed genuinely out of scope — no code in this PR silently leaves them half-fixed. Ready to push and open for human review.
