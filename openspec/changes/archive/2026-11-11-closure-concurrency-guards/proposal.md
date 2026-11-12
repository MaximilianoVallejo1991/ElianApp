# Proposal: Closure Concurrency Guards

## Intent

Every closure-transition and payment-acceptance function in this codebase is written as read-then-write: a separate `findUnique`/`findFirst`, a JS `if` on the status, then a later `update` whose `where` is only `{ id }` — the status guard is never re-asserted atomically. Under Postgres's default `READ COMMITTED` isolation a `findFirst` takes no row lock, so two concurrent requests can both pass the same check before either commits. This is a textbook TOCTOU race, and one instance already corrupts data: an owner double-clicking "Cierre parcial" (slow network, retry) can drive two `partialClosure` calls past `status === 'CLOSING'`, each creating its own new period with `isCurrent: true`. The group then has TWO current periods, and every `findFirst({ isCurrent: true })` across `period.service.js`, `expense.service.js` and `payment.service.js` returns an arbitrary one — new expenses and payments attach to either, permanently corrupting that group's closure and balance timeline. `acceptPayment`/`rejectPayment` have the same shape with a softer blast radius: last write wins, balance math still converges, but the losing requester gets a success response for an outcome that is not the final DB state — a real user-dispute surface ("I thought I accepted that"). Scope is converting all five functions to atomic conditional updates. No new business logic; this is a concurrency-correctness hardening pass over logic that is already correct single-threaded.

## Scope

### In Scope
- Atomic state guard in `partialClosure` (ALTA — the only confirmed data-corrupting race)
- Atomic state guards in `startClosure`, `completeClosure`, `finalClosure` (MEDIA — mostly idempotent today, guarded for pattern consistency)
- Atomic state guards in `acceptPayment` / `rejectPayment` (MEDIA — deceptive-success UX)
- Guard-write-first ordering inside every closure/payment `$transaction` that also touches a foreign-key-related row (`Period` insert, `Group` update)
- A conflict error on guard failure via `AppError` (409), replacing the silent proceed
- Extending the shared Prisma mock (`src/lib/__mocks__/prisma.js`) with `period.updateMany` / `payment.updateMany`
- Deterministic two-part barrier concurrency tests (Strict TDD, `pnpm --filter backend test && pnpm --filter frontend test`)

### Out of Scope
- Frontend double-submit guard on accept/reject/closure buttons — explicitly deferred (owner decision); the atomic backend guard already removes all data corruption, so this is a pure UX refinement addable later without re-opening this change
- A partial unique index on `Period (groupId) WHERE isCurrent = true` as DB-level defense-in-depth — requires a raw-SQL Prisma migration; see Risks
- A real-Postgres integration test harness (Docker/testcontainers, test DB, CI wiring) — see Risks for what this costs us in proof strength
- Staleness of the read-only preconditions (`requireZeroBalances`, PENDING-payment count) between check and guard-write — a different race class, pre-existing, not addressed here
- Any new business logic, status, endpoint or response field beyond the conflict error
- Any `permissions-and-process-cleanup` (Cycle 3) or `money-arithmetic-utility` (Cycle 4) item

## Capabilities

### New Capabilities
- `period-closure`: the STATIC-group closure state machine (`OPEN → CLOSING → CLOSED`/`FINAL`, partial reopen) and its concurrency guarantees. No live spec exists today — `openspec/changes/static-group-closures/` was declared void by the owner and MUST NOT be reconciled against.

### Modified Capabilities
- `payment-acceptance`: accept/reject MUST have exactly one winner under concurrency; the loser MUST receive a conflict error, never a success response for an outcome it did not produce

## Approach

1. **The pattern (prior art, already validated by this owner on the sibling Stock Control project — adopt as given, do not re-derive)**: every concurrency guard is a condition inside the `WHERE` of an `update`/`updateMany`, never an `if` after a separate `findFirst`/`findUnique`. Canonical form:
   ```js
   const result = await tx.period.updateMany({
     where: { id: period.id, status: 'CLOSING' },
     data: { status: 'CLOSED', isCurrent: false, closedAt: new Date() },
   });
   if (result.count !== 1) throw new AppError('CLOSURE_BLOCKED', 409, '...');
   ```
   `count === 0` means someone else already transitioned the row (or it was never in the expected state) — conflict, not proceed.
2. **`updateMany`, not extended `whereUnique`**: Prisma 7 would accept `update({ where: { id, status } })` (`extendedWhereUnique`, GA) and raise `P2025` on guard failure, but we deliberately use `updateMany` + `count` so the conflict is an explicit branch rather than an exception-shape dependency on a Prisma error code.
3. **Consequence of `updateMany`: it returns a count, not the row, and supports no `include`.** `startClosure`, `completeClosure`, `finalClosure` and `acceptPayment`/`rejectPayment` all currently return the updated record (the payment ones with `fromUser`/`toUser` includes). Each becomes guard-write → follow-up read inside the same `$transaction`, so the response is consistent with the write that won.
4. **Write no-op as a lock**: when the guard condition itself must be the lock but no field needs to change, write the same value back (`data: { status: 'OPEN' }` on a row already `OPEN`). The `update` still takes the row lock; a `findFirst` would not. Available in the toolkit; apply only where a transition is not already writing.
5. **Guard-write FIRST in its transaction**: in any transaction that also inserts/updates a foreign-key-related row, the guarded write goes first. `partialClosure` locks the old `Period`, then inserts the new one (which takes an FK share lock on `Group`); `finalClosure` locks the `Period`, then updates `Group`. Consistent Period→Group ordering avoids the lock-upgrade deadlock two concurrent transactions hit when they acquire the same two rows in opposite order — a real lesson from the sibling project's `CashRegister` closure-integrity work.
6. **`partialClosure` specifically**: the old period's `CLOSING → CLOSED, isCurrent: false` guarded `updateMany` becomes the first statement of the existing `$transaction`, before `period.create`. A second concurrent call gets `count === 0` and throws, so its transaction rolls back and no second `isCurrent: true` period is ever created. Design MUST re-read the current body (L299-320) and confirm the exact statement order rather than assuming it.
7. **`acceptPayment`/`rejectPayment`**: keep the existing `findUnique` for 404 / soft-delete / receiver-authorization (not race-sensitive in a damaging way), then replace the `if (payment.status !== 'PENDING')` check with `payment.updateMany({ where: { id: paymentId, status: 'PENDING' }, data: { status: 'ACCEPTED' | 'REJECTED', ... } })` and `count === 1`.
8. **Error codes**: closure guards reuse `CLOSURE_BLOCKED` 409 — already the code for every closure precondition in this file, so no contract change. Payment guards use `NOT_PENDING` at **409**, a code already registered in `src/utils/errors.js` but currently unused. This replaces today's `INVALID_OPERATION` 400 on the sequential "already accepted" path: one condition, one code, and 409 is the honest status for a conflict. No new code is registered. Convention is `throw new AppError(code, status, message)` — never `Object.assign(new Error(...))`.
9. **Concurrency tests — deterministic two-part barrier, never a fixed delay.** Both simulated requests run past their read-check, then both block on a shared gate; the gate releases them together, and the stateful/sequenced `updateMany` stub answers `{ count: 1 }` once and `{ count: 0 }` after. A fixed `setTimeout` delay was tried on the sibling project and produced ~40% intermittent failures — it is prohibited here. Note honestly: the current suite mocks Prisma entirely (`vi.mock('../../lib/prisma.js')`, and `$transaction` runs the callback against the same mock object), so these tests prove the guard logic and the conflict branch under interleaving, not Postgres-level atomicity. Atomicity is a property of the SQL statement we emit; the tests additionally assert the status predicate is present in the `where` of the guarded write, which is the part we control.
10. **Delivery risk (ask-on-risk)**: closure/money-lifecycle logic → medium risk, explicit go-ahead required before PR. Five functions + mock extension + a new concurrency test file lands near the 400-line budget. If it exceeds, split `stacked-to-main`: #1 closure guards (`partialClosure` first, then the three transitions), #2 payment accept/reject guards.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/backend/src/services/closure.service.js` | Modified | `partialClosure` (L299-320): guarded `updateMany` as first statement of the `$transaction`, before `period.create` |
| `apps/backend/src/services/closure.service.js` | Modified | `startClosure` (L182-185): `OPEN → CLOSING` guarded `updateMany` + follow-up read for the return value |
| `apps/backend/src/services/closure.service.js` | Modified | `completeClosure` (L237-243): `CLOSING → CLOSED` guarded `updateMany` + follow-up read |
| `apps/backend/src/services/closure.service.js` | Modified | `finalClosure` (L371-389): `CLOSING → FINAL` guarded `updateMany` first, then the `Group` update (Period→Group lock order) |
| `apps/backend/src/services/payment.service.js` | Modified | `acceptPayment` (L296-315) and `rejectPayment` (L355-377): `status: 'PENDING'` moves into the `where` of a guarded `updateMany`; response rebuilt via a follow-up read with the existing `fromUser`/`toUser` includes |
| `apps/backend/src/utils/errors.js` | Modified | Docblock only: note `NOT_PENDING` is used at 409 for payment accept/reject conflicts. `INVALID_OPERATION` is used by three services but absent from the registered code list — add it while here |
| `apps/backend/src/lib/__mocks__/prisma.js` | Modified | Add `period.updateMany` and `payment.updateMany` stubs; extend per the file's own "extend, don't redefine" convention |
| `apps/backend/src/services/__tests__/closure-concurrency.test.js` | New | Barrier tests: double `partialClosure` creates exactly one new current period; double-fire on each of the three transitions yields one winner + one 409 |
| `apps/backend/src/services/__tests__/payment-concurrency.test.js` | New | Barrier tests: concurrent accept+accept and accept+reject yield exactly one winner and one `NOT_PENDING` 409 |
| `apps/frontend/**` | Unchanged | Backend-only cycle by owner decision; the frontend does not switch on `INVALID_OPERATION` anywhere, so the 400 → 409 change needs no UI edit |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Mocked-Prisma tests cannot prove real DB atomicity — they prove guard logic only | High | Accepted and stated explicitly; also assert the status predicate is in the `where` of the guarded write. Real-Postgres harness deferred — **decision needed from owner** |
| `@@index([groupId, isCurrent])` is a plain index, not unique — the DB has zero protection if any future code path skips the guard | Med | Application guard closes the known hole now. A partial unique index is the durable fix but needs a raw-SQL migration — **decision needed from owner** |
| Payment conflict status changes from `INVALID_OPERATION` 400 to `NOT_PENDING` 409 | Med | Grep-confirmed: no frontend or backend consumer switches on `INVALID_OPERATION`. Still an API-contract change — **confirm with owner before spec** |
| `updateMany` drops the `include`, so accept/reject could silently start returning a bare payment | Med | Follow-up read inside the same `$transaction` with the identical `include`; assert the response shape in tests |
| Guard-write placed after another write in a transaction reintroduces the lock-upgrade deadlock | Med | Hard rule: guarded write is statement #1; Period before Group. Design must verify no existing transaction takes Group first |
| Preconditions (`requireZeroBalances`, PENDING count) can still go stale between read and guard-write | Med | Out of scope and documented; the guard prevents the corrupting outcome, not every stale read. Flag for a later cycle |
| `$transaction` mock resolves the callback synchronously against the same object, so a naive barrier test passes vacuously | Med | The barrier must gate at the service seam (before the guarded write), and `updateMany` must be stateful or `mockResolvedValueOnce`-sequenced `1` then `0` |
| Fixed-delay race tests are flaky (~40% intermittent on the sibling project) | High | `setTimeout`-based synchronization is prohibited; two-promise gate only |
| Void `static-group-closures` / `archive-groups` change folders imply in-flight closure work | Med | Declared void by the owner; do not reconcile, merge or verify against them |

## Rollback Plan

1. Each function's guard is an isolated commit: revert individually without touching the others.
2. No schema, no migration, no data mutation — revert is pure code, zero data risk.
3. Reverting the `partialClosure` guard restores the double-`isCurrent` race but leaves existing `Period` rows untouched; any period rows already created correctly stay correct.
4. Reverting the payment guards restores `INVALID_OPERATION` 400 on the non-PENDING path; `ACCEPTED`/`REJECTED` rows written meanwhile remain valid and keep counting in balances.
5. If a group somehow already has two `isCurrent: true` periods, that is pre-existing data corruption this change prevents but does not repair — no backfill (pre-production, zero real users).

## Dependencies

- `AppError` + codes `CLOSURE_BLOCKED`, `NOT_PENDING`, `PAYMENT_NOT_FOUND` in `apps/backend/src/utils/errors.js` (all already registered)
- Prisma 7 `updateMany` returning `{ count }`; Postgres `READ COMMITTED` default isolation
- Shared Prisma mock at `apps/backend/src/lib/__mocks__/prisma.js` (must gain `updateMany` stubs before any test can go red for the right reason)
- Vitest in both apps; Strict TDD active (`pnpm --filter backend test && pnpm --filter frontend test`)
- `money-correctness-fixes` (Cycle 1) merged and archived — this change edits the same two service files and assumes their post-Cycle-1 bodies

## Success Criteria

- [ ] Two concurrent `partialClosure` calls that both pass the `CLOSING` read-check result in exactly ONE new period, exactly ONE `isCurrent: true` period for the group, and one `CLOSURE_BLOCKED` 409
- [ ] Two concurrent `startClosure` calls yield one `OPEN → CLOSING` transition and one `CLOSURE_BLOCKED` 409
- [ ] Two concurrent `completeClosure` calls yield one `CLOSING → CLOSED` transition and one `CLOSURE_BLOCKED` 409
- [ ] Two concurrent `finalClosure` calls yield one `CLOSING → FINAL` transition, one `Group` status change to `CLOSED`, and one `CLOSURE_BLOCKED` 409
- [ ] Concurrent accept+accept on the same payment yields one `ACCEPTED` and one `NOT_PENDING` 409 — no requester receives success for an outcome it did not produce
- [ ] Concurrent accept+reject on the same payment yields exactly one terminal status, and the loser's response matches the DB's final state
- [ ] All five functions assert their state guard inside the `where` of an `update`/`updateMany`; no `if` on a status read from a separate `findFirst`/`findUnique` remains in any of them
- [ ] In every modified `$transaction`, the guarded write is the first statement; closure transactions touch `Period` before `Group`
- [ ] `acceptPayment`/`rejectPayment` still return the payment with `fromUser` and `toUser` populated
- [ ] Every concurrency test uses a two-promise barrier; no `setTimeout`/fixed delay appears in any new test
- [ ] One failing test preceded every guard; `pnpm --filter backend test && pnpm --filter frontend test` passes
- [ ] `pnpm -r run build` passes
- [ ] No frontend file changed
