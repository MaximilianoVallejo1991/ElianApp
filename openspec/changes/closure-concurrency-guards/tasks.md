# Tasks: Closure Concurrency Guards

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines (single PR) | ~525 (145 prod + 380 tests) |
| 400-line budget risk | High (single PR) / Low per chained PR |
| Chained PRs recommended | Yes |
| Suggested split | PR1 ~150 → PR2 ~190 → PR3 ~175 → PR4 ~10 |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Correction to design's suggested order

Design's narrative says PR1 "carries the collateral fixups for the closure tests" (plural) and PR3 "carries the collateral fixups for the payment tests" — but its own file-change table lists 4 separate broken sites in `soft-delete-filters.test.js` (L53/74/99/121), one per closure function. Fixing all 4 in PR1 would break the suite: `startClosure`/`completeClosure`/`finalClosure` don't get their `updateMany` conversion until PR2, so pointing their mock stubs at `updateMany` in PR1 while production still calls `period.update` makes those 3 assertions fail. Each collateral line must land in the **same PR as the production change it tests**: only L99 (`partialClosure`) belongs in PR1; L53/74/121 belong in PR2. Payment collateral (L331/353/336-343/358-366) is unaffected — both `acceptPayment`/`rejectPayment` land together in PR3, so design's assignment there is correct. PR2's reuse of PR1's barrier helper + mock stubs (no new infra) is confirmed, not corrected.

### Suggested Work Units

| Unit | Goal | PR | Lines | Depends on |
|------|------|-----|------:|------------|
| 1 | `partialClosure` guard + barrier helper + mock stubs + its own collateral fixup (L99) | PR 1 | ~150 | none |
| 2 | `startClosure`/`completeClosure`/`finalClosure` guards + their collateral fixups (L53/74/121) | PR 2 | ~190 | PR 1 (reuses barrier + mock harness) |
| 3 | `acceptPayment`/`rejectPayment` guards + `errors.js` docblock + payment collateral fixups | PR 3 | ~175 | PR 1 (reuses harness); independent of PR 2 |
| 4 | `schema.prisma` partial unique index + generated migration | PR 4 | ~10 | PR 1-3 merged (guards before index, per Migration step 5) |

## Phase 1: Shared Harness — PR 1 `[backend]`

- [x] 1.1 [RED] `concurrency-barrier.test.js`: `createBarrier(2)` releases both parties only after the 2nd `wait()` call
- [x] 1.2 [GREEN] Create `apps/backend/src/services/__tests__/concurrency-barrier.js`: `createBarrier(parties)` per design's exact implementation
- [x] 1.3 [infra] `apps/backend/src/lib/__mocks__/prisma.js`: add `period.updateMany`/`payment.updateMany` stubs (extend, don't redefine)

## Phase 2: `partialClosure` Guard — PR 1 `[backend]`

- [x] 2.1 [RED] `closure-concurrency.test.js`: double-fire `partialClosure` → 1 fulfilled, 1 rejected `CLOSURE_BLOCKED` 409, `period.create` called exactly once
- [x] 2.2 [RED] Structural: `status: 'CLOSING'` in guard `where`; `period.update` never called; guard's `invocationCallOrder` < `period.create`'s
- [x] 2.3 [GREEN] `closure.service.js` `partialClosure` (L299-320): guarded `updateMany` as statement #1, then `period.create` (no follow-up read, no `Group` write)
- [x] 2.4 [Collateral][GREEN] `soft-delete-filters.test.js` L99: `period.update` stub → `period.updateMany.mockResolvedValue({count:1})`

## Phase 3: Remaining Closure Transitions — PR 2 `[backend]`

- [x] 3.1 [RED] `closure-concurrency.test.js`: double-fire `startClosure` → 1 fulfilled, 1 `CLOSURE_BLOCKED` 409
- [x] 3.2 [GREEN] `closure.service.js` `startClosure` (L182-185): wrap in `$transaction`, guarded `updateMany` (`OPEN→CLOSING`) + `findUnique` return
- [x] 3.3 [RED] `closure-concurrency.test.js`: double-fire `completeClosure` → 1 fulfilled, 1 409
- [x] 3.4 [GREEN] `closure.service.js` `completeClosure` (L237-243): same pattern (`requireZeroBalances`/pending-count checks stay above the `$transaction`, ADR-6)
- [x] 3.5 [RED] `closure-concurrency.test.js`: double-fire `finalClosure` → 1 fulfilled + `Group.status=CLOSED`, 1 409; guard's `invocationCallOrder` < `group.update`'s
- [x] 3.6 [GREEN] `closure.service.js` `finalClosure` (L371-389): guard #1 → `group.update` → `findUnique`; add a code comment above the guard documenting the accepted Period→Group vs. `deleteGroup`'s Group→Period lock-order inversion (not fixed here)
- [x] 3.7 [Collateral][GREEN] `soft-delete-filters.test.js` L53/74/121: remaining `period.update` stubs → `period.updateMany` + `period.findUnique`

**Addendum (PR 2, post-apply code review)** — 2 fixes:
1. `completeClosure` never set `isCurrent: false` on the closed period (pre-existing bug, this PR rewrote the exact statement without fixing it) — would permanently strand a group's current-period pointer on a CLOSED row with no way to open a new one. Fixed with a RED→GREEN test asserting `isCurrent: false` in the guard's `data`, then the one-line fix.
2. Comment accuracy: added the missing ADR-6 staleness-disclosure comment to `completeClosure`/`finalClosure` (only `partialClosure` had it); fixed `finalClosure`'s lock-order comment, which falsely claimed to match `partialClosure`'s lock order and used CAPS for emphasis (violates this project's no-persona-emphasis-in-code rule) — shortened to a pointer at design.md's Lock Order Audit.

Deliberately NOT fixed (owner-confirmed, accepted): the guard collapsing "row deleted" vs "status changed" into one generic 409 with no distinct server log (rare edge case, consistent with the already-accepted lock-order-inversion risk); extracting the now-4x-duplicated guard pattern into a shared helper (deferred to a cleanup pass after PR 3 adds 2 more instances, to avoid re-touching PR 1's merged `partialClosure` here).

## Phase 4: Payment Guards — PR 3 `[backend]`

- [x] 4.1 [RED] `payment-concurrency.test.js`: concurrent accept+accept → 1 `ACCEPTED` (with `fromUser`/`toUser`), 1 `NOT_PENDING` 409
- [x] 4.2 [RED] Structural: `status: 'PENDING'` in `where`; `payment.update` never called
- [x] 4.3 [GREEN] `payment.service.js` `acceptPayment` (L296-315): pre-check throws `NOT_PENDING` 409 (was `INVALID_OPERATION` 400); guarded `updateMany` + `findUnique` (same includes) in `$transaction`
- [x] 4.4 [RED] `payment-concurrency.test.js`: concurrent accept+reject → exactly one terminal status, loser's response matches final DB state
- [x] 4.5 [GREEN] `payment.service.js` `rejectPayment` (L354-377): identical pattern, `data: { status: 'REJECTED', rejectionReason }`
- [x] 4.6 [GREEN] `errors.js`: docblock — register `INVALID_OPERATION`; note `NOT_PENDING` now live at 409
- [x] 4.7 [Collateral][GREEN] `soft-delete-filters.test.js` L331/353: `payment.update` "not called" → `payment.updateMany`; L336-343/358-366: stub/assertions → `payment.updateMany` + `payment.findUnique` sequenced `mockResolvedValueOnce` (pre-check read, then post-write read with `fromUser`/`toUser`)

**Addendum (PR 3, post-apply code review)** — `acceptPayment`/`rejectPayment`'s guard `where` only re-asserted `status: 'PENDING'`, not `deletedAt: null` — a payment soft-deleted (no status check in `deletePayment`) between the pre-check read and the transaction committing could still be atomically transitioned. Same bug class as PR 2's `isCurrent` omission: the guard didn't carry over an existing precondition into its atomic form. Fixed with `deletedAt: null` added to both guards' `where`, RED→GREEN via a structural assertion; 2 pre-existing exact-match tests in `soft-delete-filters.test.js` updated to match the new `where` shape. Same generic `NOT_PENDING` 409 on guard failure — consistent with the already-accepted decision not to distinguish "row changed" from "row gone" in this cycle's closure guards.

## Phase 5: DB Defense-in-Depth — PR 4 `[backend]`

- [x] 5.1 `schema.prisma`: add `previewFeatures = ["partialIndexes"]` to `generator client`
- [x] 5.2 `schema.prisma`: add `@@unique([groupId], where: { isCurrent: true })` on `Period`
- [x] 5.3 Run `npx prisma migrate dev --name add_period_current_unique_constraint`; verify generated SQL is a plain `CREATE UNIQUE INDEX` (no `CONCURRENTLY`), commit as-is
- [x] 5.4 Note (not scripted): pre-flight duplicate-`isCurrent` check from design.md before applying in any real environment

**Addendum (PR 4, execution note)** — this sandbox's `npx prisma migrate dev` refuses to run ("environment is non-interactive, which is not supported" — Prisma 7.8's interactive wizard requires a real TTY, which this shell does not provide; `winpty` could not bridge it either, since `npx` here is a shell script, not a Win32 binary). Worked around with the officially documented non-interactive-safe path, producing byte-identical Prisma output, not hand-authored SQL: `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` to get Prisma's own computed diff, wrote that exact output into a manually-timestamped migration folder (`20261111232910_add_period_current_unique_constraint/migration.sql`, same naming convention `prisma migrate dev` would have used), then `npx prisma migrate deploy` to apply it (the documented non-interactive deploy command) and record it in `_prisma_migrations`. Generated SQL confirmed plain, no `CONCURRENTLY`, no unrelated statements: `CREATE UNIQUE INDEX "Period_groupId_key" ON "Period"("groupId") WHERE ("isCurrent" = true);`. Verified post-apply via `pg_indexes` query against the live `splitwise-db` container. One snag: the first failed non-interactive `migrate dev` attempt left an orphaned session holding the `_prisma_migrations` advisory lock, which blocked the subsequent `migrate deploy` with `P1002` until `pg_terminate_backend`'d — not a schema issue, a side effect of the aborted interactive attempt.

Pre-flight duplicate-`isCurrent` check (design.md step 3) run against the local `splitwise-db` Postgres container (`localhost:5433/splitwise`, confirmed local via `docker-compose.yaml` before running anything DB-touching): `SELECT "groupId", COUNT(*) FROM "Period" WHERE "isCurrent" = true GROUP BY "groupId" HAVING COUNT(*) > 1;` → 0 rows. Clean, migration applied without a `23505` conflict.

### Deferred finding (PR 3 verify, pending investigation before archive)

`closure.service.js` (untouched by this cycle) only blocks STATIC closure on PENDING payments — its own code comment says "REJECTED payments are historical, not blocking." But the `payment-acceptance` spec (inherited from Cycle 1) has a "Rejection Blocks STATIC Closure" requirement, with zero test coverage anywhere confirming either behavior. Not a concurrency bug, not caused by this cycle, not blocking any of the 4 PRs — owner decision: leave pending, investigate before archiving this change (unclear yet whether the code or the inherited spec is the stale one).

## Phase 6: Final Verification (after all 4 PRs merged)

- [ ] 6.1 Run `pnpm --filter backend test && pnpm --filter frontend test -- --run` — full suite green
- [ ] 6.2 Run `pnpm -r run build`
- [ ] 6.3 Grep sweep: no `period.update(`/`payment.update(` with bare `where: { id }` remains on any state-transition path (`deletePayment`'s soft-delete `update` is legitimate, must stay)
