# Design: Closure Concurrency Guards

## Technical Approach

Five read-then-write functions become **guard-write-then-read**. The state predicate that today lives in a JS `if` after a separate `findFirst`/`findUnique` moves into the `where` of an `updateMany`, and `count` becomes the branch:

```js
const guard = await tx.period.updateMany({
  where: { id: period.id, status: 'CLOSING' },
  data: { status: 'CLOSED', isCurrent: false, closedAt: new Date() },
});
if (guard.count !== 1) {
  throw new AppError('CLOSURE_BLOCKED', 409, 'Period is no longer in CLOSING status');
}
```

Three consequences drive every decision below:

1. `updateMany` returns `{ count }`, supports no `include`/`select` of the row — and all five functions currently return the written record. Each needs a **follow-up read inside the same `$transaction`** (ADR-2).
2. The pre-read status check is **kept**, not replaced. It is the fast, friendly path (same code, same message as today) and preserves 404/403 ordering. The `updateMany` guard is the authoritative one. Two checks, one outcome.
3. Prior art in this repo: `invite.service.js` L197 already uses `group.updateMany` + `result.count`. The pattern is not new here; it was just never applied to the state machine.

Mirrored existing patterns:

| Need | Precedent in this repo |
|------|------------------------|
| `updateMany` + `count` return | `invite.service.js` L196-207 (`cleanupExpiredInviteTokens`) |
| `$transaction` with ordered writes | `closure.service.js` L299-320, L371-389 |
| Service test seam | `src/lib/__mocks__/prisma.js` + `soft-delete-filters.test.js` (Cycle 1) |
| `AppError(code, status, message)` | every service |

## Architecture Decisions

| # | Decision | Choice | Alternatives | Rationale |
|---|----------|--------|-------------|-----------|
| ADR-1 | Guard mechanism | `updateMany({ where: { id, status } })` + `count !== 1` → `AppError` 409 | (a) Prisma `extendedWhereUnique` `update({ where: { id, status } })` → catch `P2025`; (b) `SELECT … FOR UPDATE` via `$queryRaw`; (c) `SERIALIZABLE` isolation | Confirmed in the proposal, not re-litigated. The conflict is an explicit `if` branch, not a dependency on a Prisma error-code string. (b)/(c) add raw SQL or retry loops for zero extra safety on a single-row predicate. |
| ADR-2 | Preserving the return shape | Guard-write and follow-up read in the **same `$transaction`**; `startClosure`/`completeClosure` gain a `$transaction` they do not have today | (a) Follow-up read outside a transaction; (b) fabricate the response in JS from the known `data` + the pre-read row | The guard write holds the row's `ROW EXCLUSIVE` lock until commit, so a same-transaction read provably returns **our** write — nobody can interleave. (a) can return a later writer's state (`startClosure` returning `CLOSED`); (b) returns a row that was never read, which is how stale-response bugs start. |
| ADR-3 | Pre-read status check | **Keep** it, ahead of the guard | Delete it and let the guard produce every conflict | Deleting it changes error ordering (a non-OPEN period would now fail *after* the PENDING/expense counts) and loses the specific messages the frontend shows. The guard is the authority; the pre-check is UX. Cost: one query that already exists. |
| ADR-4 | Guard-write position in a transaction | Guarded `updateMany` is **statement #1**, always. `partialClosure`: Period guard → `period.create`. `finalClosure`: Period guard → `group.update` | Guard last, after the "real" work | Period→Group lock order, uniform across both transactions. A losing `partialClosure` aborts **before** `period.create` runs, so no second `isCurrent: true` row is ever written — this is the whole data-corruption fix. Verified against every other `$transaction` in the repo (see Lock Order Audit). |
| ADR-5 | `partialClosure` new-period creation | Stays `tx.period.create({ groupId, status: 'OPEN', isCurrent: true })`, unchanged, as statement #2 | Also write a `Group.currentPeriodId` pointer | **Corrects the task brief**: `Group` has **no `currentPeriodId` column** (`schema.prisma` L10-29). Current-period tracking is `Period.isCurrent` only. `partialClosure` touches no `Group` row today and must not start. |
| ADR-6 | Residual pre-check staleness (`requireZeroBalances`, PENDING count) | Stays a pre-check, outside the guard | Move both inside the guarded transaction | Out of scope per proposal. A `SELECT` inside the transaction still takes no row locks under READ COMMITTED, so moving it buys correctness only with `FOR UPDATE` over every expense/payment/member row — a different, larger change. The guard prevents the *corrupting* outcome; it does not promise every read was fresh. Documented, not hidden. |
| ADR-7 | Payment conflict error | `AppError('NOT_PENDING', 409, 'Payment is not in PENDING status')`, replacing `INVALID_OPERATION` 400 | Keep `INVALID_OPERATION` 400 | `NOT_PENDING` is **confirmed registered** in `errors.js` L11 and used nowhere — reuse, no new code. 409 is the honest status for a lost race. Needs the owner's API-contract confirmation already flagged in the proposal. |
| ADR-8 | DB-level defense in depth | Native Prisma partial unique index: `@@unique([groupId], where: { isCurrent: true })` on `Period`, declared directly in `schema.prisma` | (a) App guard only; (b) `@@unique([groupId, isCurrent])` in the DSL; (c) trigger; (d, rejected after re-check) raw-SQL migration outside the schema | Confirmed decision, **revised after verifying the installed Prisma version**: `apps/backend/package.json` pins `prisma`/`@prisma/client`/`@prisma/adapter-pg` at `^7.8.0`. Prisma added native partial-index support (`where` on `@@index`/`@@unique`) as the `partialIndexes` preview feature in **7.4.0**, stabilized without a flag in Prisma 8. 7.8.0 already has it. (b) is wrong — it would allow only one non-current period per group. (c) is unmaintainable. (d) was the original plan but is now unnecessary and strictly worse: the owner correctly rejected the permanent `migrate dev` drift tax it implies (ADR-9 below). |
| ADR-9 | Enabling the native partial index | Add `previewFeatures = ["partialIndexes"]` to the `generator client` block in `schema.prisma`, then declare `@@unique([groupId], where: { isCurrent: true })` on `Period` as an ordinary schema change, generated via the normal `npx prisma migrate dev --name add_period_current_unique_constraint` flow | (a) Raw-SQL migration living outside the schema (original ADR-9, now superseded); (b) skip the index entirely | Because the index is now declared **in** `schema.prisma`, Prisma's drift detection sees it as expected state — no more hand-reviewing every future `migrate dev` run for a silent `DROP INDEX`. This is the whole reason the owner asked to re-check: "no creo que sea viable o muy profesional" to accept a permanent manual-discipline tax, and a professional alternative existed. `previewFeatures` is Prisma's standard gating for not-yet-fully-stable schema syntax — accepted, not a production-stability risk for an index declaration (Prisma 7.4+ ships it with migration *and* introspection support, not an experimental half-feature). |
| ADR-10 | `CONCURRENTLY` on the generated index | **No** — accept whatever plain `CREATE UNIQUE INDEX ... WHERE ...` Prisma generates from the declarative schema | Hand-edit the generated migration to add `CONCURRENTLY` | Same reasoning as before, just via the generated migration instead of a hand-authored one: `CONCURRENTLY` cannot run inside the transaction Prisma wraps each migration in, and would leave an `INVALID` index behind on failure. `Period` is a tiny table — plain DDL fails atomically and loudly, which is what we want. Do not edit Prisma's generated SQL by hand; if the generated statement ever needs `CONCURRENTLY`, that is a signal to split it into its own non-interactive migration step, not a hand patch. |
| ADR-11 | Catching `P2002` from the new index and translating to 409 | **Do not add.** The app guard makes it unreachable | Wrap `period.create` in a `P2002` → `CLOSURE_BLOCKED` 409 catch | Unreachable code the mocked suite cannot exercise and no test can go red for. If the index ever does fire it means the guard was bypassed — a 500 with a `P2002` in the logs is a louder, more debuggable signal than a swallowed 409. Revisit only if a real-Postgres harness lands. |
| ADR-12 | Concurrency test synchronization | Shared counting **barrier promise** (`createBarrier(2)`), installed in the status-carrying read's `mockImplementation`, plus `mockResolvedValueOnce({count:1})` → `mockResolvedValue({count:0})` sequencing | (a) `setTimeout` offsets; (b) real-Postgres testcontainers | (a) is prohibited by the proposal (~40% intermittent on the sibling project). (b) is explicitly out of scope. The barrier is timer-free and resolves on a single microtask tick, so the interleaving is deterministic. |
| ADR-13 | Proving atomicity the mock cannot prove | Pair every barrier test with a **structural assertion**: the status predicate is present in the `where` of the guarded call, the unguarded `period.update`/`payment.update` is never called, and `invocationCallOrder` proves the guard ran first | Barrier tests alone | The mock cannot model write visibility, so a barrier test proves the *conflict branch*, not SQL atomicity. The structural assertion pins the thing we actually control: the shape of the statement we emit. Accepted limitation, stated in the test file header. |
| ADR-14 | Collateral damage to Cycle 1 tests | `soft-delete-filters.test.js` **must** be updated in the same commits (not a separate cleanup) | Leave it; add new tests only | Six existing assertions break or silently rot — see Collateral below. Shipping a red suite violates Strict TDD; shipping vacuous `expect(payment.update).not.toHaveBeenCalled()` assertions is worse than shipping none. |

## Lock Order Audit (ADR-4 — verified, not assumed)

Every multi-row write path in the backend, and the order it takes locks:

| Path | Order | Deadlock risk vs. `finalClosure` (Period→Group) |
|------|-------|--------------------------------------------------|
| `closure.partialClosure` | Period (guard) → Period (insert, FK share lock on Group) | None — same direction |
| `closure.finalClosure` | Period (guard) → Group (update) | — |
| `group.createGroup` (L23-48) | Group (insert) → Period (insert) | **None.** The Group row is created by this very transaction; it is invisible and unlockable by any other transaction until commit, so no cycle can form |
| `group.updateGroup` (L213), `invite.*` (L41, L197) | single statement, no transaction | None — one lock held, cannot be a cycle participant |
| `expense.*`, `item-reporting.*` | Expense/ExpenseSplit/ExpenseItem only | None — disjoint rows |
| **`group.deleteGroup` (L277)** | **Group (delete) → Period (ON DELETE CASCADE)** | **REAL inversion — flagged, see below** |

### Flagged: `deleteGroup` vs. `finalClosure` (owner decision, not mine to make)

`prisma.group.delete({ where: { id: groupId } })` cascades to `Period` (`schema.prisma` L88, `onDelete: Cascade`), so it locks **Group then Period** — the exact inverse of `finalClosure`. Two concurrent transactions can form a genuine deadlock cycle.

- **Reachability**: requires the owner to delete the group at the same instant as final-closing it, and `deleteGroup` already refuses when active expenses or payments exist (L256, L269) — while `finalClosure` requires at least the current period's expenses to exist. So the window is narrow but not provably empty.
- **Outcome if it fires**: Postgres detects it in ~1s, aborts one transaction with `40P01`, that request 500s. **No data corruption, no partial write.**
- **Recommendation**: accept and document. Restructuring `deleteGroup` to lock Period first (an explicit `period.deleteMany` ahead of `group.delete`) is a correct fix but expands this change into group deletion, which is `permissions-and-process-cleanup` territory.
- **Escalated, not silently decided.** If the owner wants it closed now, it is ~5 lines in `deleteGroup` plus a test, and it belongs in this change rather than a later one.

## Data Flow

### Before → after (all five functions)

```
  BEFORE                                     AFTER
  ──────                                     ─────
  read row ──→ if (status !== X) throw        read row ──→ if (status !== X) throw   ← kept (ADR-3)
       │                                           │
       │  ◄── RACE WINDOW: no lock held            │  ◄── window still open, harmless
       ▼                                           ▼
  update({ where: { id } })                   $transaction:
       │                                        1. updateMany({ where: { id, status: X } })
       ▼                                           │  count 0 → throw 409, tx rolls back
  return row                                       ▼
                                               2. (partialClosure) period.create
                                                  (finalClosure)   group.update
                                                  (others)         —
                                                  3. findUnique({ id })  ← read-your-write,
                                               return row              our lock still held
```

### `partialClosure` — the corrupting race, closed

```
  T1: updateMany({ id: P1, status: 'CLOSING' }) → count 1   [holds P1 lock]
  T2: updateMany({ id: P1, status: 'CLOSING' }) → BLOCKS on T1's lock
  T1: period.create({ isCurrent: true })        → P2
  T1: COMMIT                                                [lock released]
  T2: unblocks, re-evaluates predicate against the committed row
      → status is now 'CLOSED' → count 0 → throw CLOSURE_BLOCKED 409
  T2: ROLLBACK — period.create never ran

  Result: exactly one new period, exactly one isCurrent: true. ✔
```

READ COMMITTED's `UPDATE` re-check-after-block is what makes this work: a blocked `UPDATE` re-evaluates its `WHERE` against the newly committed row version, so T2's predicate genuinely fails. This is not true of a `SELECT`, which is the entire bug.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/backend/src/services/closure.service.js` | Modify | `startClosure` L182-185, `completeClosure` L237-243: `$transaction` with guarded `updateMany` + `findUnique`. `partialClosure` L299-320: guard as statement #1, before `period.create`. `finalClosure` L371-389: guard as statement #1, before `group.update`; `findUnique` for the return |
| `apps/backend/src/services/payment.service.js` | Modify | `acceptPayment` L296-315, `rejectPayment` L354-377: `status !== 'PENDING'` pre-check keeps shape but throws `NOT_PENDING` 409; write becomes guarded `payment.updateMany` + `findUnique` with the existing `fromUser`/`toUser` includes, in one `$transaction` |
| `apps/backend/src/utils/errors.js` | Modify | Docblock only: add `INVALID_OPERATION` to the registered list (used by three services, currently absent); note `NOT_PENDING` is now live at 409 |
| `apps/backend/src/lib/__mocks__/prisma.js` | Modify | Add `period.updateMany` and `payment.updateMany`. `period.findUnique` already exists; `payment.findUnique` already exists. Extend, do not redefine (file's own convention, L15-19) |
| `apps/backend/prisma/schema.prisma` | Modify | Enable `previewFeatures = ["partialIndexes"]` on `generator client` (L1-3); add `@@unique([groupId], where: { isCurrent: true })` on `Period` (ADR-8/9) |
| `apps/backend/prisma/migrations/{YYYYMMDDHHMMSS}_add_period_current_unique_constraint/migration.sql` | **Generated** | Via `npx prisma migrate dev --name add_period_current_unique_constraint` — do not hand-author |
| `apps/backend/src/services/__tests__/concurrency-barrier.js` | **Create** | `createBarrier(parties)` helper. Not a `.test.js` file so Vitest does not collect it |
| `apps/backend/src/services/__tests__/closure-concurrency.test.js` | **Create** | Barrier + structural tests for the four closure transitions |
| `apps/backend/src/services/__tests__/payment-concurrency.test.js` | **Create** | Barrier + structural tests for accept/accept and accept/reject |
| `apps/backend/src/services/__tests__/soft-delete-filters.test.js` | **Modify (collateral, mandatory)** | See Collateral below |
| `apps/frontend/**` | Unchanged | Backend-only cycle. Grep-confirmed in Cycle 1: nothing switches on `INVALID_OPERATION` |

### Collateral: `soft-delete-filters.test.js` (ADR-14)

Cycle 1's suite stubs `period.update` / `payment.update` as the terminal write. After this change those stubs are never called and `updateMany` returns `undefined` → `guard.count` throws `TypeError`. Required edits:

| Lines | Edit |
|-------|------|
| 53, 74, 99, 121 | `prisma.period.update.mockResolvedValue(…)` → `prisma.period.updateMany.mockResolvedValue({ count: 1 })` **plus** `prisma.period.findUnique.mockResolvedValue(…)` for the return value |
| 331, 353 | `expect(prisma.payment.update).not.toHaveBeenCalled()` → `prisma.payment.updateMany` (otherwise the assertion passes vacuously forever) |
| 336-343, 358-366 | `payment.update` stub + `toHaveBeenCalledWith` → `payment.updateMany` with the status predicate in `where`, and `payment.findUnique` sequenced with `mockResolvedValueOnce` (it is now called **twice** per accept/reject: the pre-check with `include: { group }`, then the post-write read with `include: { fromUser, toUser }`) |

The double-`payment.findUnique` sequencing is the easiest thing in this change to get silently wrong. `mockResolvedValue` (not `Once`) returns the pre-check row for both calls, and the post-write response then lacks `fromUser`/`toUser` without any test failing.

## Interfaces / Contracts

### `startClosure` — guarded tail (replaces L182-185)

```js
  return prisma.$transaction(async (tx) => {
    // Atomic guard: re-assert OPEN inside the write. A concurrent caller that
    // passed the same read-check above loses here with count 0.
    const guard = await tx.period.updateMany({
      where: { id: period.id, status: 'OPEN' },
      data: { status: 'CLOSING' },
    });

    if (guard.count !== 1) {
      throw new AppError('CLOSURE_BLOCKED', 409, 'Period is no longer in OPEN status');
    }

    // Our write holds the row lock until commit, so this read returns our own
    // transition — `updateMany` cannot return the row itself.
    return tx.period.findUnique({ where: { id: period.id } });
  });
```

`completeClosure` is identical with `status: 'CLOSING'` → `data: { status: 'CLOSED', closedAt: new Date() }` and message `'Period is no longer in CLOSING status'`. Its `pendingPayments` count and `requireZeroBalances(period.id, groupId)` stay **above** the transaction, unchanged (ADR-6).

### `partialClosure` — transaction body (replaces L299-320)

```js
  return prisma.$transaction(async (tx) => {
    // STATEMENT #1, non-negotiable: the guard must win or lose before any new
    // period exists. A loser's count is 0 and the whole tx rolls back, so the
    // second `isCurrent: true` row is never created. Period before Group.
    const guard = await tx.period.updateMany({
      where: { id: period.id, status: 'CLOSING' },
      data: { status: 'CLOSED', isCurrent: false, closedAt: new Date() },
    });

    if (guard.count !== 1) {
      throw new AppError('CLOSURE_BLOCKED', 409, 'Period is no longer in CLOSING status');
    }

    return tx.period.create({
      data: { groupId, status: 'OPEN', isCurrent: true },
    });
  });
```

No follow-up read: the return value is the **new** period, and `create` already returns it. No `Group` write (ADR-5).

### `finalClosure` — transaction body (replaces L371-389)

```js
  return prisma.$transaction(async (tx) => {
    // STATEMENT #1: Period before Group, matching partialClosure. See the
    // Lock Order Audit in design.md before reordering this.
    const guard = await tx.period.updateMany({
      where: { id: period.id, status: 'CLOSING' },
      data: { status: 'FINAL', isCurrent: false, closedAt: new Date() },
    });

    if (guard.count !== 1) {
      throw new AppError('CLOSURE_BLOCKED', 409, 'Period is no longer in CLOSING status');
    }

    await tx.group.update({ where: { id: groupId }, data: { status: 'CLOSED' } });

    return tx.period.findUnique({ where: { id: period.id } });
  });
```

### `acceptPayment` — guarded tail (replaces L296-315)

```js
  // Fast path: a clearly non-PENDING payment fails here with the same code the
  // guard below would produce. The guard is the authoritative check.
  if (payment.status !== 'PENDING') {
    throw new AppError('NOT_PENDING', 409, 'Payment is not in PENDING status');
  }

  return prisma.$transaction(async (tx) => {
    const guard = await tx.payment.updateMany({
      where: { id: paymentId, status: 'PENDING' },
      data: { status: 'ACCEPTED' },
    });

    if (guard.count !== 1) {
      throw new AppError('NOT_PENDING', 409, 'Payment is not in PENDING status');
    }

    // Same include as before — `updateMany` supports none.
    return tx.payment.findUnique({
      where: { id: paymentId },
      include: {
        fromUser: { select: { id: true, email: true, nickName: true } },
        toUser: { select: { id: true, email: true, nickName: true } },
      },
    });
  });
```

`rejectPayment` is identical with `data: { status: 'REJECTED', rejectionReason: rejectionReason || null }`. The `findUnique` 404 / `deletedAt` / `toUserId !== userId` blocks above (L269-293 / L328-352) are **untouched** — ordering 404 → 403 → 409 is preserved.

### Native partial unique index (ADR-8/9) — schema.prisma changes

Two changes to `apps/backend/prisma/schema.prisma`, both ordinary DSL (no raw SQL authored by hand):

**1. Enable the preview feature** on the `generator client` block (currently just `provider = "prisma-client-js"`, L1-3):

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["partialIndexes"]
}
```

**2. Add the partial unique constraint** on `Period`, alongside its existing indexes (near `@@index([groupId, isCurrent])`):

```prisma
  @@index([groupId])
  @@index([groupId, status])
  @@index([groupId, isCurrent])
  @@unique([groupId], where: { isCurrent: true })
```

No comment-block workaround needed — the constraint is a first-class part of the schema, so `prisma migrate dev`'s drift detection sees it as expected state instead of foreign DDL.

### Migration — generated, not hand-authored

Folder convention confirmed from `apps/backend/prisma/migrations/`: `{YYYYMMDDHHMMSS}_{snake_case_name}/migration.sql`, flat, with `migration_lock.toml` at the root (`provider = postgresql`). Existing examples: `20260612013051_init`, `20260616004935_add_drinks_gifts_categories`.

Generate normally — do not hand-author the SQL this time:

```
npx prisma migrate dev --name add_period_current_unique_constraint
```

Prisma will emit the equivalent of:

```sql
CREATE UNIQUE INDEX "Period_groupId_key" ON "Period"("groupId") WHERE "isCurrent" = true;
```

(exact generated index name may differ — accept whatever Prisma names it, don't rename by hand). Review the generated file once to confirm it's a plain, non-`CONCURRENTLY` `CREATE UNIQUE INDEX` (ADR-10) and contains no unrelated statements, then commit it as-is alongside the schema change.

## Testing Strategy

Strict TDD is active. Command: `pnpm --filter backend test && pnpm --filter frontend test -- --run`.

### The barrier (ADR-12) — `__tests__/concurrency-barrier.js`

```js
/**
 * Deterministic N-party barrier for concurrency tests. Timer-free.
 *
 * Every caller parks on the SAME promise; the Nth arrival resolves it, so all
 * parties resume on one microtask tick with no wall-clock dependency.
 * `setTimeout`-based race tests are PROHIBITED in this repo — they produced
 * ~40% intermittent failures on the sibling project.
 *
 * Usage: install `await wait()` inside the mockImplementation of the read that
 * carries the state being guarded, so no caller can reach its guard-write
 * until every caller has passed its read-check. That IS the TOCTOU window.
 */
export function createBarrier(parties) {
  let arrived = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });

  return function wait() {
    arrived += 1;
    if (arrived >= parties) release();
    return gate;
  };
}
```

Canonical usage — `partialClosure` double-fire:

```js
const wait = createBarrier(2);

prisma.period.findFirst.mockImplementation(async () => {
  await wait();                                   // both callers park HERE
  return { id: periodId, status: 'CLOSING' };     // both read CLOSING
});

prisma.period.updateMany
  .mockResolvedValueOnce({ count: 1 })            // winner
  .mockResolvedValue({ count: 0 });               // every loser
prisma.period.create.mockResolvedValue({ id: 'period-2', status: 'OPEN', isCurrent: true });

const results = await Promise.allSettled([
  partialClosure(groupId, ownerId),
  partialClosure(groupId, ownerId),
]);

expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
const rejected = results.find((r) => r.status === 'rejected').reason;
expect(rejected).toBeInstanceOf(AppError);
expect(rejected).toMatchObject({ code: 'CLOSURE_BLOCKED', status: 409 });
expect(prisma.period.create).toHaveBeenCalledTimes(1);   // the corruption fix
```

Payment tests gate on `prisma.payment.findUnique` instead, using `mockImplementation` that awaits the barrier and returns the PENDING row (and remember it is called a second time post-write — sequence with a call counter or `mockImplementationOnce` chains).

### The structural assertion (ADR-13) — the half the mock *can* prove

```js
it('asserts the status predicate inside the where of the guarded write', async () => {
  // …single happy-path call…
  expect(prisma.period.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ id: periodId, status: 'CLOSING' }),
    }),
  );
  // No unguarded write may remain — this is what fails if someone "simplifies"
  // the guard back into a JS `if` plus `update({ where: { id } })`.
  expect(prisma.period.update).not.toHaveBeenCalled();
});

it('runs the guard as the first statement of the transaction', () => {
  expect(prisma.period.updateMany.mock.invocationCallOrder[0])
    .toBeLessThan(prisma.period.create.mock.invocationCallOrder[0]);  // partialClosure
  // finalClosure: … .toBeLessThan(prisma.group.update.mock.invocationCallOrder[0])
});
```

`invocationCallOrder` is a global monotonic counter across all `vi.fn()`s, so it pins statement order inside the transaction without any extra instrumentation. This is the mechanical, non-bypassable encoding of ADR-4.

### Coverage matrix

| Layer | What to test | Approach |
|-------|-------------|----------|
| Unit — barrier | `createBarrier(2)` releases both parties, never before the 2nd arrival | Direct test; assert a flag is still false after the 1st `wait()` |
| Unit — closure | Double-fire on each of `startClosure` / `completeClosure` / `partialClosure` / `finalClosure` → 1 fulfilled + 1 `CLOSURE_BLOCKED` 409; `partialClosure` calls `period.create` exactly once; `finalClosure` calls `group.update` exactly once | Barrier + sequenced `updateMany` |
| Unit — closure structure | Status predicate in `where`; `period.update` never called; guard before `period.create` / `group.update` | Argument + `invocationCallOrder` assertions |
| Unit — payment | accept+accept and accept+reject → exactly one terminal status, loser gets `NOT_PENDING` 409; winner's response has `fromUser` **and** `toUser` populated | Barrier + sequenced `updateMany` + sequenced `findUnique` |
| Unit — payment structure | `status: 'PENDING'` in `where`; `payment.update` never called by accept/reject | Argument assertions |
| Regression | Cycle 1's `soft-delete-filters.test.js` green after the ADR-14 edits | Existing suite |
| Not covered | Real Postgres atomicity, actual deadlock behavior, the partial unique index firing | Out of scope (ADR-13, ADR-11). Stated in each test file's header — do not let the green suite imply more than it proves |

## Migration / Rollout

1. **Code is pure-revert.** Each function's guard is an isolated commit; reverting one restores the old read-then-write without touching the others.
2. **The migration is additive DDL only** — no `ALTER TABLE`, no data mutation, no backfill. Rollback is `DROP INDEX "Period_groupId_current_key";` in a follow-up migration.
3. **Pre-flight check before applying the migration** (answers "does this need data cleanup first?"):
   ```sql
   SELECT "groupId", COUNT(*) FROM "Period" WHERE "isCurrent" = true GROUP BY "groupId" HAVING COUNT(*) > 1;
   ```
   Expected: zero rows. The only paths that write `isCurrent: true` are `createGroup` (once per group) and the racy `partialClosure` — so duplicates are possible in principle and, per the Cycle 1 decision, unlikely in practice (pre-production, no real users).
4. **If duplicates do exist the migration fails loudly** — Postgres aborts `CREATE UNIQUE INDEX` with `23505`, Prisma marks the migration failed, the index is not created, and **nothing else in the migration changed**, so there is no partial state to untangle. That is the correct outcome: a hard stop surfacing pre-existing corruption rather than a silent half-fix. Resolution would be a one-off `UPDATE "Period" SET "isCurrent" = false` on the losers — a data decision for the owner, deliberately **not** scripted here.
5. **Apply order**: code guards first, migration second. Reversed, a duplicate-current group would keep failing `partialClosure` with an opaque `P2002` instead of a clean 409.
6. **Verification after apply**: `pnpm --filter backend test && pnpm --filter frontend test -- --run && pnpm -r run build`, then grep the two service files to confirm no `period.update(` / `payment.update(` with a bare `where: { id }` remains on any state-transition path (`deletePayment`'s soft-delete `update` is legitimate and must stay).

## Review Budget / Delivery

| Slice | Production | Tests | Total |
|-------|-----------:|------:|------:|
| 1 — `partialClosure` guard + barrier helper + mock extension | ~35 | ~110 | ~145 |
| 2 — `startClosure` / `completeClosure` / `finalClosure` guards | ~55 | ~120 | ~175 |
| 3 — `acceptPayment` / `rejectPayment` guards + `errors.js` docblock | ~45 | ~110 | ~155 |
| 4 — `schema.prisma` partial unique index + generated migration | ~10 | 0 | ~10 |
| Collateral — `soft-delete-filters.test.js` fixups | 0 | ~40 | ~40 |
| **Total** | **~145** | **~380** | **~525** |

**Chained PRs recommended: Yes. 400-line budget risk: High. Decision needed before apply: Yes.**

The proposal estimated "near the 400-line budget" before the migration (ADR-8, confirmed after the proposal) and the Cycle 1 test fixups (ADR-14, discovered during this design) were known. Both are new. Recommended chain, `stacked-to-main`:

1. **Slice 1** — highest severity, introduces the barrier helper and the mock stubs slices 2-3 reuse. Carries the collateral fixups for the closure tests.
2. **Slice 2** — the three remaining closure transitions, reuses slice 1's harness.
3. **Slice 3** — payments, the only API-contract change (`INVALID_OPERATION` 400 → `NOT_PENDING` 409). Carries the collateral fixups for the payment tests.
4. **Slice 4** — migration + schema comment. Last, so the index lands over already-guarded code (Migration step 5).

## Open Questions

- [x] **`deleteGroup` ↔ `finalClosure` lock-order inversion** (see Lock Order Audit). **Resolved: accept and document.** Worst case is a `40P01` 500 with zero corruption; fixing `deleteGroup` is out of scope for this change.
- [x] **`INVALID_OPERATION` 400 → `NOT_PENDING` 409** (ADR-7). **Resolved: confirmed.** 409 is the correct status; grep-confirmed zero consumers of the old 400.
- [x] **Prisma drift from the partial index** (ADR-8/9). **Resolved: switched to Prisma's native `partialIndexes` preview feature** (installed version `^7.8.0` supports it since 7.4.0) instead of a hand-authored raw-SQL migration — no drift, no hand-review tax. Owner's own objection ("no creo que sea viable o muy profesional") was correct and had a real technical answer.
- [ ] **Delivery** — confirm the 4-slice `stacked-to-main` chain, or record `size:exception` for a single ~540-line PR. (To be resolved formally at `sdd-tasks`'s Review Workload Forecast, same process as Cycle 1.)

## Out of Scope (do not design, do not implement here)

- Frontend double-submit guards on accept/reject/closure buttons — owner-deferred
- Real-Postgres concurrency harness (testcontainers, test DB, CI wiring) — explicitly rejected in favour of mock + structural assertion (ADR-13)
- The general stale-precondition race class beyond the five confirmed scenarios (`requireZeroBalances`, PENDING counts) — ADR-6
- `P2002` → 409 translation (ADR-11)
- Restructuring `deleteGroup`'s lock order (flagged above, not designed)
- `permissions-and-process-cleanup` (Cycle 3) and `money-arithmetic-utility` (Cycle 4) items
- Void `static-group-closures` / `archive-groups` change folders — do not reconcile against them
