# Archive Report: Money Correctness Fixes

**Change Name**: money-correctness-fixes  
**Status**: COMPLETE  
**Archive Date**: 2026-11-11  
**Phase**: 5 (Final Verification)

## Executive Summary

The change has been fully planned, implemented, verified, and archived. Four chained PRs merged to `main` (d2fed35) fixing four critical money-handling defects: soft-delete visibility in closures/balances, percentage-split rounding loss, participation validation in collective-expense items, and DYNAMIC-group payment acceptance. All 54 backend tests and 45 frontend tests pass. Build succeeds. DeletedAt sweep confirms every affected query path includes the soft-delete filter.

## Bugs Fixed

| PR | Bug | Description | Files Changed |
|----|-----|-------------|----------------|
| #1 (PR 1) | Split arithmetic rounding | `calculatePercentageSplits` losing cents due to independent rounding of each share | `apps/backend/src/utils/splits.js`, `apps/frontend/src/utils/splits.js`, test files |
| #2 (PR 2) | Soft-delete visibility in closures and balances | Soft-deleted payments and expenses still counting in closure gates, balance calculations, period queries, and group detail | `apps/backend/src/services/{closure,balance,period,group,payment}.service.js` |
| #3 (PR 3) | Missing participant check in item reporting | Non-participants' items counting toward COLLECTIVE expense completion but excluded from splits | `apps/backend/src/services/item-reporting.service.js`, expense service tests |
| #4 (PR 4) | DYNAMIC payment acceptance blocked by UI | DYNAMIC-group payments stuck PENDING because acceptance UI was gated on period closure status | `apps/frontend/src/pages/GroupDetailPage.jsx`, `apps/frontend/src/utils/payments.js`, test files |

## Chained PRs (Merged to main)

1. **PR #1**: Percentage split rounding + safety guards (backend + frontend, parity verified)
   - Commit: 414627a - 0e901c4 (5 commits on `fix/percentage-split-rounding`)
   - Tests: 18 backend (6 equal + 12 percentage) + 33 frontend
   - Addenda: Four post-merge fresh-context reviews uncovered real defects in the guard logic (rescale within epsilon, NaN bypass, empty-array bypass, negative-percentage bypass)

2. **PR #2**: Soft-delete filters in closure, balance, period, group, payment services
   - Tests: Harness established via `vi.mock('../../lib/prisma.js')` for service-level Prisma argument assertion
   - Coverage: `closure.service.js` L78/157/218/278/349; `balance.service.js` L119-121; `period.service.js` L51-65/101-103/165/340/390; `group.service.js` L119/134; `payment.service.js` accept/reject guards

3. **PR #3**: Participation guard in `reportItem`, splits re-validation in `updateExpense`, member resurrection fix
   - Tests: `expense.service.test.js` (Prisma-mocked) + `item-reporting.service.test.js`
   - Addenda: Three post-merge reviews discovered critical gaps in `updateExpense` fallback path (membership resurrection, participant-subset loss on EQUAL, wasted query for COLLECTIVE)

4. **PR #4**: DYNAMIC payment acceptance UI + status badge
   - Tests: `payments.test.js` (12 test cases covering DYNAMIC/STATIC × PENDING/ACCEPTED/REJECTED × period states)
   - Files: `GroupDetailPage.jsx` logic simplified; acceptance flag extracted to `payments.js` helper for testability

**All 4 PRs merged to main; full test suite green (54/54 backend, 45/45 frontend); build passes.**

## Specs Synced

The following delta specs have been merged into the project's main specs tree (`openspec/specs/`):

| Domain | Action | Details |
|--------|--------|---------|
| balance-calculation | UPDATED | Added new requirement: "Exclude Soft-Deleted Records From Balance, Period, and Closure Queries" (3 scenarios) |
| expense-management | UPDATED | Added 2 new requirements: "Percentage Splits Sum Exactly to Total" + "Splits Re-Validated After Participant Filtering"; modified existing "Report Individual Item" requirement to include non-participant rejection (3 new scenarios) |
| group-management | UPDATED | Modified "Get Group Details" requirement to include soft-delete filter for `expenses` and `payments` includes (2 new scenarios) |
| payment-acceptance | CREATED | New capability spec with 3 requirements: Accept Payment (DYNAMIC + STATIC, mode-agnostic), Reject Payment (DYNAMIC + STATIC), Rejection Blocks STATIC Closure (10 scenarios total) |
| payment-recording | UPDATED | Added 2 new requirements: "Exclude Soft-Deleted Payments From Acceptance" (soft-delete guards in accept/reject endpoints) + "Exclude Soft-Deleted Payments From Closure Blocking" (deletedAt filter in closure queries) |

**Live specs now reflect all changes from the money-correctness-fixes architecture.**

## Deferred Findings

Per Phase 3 task notes and design ADR-5 reasoning, the following findings are recorded for future changes:

1. **EQUAL branch membership validation gap** (Task 3, post-merge review)
   - `computeSplits`' EQUAL branch never validates `participantIds` against active membership, unlike PERCENTAGE branch
   - Affects both `createExpense` and `updateExpense`
   - Deferred to `permissions-and-process-cleanup`

2. **PERCENTAGE `splits: []` normalization gap** (Task 3, second addendum)
   - `updateExpense` treats empty `splits: []` differently than undefined `splits: undefined` for PERCENTAGE expenses
   - Does not fall back to reconstruction, resulting in unnecessary `INVALID_SPLITS` 400 rejection
   - Deferred to `permissions-and-process-cleanup` alongside EQUAL validation

3. **Architectural recommendation: Authoritative `participantIds` on Expense** (Design section)
   - EQUAL/PERCENTAGE expenses reconstruct membership from `ExpenseSplit` side-effects instead of reading an authoritative field
   - Real fix: persist `participantIds` directly on the `Expense` row for EQUAL/PERCENTAGE (requires schema migration)
   - Root of many edge cases chased across PR 3's addenda
   - Recorded in Engram memory: `architecture/expense-participantIds-authoritative-source`

## Phase 5 Verification Summary

**Task 5.1**: `pnpm --filter backend test && pnpm --filter frontend test`  
✓ PASS: 54/54 backend, 45/45 frontend, on main at commit d2fed35

**Task 5.2**: `pnpm -r run build`  
✓ PASS: Frontend builds clean (CSS/chunk-size warnings pre-existing); backend has no build step

**Task 5.3**: Grep sweep for `deletedAt: null` coverage  
✓ COMPLETE: Every site in the Bug-1 flow table carries the filter
- `balance.service.js`: filter in `expenseWhere`/`paymentWhere` variable (L103-105)
- `closure.service.js`: L78 ACCEPTED payment query; L157/218/278/349 PENDING counts
- `period.service.js`: filtered `_count` (L51-53, L101-103); explicit filters at L62/65/165/340/390
- `group.service.js`: `where: { deletedAt: null }` at L119 (expenses), L134 (payments)
- `payment.service.js`: guards at L273-275 (acceptPayment), L328-330 (rejectPayment)

## Artifact Metadata

| Artifact | Path | Format |
|----------|------|--------|
| Proposal | `proposal.md` | Markdown |
| Design | `design.md` | Markdown (11 ADRs, remainder determinism decision) |
| Spec Deltas | `specs/{domain}/spec.md` (5 files) | OpenSpec markdown |
| Tasks | `tasks.md` | Markdown (5 phases, 4 PRs, all tasks checked ✓) |
| Verify Reports | `verify-report-pr{1,2,3,4}.md` | Markdown (1 per PR) |

## Sign-Off

**Task Completion**: All implementation tasks in `tasks.md` marked complete (✓).  
**Verification**: Phase 5 final verification complete; full test suite green; build passes.  
**Spec Merge**: All delta specs merged into `openspec/specs/`; no conflicts.  
**Archive**: Change folder moved to `openspec/changes/archive/2026-11-11-money-correctness-fixes/`.  
**Status**: READY FOR CLOSURE.

The money-correctness-fixes change is archived and the SDD cycle is closed.
