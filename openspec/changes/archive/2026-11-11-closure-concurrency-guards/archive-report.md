# Archive Report: Closure Concurrency Guards

**Change name**: closure-concurrency-guards
**Status**: COMPLETE
**Archive date**: 2026-11-11

## Executive summary

All five closure/payment-acceptance state-transition functions (`startClosure`, `completeClosure`, `partialClosure`, `finalClosure`, `acceptPayment`, `rejectPayment`) previously used a read-then-write pattern vulnerable to TOCTOU races under concurrent requests. Confirmed data-corrupting: `partialClosure` could create two periods marked `isCurrent: true` for the same group under a double-fire race. The other four had the same shape but a less severe failure mode (mostly idempotent, or a deceptive-success UX issue for payments).

All five were converted to atomic conditional updates (`updateMany` + `count` check inside a transaction, guard as the first statement) across 4 chained PRs, plus a database-level partial unique index as defense-in-depth. A pre-existing, unrelated spec/code mismatch surfaced during verification (REJECTED payments and STATIC closure) was investigated and resolved by correcting the spec, not the code — a tempting "fix" was built, tested, and deliberately reverted because it would have made things worse.

## PRs merged to main

| PR | Content | Lines | Status |
|----|---------|------:|--------|
| #5 | `partialClosure` atomic guard + concurrency-barrier test helper + Prisma mock harness extension | 454 | Merged |
| #6 | `startClosure`/`completeClosure`/`finalClosure` atomic guards + the `completeClosure.isCurrent` bug fix found in review | 479 | Merged |
| #7 | `acceptPayment`/`rejectPayment` atomic guards (400→409 contract change) + the `deletedAt` guard gap fix found in review | 455 | Merged |
| #8 | Native Prisma partial unique index (`Period.groupId` WHERE `isCurrent=true`) + generated migration | 118 | Merged |

Total: ~1506 lines across 4 PRs, chained `stacked-to-main`, each independently reviewed (fresh-context code review), verified (`sdd-verify`), and merged before the next began.

## Real bugs found during this change's own review passes (not pre-existing, found while building the fix)

1. **`completeClosure` never cleared `isCurrent`** on the period it closed (PR 2) — would have permanently stranded a group's current-period pointer on a CLOSED row. One-line fix, own RED/GREEN test.
2. **`acceptPayment`/`rejectPayment`'s guard omitted `deletedAt: null`** from its `where` (PR 3) — a payment soft-deleted mid-flight could still be atomically accepted/rejected. Same bug class as #1: a precondition the old pre-read checked that the new atomic guard needed to re-assert itself and initially didn't.
3. **A real lock-order inversion** between `finalClosure` (Period→Group) and `deleteGroup`'s cascade (Group→Period) — accepted and documented, not fixed (narrow window, worst case is a harmless deadlock abort, fix belongs to group deletion, out of scope).
4. **Two comment-accuracy issues** including an inadvertent CAPS-emphasis violation of this project's own code-generation rules, traced back to the orchestrator's own apply-prompt wording echoing into generated comments — a process lesson for future prompts, not just a code fix.

## The REJECTED-payments-blocks-closure investigation (pre-archive)

The live `payment-acceptance` spec (inherited from an earlier change) required blocking STATIC closure on any REJECTED payment. The code never implemented this — all four closure functions have always deliberately treated REJECTED as "historical, not blocking."

A fix was built matching the spec (count REJECTED payments, block if any exist) and then the user asked the right question before it shipped: *if a rejected payment's debt is later settled by a new payment, would closure still be possible?* Tracing the implementation: no — it would block permanently, since nothing ever clears a historical REJECTED row even after its debt is resettled. That fix was reverted, never merged.

**Resolution**: the spec was corrected to match the code's real, intentional behavior ("REJECTED Payments Do Not Block STATIC Closure"). The genuine gap this surfaced — a specific two-party dispute can be masked if the group's *aggregate* balance nets to zero via other payments — is documented as a known, deliberately-unfixed gap, with a real design direction (a payment "resolution" concept, not a blanket reject-count) saved separately in Engram (`architecture/payment-rejection-resolution-concept`) for a future change.

## Specs synced to the live tree (`openspec/specs/`)

| Capability | Action | What changed |
|------------|--------|--------------|
| `period-management` | **Created** | First live spec for this capability (previously only existed as a stale, unmerged proposal under the void `static-group-closures` change). 5 requirements: the 4 closure-transition atomic guarantees + the database-level current-period invariant. |
| `payment-acceptance` | Updated | Accept/Reject Payment requirements updated for the atomic-guard behavior and the 400→409 contract change; 2 concurrency scenarios added. The pre-existing "Rejection Blocks STATIC Closure" requirement corrected to match reality (see investigation above), not left as a silent contradiction. |

## Deferred / not fixed in this change

- The `deleteGroup`↔`finalClosure` lock-order inversion (accepted risk, documented in code comments and design.md).
- Extracting the now-6x-duplicated atomic-guard pattern (`updateMany` + count check + throw) into a shared helper — noted as worthwhile, deferred to a dedicated cleanup pass rather than re-touching merged PRs mid-chain.
- A real "payment resolution" concept for the REJECTED-closure edge case (Engram `architecture/payment-rejection-resolution-concept`).
- Concurrency tests in this change are mocked-Prisma-only; they prove the guard logic and conflict branch under interleaving, not real Postgres-level atomicity (an explicit, accepted scope boundary — a real-DB test harness was considered and rejected as out of scope for this change).

## Final verification (Phase 6)

- `pnpm --filter backend test && pnpm --filter frontend test` — 73/73 backend (7 files), 45/45 frontend (3 files), on `main` at `637ec2e`.
- `pnpm -r run build` — passes (frontend clean, pre-existing CSS/chunk-size warnings only).
- Grep sweep: no bare `period.update(`/`payment.update(` remains on any guarded state-transition path; the sole remaining match is `deletePayment`'s legitimate soft-delete `update`.
- Live DB confirmed (via direct `pg_indexes` query against the local dev Postgres container): the partial unique index genuinely exists, not just declared in the migration file.

## Sign-off

All planned tasks (Phases 1-6) complete. The pre-archive deferred finding is resolved (spec corrected, not the code; the resulting design gap tracked separately, not silently dropped). No `Co-Authored-By`/AI attribution on any of the ~20 commits across this change's 4 PRs plus addenda — verified repeatedly throughout, including one case where a sub-agent added one against instruction and was corrected via `git commit --amend` before it was ever pushed.

The `closure-concurrency-guards` change is archived and the SDD cycle is closed.
