# Design: Money Correctness Fixes

## Technical Approach

Four independent, surgical fixes to money-handling paths. No schema change, no migration, no new runtime dependency, no new UI component.

Each fix is designed to **mirror an existing pattern already present in the codebase** rather than introduce a new one:

| Bug | Existing pattern mirrored | Location of the precedent |
|-----|---------------------------|---------------------------|
| 1 — soft-delete gaps | flat `deletedAt: null` sibling key in `where`; nested `where` inside `include`; separate soft-delete-as-404 guard block | `balance.service.js` L103-105, `group.service.js` L111-112, `expense.service.js` L677-679 |
| 2 — split rounding | "last participant absorbs the remainder" | `calculateEqualSplits` / `calculateCollectiveSplits` in `utils/splits.js` |
| 3 — `reportItem` participant check | not-found → type → authorization → state ordering | `unlockExpense` in `expense.service.js` L668-692 |
| 4 — DYNAMIC payment acceptance | `group.balanceMode !== 'STATIC' \|\| currentPeriod?.status === 'CLOSING'` mode flag | `GroupDetailPage.jsx` L532, L553, L720 |

The only genuinely new thing this change introduces is a **service-level test harness** (`vi.mock` of the Prisma client). The backend today has unit tests for `utils/` only — there is no seam to write a failing test for a Prisma `where` clause or for a service guard. Strict TDD is active, so that seam must be designed, not improvised (see ADR-1).

## Architecture Decisions

| # | Decision | Choice | Alternatives | Rationale |
|---|----------|--------|-------------|-----------|
| ADR-1 | Test seam for service-level fixes (Bugs 1 and 3) | One shared `vi.mock('../../lib/prisma.js')` harness; assert on the `where`/`include` argument passed to Prisma, and on behavior (throws / `upsert` not called) | (a) Integration tests against a real Postgres test DB; (b) no tests, rely on grep | The repo has zero service tests and zero DB test infra. A real-DB harness (provisioning, migrations, seed, teardown) is a change of its own and would dwarf the 400-line budget. Argument assertions are white-box but genuinely red-before / green-after and they pin the invariant permanently. |
| ADR-2 | Soft-delete guard shape in `where` | Flat sibling key `deletedAt: null`, placed after the domain filters | Prisma soft-delete client extension (global filter) | Explicitly out of scope per proposal. Mirrors `balance.service.js` `expenseWhere` exactly: `{ groupId, isLocked: true, deletedAt: null, periodId }`. |
| ADR-3 | Soft-delete guard shape in `include` / `_count` | Nested `where: { deletedAt: null }` as the **first** key of the relation object, before `include` / `orderBy`; filtered relation counts for `_count` | Separate follow-up queries per relation | `group.service.js` already does exactly this for `members: { where: { status: 'ACTIVE' }, include: {…} }`. Prisma 7.8 supports filtered relation counts, and the `_count` payload shape is unchanged so no frontend change is needed. |
| ADR-4 | Soft-delete check-and-throw in `acceptPayment` / `rejectPayment` | **Separate** `if (payment.deletedAt !== null) throw new AppError('PAYMENT_NOT_FOUND', 404, 'Payment not found')` block, immediately after the `!payment` block | The proposal's merged form `if (!payment \|\| payment.deletedAt)` | **Overrides the proposal.** The only existing soft-delete-as-404 guard in the codebase (`unlockExpense`, `expense.service.js` L673-679) uses two separate blocks with the identical code and message. Observable behavior is identical; the separate block matches precedent, stays independently greppable, and gets its own line coverage. |
| ADR-5 | Who absorbs the percentage-split remainder | **Last element in array order** (mirrors `calculateEqualSplits`) | (a) Largest-percentage participant absorbs; (b) largest-remainder / Hamilton apportionment | See "Remainder determinism" below. Flagged for user input. |
| ADR-6 | `computeSplits` after `participantIds` filtering | **Re-validate and reject** (`validateSplits` on the filtered set → `INVALID_SPLITS` 400) | Re-derive: rescale the filtered percentages to sum to 100 | `splits` and `participantIds` are two conflicting sources of truth. Re-deriving silently reinterprets how much each person owes — a money decision made by the server on the user's behalf, with no audit trail. Fail-closed surfaces the client bug. Matches the proposal's Scope wording ("Re-validate splits after `participantIds` filtering"). |
| ADR-7 | Arithmetic representation in `calculatePercentageSplits` | Keep float + `Math.round(x * 100) / 100`, same as the sibling functions | Integer-cent arithmetic | Mirrors the existing functions, which is itself the point of this change. The final `Math.round(… * 100) / 100` absorbs accumulated float noise (≈1e-15 per term) with ~12 orders of magnitude of headroom below the 0.005 rounding threshold. Centralizing on integer cents is the already-scoped `money-arithmetic-utility` change — do not preempt it here. |
| ADR-8 | Bug 4 testable seam | Extract the gating condition into a pure helper `apps/frontend/src/utils/payments.js`, unit-test it, and consume it in `GroupDetailPage.jsx` | (a) Component test of `GroupDetailPage` with `@testing-library/react`; (b) no frontend test | The frontend has `jsdom` configured but **no** `@testing-library/react` / `jest-dom`. Option (a) means new devDeps plus mocking router + i18next + three services to assert one boolean — fragile and expensive. A pure helper matches the repo's existing `utils/ + __tests__/` convention and keeps the page diff to two expression swaps. |
| ADR-9 | Bug 4 gate replacement scope | Introduce a **new** `paymentAcceptanceActive` flag used only at L594 (badge) and L608 (accept/reject). `isClosing` stays untouched everywhere else, especially the delete gate at L631 | Globally replace `isClosing` with the new flag | L631 is `canDeletePayment && !isClosing`. Swapping the flag there would **remove** the delete button for every DYNAMIC payment — a silent capability regression. The new flag must be additive. |
| ADR-10 | `pendingPayments` / `acceptedPayments` derivation | Derive unconditionally (drop the `isClosing ? … : []` ternary) | Keep conditional and add a second DYNAMIC-only derivation | Verified: every consumer is already independently gated — `readyForClosure` (L454) carries its own `isClosing &&`, and L897/902/905 live inside the `currentPeriod.status === 'CLOSING'` block at L892. Unconditional derivation is therefore behavior-preserving for STATIC and correct for DYNAMIC. |
| ADR-11 | Delivery shape | **Chain of 4 stacked-to-main PRs**, ordered 2 → 1 → 3 → 4 | Single PR with `size:exception` | The proposal estimated a single PR under budget, before the missing service-test harness was discovered. With tests the estimate is ~390-400 lines — at the ceiling. See "Review Budget" below. Flagged for user confirmation (`ask-on-risk`). |

### Remainder determinism (ADR-5, needs user confirmation)

The chosen rule — *last element of the `splits` array absorbs the difference* — is deterministic given the input, but the input order comes from the client payload, which is derived from group member order. A group that repeatedly files the same percentage split therefore has the **same member absorb the rounding difference every time**.

Bounded impact: the absorbed delta is at most `0.005 × n` (one cent per participant in the pathological case, typically exactly one cent), and its sign depends on whether the naive per-share rounding over- or under-shoots, so across varied percentages it broadly cancels. A group with one fixed percentage profile accumulates monotonically at ≤ 1 cent per expense.

| Option | Pro | Con |
|--------|-----|-----|
| **A. Last in array order (recommended)** | Identical rule across all three split functions; two JSDoc blocks already document "last participant absorbs the remainder"; smallest diff; no existing test expectations change | Systematic ≤1¢/expense bias toward whoever is last in member order |
| B. Largest percentage absorbs | Smallest *relative* distortion; no fixed-position bias | Three sibling functions would then follow two different rules (`calculateEqualSplits` cannot express it — all shares are equal); the biggest-share member still eats it every time |
| C. Largest-remainder (Hamilton) | Textbook-correct apportionment; spreads multi-cent remainders across several people | Diverges from both existing functions; to be coherent it must be applied to all three at once, which changes `calculateEqualSplits`'s existing test expectations and expands scope |

**Recommendation: A for this change; C as the target of the already-scoped `money-arithmetic-utility` change**, where all three functions can move to one shared apportionment implementation in a single coherent step. If the user judges the fixed-position bias unacceptable *now*, the correct response is C applied to all three functions — not B — and that expands this change's scope. **Escalated rather than silently decided.**

## Data Flow

### Bug 1 — where soft-deleted rows currently leak

```
  payment.deletedAt != null
        │
        ├─→ closure.requireZeroBalances  (L78 ACCEPTED)      ──→ phantom settlement
        ├─→ closure.startClosure         (L157 PENDING)      ──→ closure blocked forever
        ├─→ closure.completeClosure      (L218 PENDING)      ──→ closure blocked forever
        ├─→ closure.partialClosure       (L278 PENDING)      ──→ closure blocked forever
        ├─→ closure.finalClosure         (L349 PENDING)      ──→ closure blocked forever
        ├─→ balance.paymentWhere         (L119 ACCEPTED)     ──→ wrong net balance
        ├─→ period.listPeriods           (L51 _count, L64)   ──→ wrong counts / settlementComplete
        ├─→ period.getPeriodDetails      (L101 _count)       ──→ wrong counts
        ├─→ period.getPeriodBalances     (L165 ACCEPTED)     ──→ wrong period balance
        ├─→ period.getPeriodPayments     (L390)              ──→ deleted rows rendered
        ├─→ group.getGroupById           (L134 include)      ──→ deleted rows rendered
        └─→ payment.acceptPayment/rejectPayment (L268/L323)  ──→ a deleted payment can be ACCEPTED

  expense.deletedAt != null
        ├─→ period.listPeriods / getPeriodDetails (_count)   ──→ wrong counts
        ├─→ period.getPeriodExpenses     (L340)              ──→ deleted rows rendered
        └─→ group.getGroupById           (L119 include)      ──→ deleted rows rendered
```

Already correct, do not touch: `balance.expenseWhere` (L103-105), `closure.requireZeroBalances` expenses (L74), `closure.startClosure` expense count (L171), `period.getPeriodBalances` expenses (L156), `payment.listPayments` (L175).

### Bug 2 — split arithmetic

```
  createExpense(PERCENTAGE)
        │
        ▼
  validateSplits(total, 'PERCENTAGE', splits)        ← unchanged: full input must sum to 100
        │
        ▼
  filter splits → participantIds                     ← existing
        │
        ▼
  all filtered userIds are ACTIVE members?           ← existing (INVALID_PARTICIPANTS)
        │
        ▼
  validateSplits(total, 'PERCENTAGE', filteredSplits) ← NEW (ADR-6): INVALID_SPLITS 400
        │
        ▼
  calculatePercentageSplits(total, filteredSplits)
        │
        ├─ per-share rounded amount for i < n-1
        └─ amounts[n-1] = round(total - sum(amounts[0..n-2]))   ← NEW (ADR-5)
        │
        ▼
  sum(amounts) === total, exactly
```

Blast radius note: `updateExpense` calls `computeSplits` **without** `participantIds` (L537-542), so the ADR-6 branch only runs on create. The `calculatePercentageSplits` fix applies to both.

### Bug 4 — payment acceptance gating

```
                          balanceMode === 'STATIC'          balanceMode === 'DYNAMIC'
                        ┌──────────────────────────┐      ┌──────────────────────────┐
  period status         │ OPEN │ CLOSING │ CLOSED  │      │   (no period at all)     │
  ────────────────────  ├──────┼─────────┼─────────┤      ├──────────────────────────┤
  payments list mounted │  no  │   yes   │   no    │      │   yes (L1358, already)   │
  status badge          │  no  │   yes   │   no    │      │   no  → YES              │
  accept / reject       │  no  │   yes   │   no    │      │   no  → YES              │
  delete                │  —   │   no    │   —     │      │   yes (unchanged)        │
                        └──────────────────────────┘      └──────────────────────────┘
                              ↑ all unchanged                      ↑ the whole fix
```

`paymentAcceptanceActive === isClosing` whenever `balanceMode === 'STATIC'`, so STATIC behavior is provably bit-identical in every period state.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/backend/src/services/closure.service.js` | Modify | `deletedAt: null` in L79 (`status: 'ACCEPTED'`) and in the four PENDING counts (L158, L219-222, L279-282, L350-353) |
| `apps/backend/src/services/balance.service.js` | Modify | `deletedAt: null` in both `paymentWhere` branches (L119-121) |
| `apps/backend/src/services/period.service.js` | Modify | Filtered `_count` at L51-53 and L101-103; `deletedAt: null` in L62 (REJECTED), L65 (PENDING), L166 (ACCEPTED), L341 (`getPeriodExpenses`), L391 (`getPeriodPayments`) |
| `apps/backend/src/services/group.service.js` | Modify | `where: { deletedAt: null }` as first key of the `expenses` (L119) and `payments` (L134) includes |
| `apps/backend/src/services/payment.service.js` | Modify | Soft-delete guard block in `acceptPayment` (after L280) and `rejectPayment` (after L335), per ADR-4 |
| `apps/backend/src/utils/splits.js` | Modify | `calculatePercentageSplits`: empty-guard + remainder absorption |
| `apps/frontend/src/utils/splits.js` | Modify | Byte-identical change to the same function |
| `apps/backend/src/services/expense.service.js` | Modify | `computeSplits`: re-validate the filtered PERCENTAGE set (ADR-6) |
| `apps/backend/src/services/item-reporting.service.js` | Modify | `NOT_PARTICIPANT` guard in `reportItem`, between the `splitType` and `isLocked` checks |
| `apps/frontend/src/utils/payments.js` | **Create** | `isPaymentAcceptanceActive(balanceMode, periodStatus)` — the pure gating helper (ADR-8) |
| `apps/frontend/src/pages/GroupDetailPage.jsx` | Modify | Import the helper; derive `paymentAcceptanceActive`; unconditional `pendingPayments` / `acceptedPayments` (ADR-10); swap the gate at L594 and L608 only (ADR-9) |
| `apps/backend/src/utils/__tests__/splits.test.js` | Modify | Replace the false-negative `totalAmount = 100` case with a `totalAmount = 10` reproducer; add sum-exactness assertions |
| `apps/frontend/src/utils/__tests__/splits.test.js` | Modify | Same cases, mirrored, to pin backend/frontend parity |
| `apps/frontend/src/utils/__tests__/payments.test.js` | **Create** | Truth table for `isPaymentAcceptanceActive` |
| `apps/backend/src/services/__tests__/soft-delete-filters.test.js` | **Create** | Shared Prisma mock; asserts `deletedAt: null` reaches every call site in Bug 1, plus the two accept/reject guards |
| `apps/backend/src/services/__tests__/item-reporting.service.test.js` | **Create** | `reportItem` rejects a non-participant and does not `upsert` |
| `apps/backend/src/services/__tests__/expense.service.test.js` | **Create** | `computeSplits` rejects a participant-filtered set that no longer sums to 100 |
| `apps/frontend/package.json` | Modify (enabler, flagged) | `"test": "vitest"` → `"vitest run"`. See "Process enabler" below |

Explicitly **not** touched: `item-reporting.service.js` `deletedAt` gaps, `updateItem`'s missing participant check, concurrency guards, frontend/backend permission drift elsewhere, Render CI/deploy, any centralized money utility. All out of scope per the proposal.

## Interfaces / Contracts

### `calculatePercentageSplits` (both copies, identical)

```js
export function calculatePercentageSplits(totalAmount, splits) {
  if (!splits || splits.length === 0) {
    return [];
  }

  const result = splits.map((s) => ({
    userId: s.userId,
    amount: Math.round((totalAmount * s.percentage / 100) * 100) / 100,
    percentage: s.percentage,
  }));

  // The last participant absorbs the rounding remainder so the amounts
  // always sum exactly to `totalAmount` — same rule as calculateEqualSplits.
  const distributed = result
    .slice(0, -1)
    .reduce((sum, s) => sum + s.amount, 0);
  result[result.length - 1].amount =
    Math.round((totalAmount - distributed) * 100) / 100;

  return result;
}
```

Invariant: `sum(result.map(r => r.amount)) === round2(totalAmount)` for any input where percentages sum to 100 (±0.01).
Note: the existing `n === 1` and `totalAmount === 0` cases stay correct — with one element `distributed === 0` so the single amount becomes `round2(totalAmount)`.

### `computeSplits` — PERCENTAGE branch delta (`expense.service.js`)

```js
      for (const split of filteredSplits) {
        if (!activeMemberSet.has(split.userId)) {
          throw new AppError('INVALID_PARTICIPANTS', 400, `User ${split.userId} is not an active group member`);
        }
      }

      // The filtered subset must still account for 100% of the expense —
      // otherwise part of the amount would silently never be owed by anyone.
      validateSplits(totalAmount, 'PERCENTAGE', filteredSplits);
    }
```

Reusing `validateSplits` keeps the 0.01 epsilon in exactly one place. The thrown message stays the generic `'Split percentages must sum to 100'`; acceptable, since the code (`INVALID_SPLITS`) and status (400) are what the client branches on.

### `reportItem` guard (`item-reporting.service.js`)

Placement — mirrors `unlockExpense`'s **not-found → type → authorization → state** ordering:

```js
  if (expense.splitType !== 'COLLECTIVE') {
    throw new AppError('INVALID_SPLIT_TYPE', 400, 'Item reporting is only for COLLECTIVE expenses');
  }

  // Only declared participants may report an item. A non-participant's item
  // would count toward COMPLETED but be excluded from the splits, erasing
  // its amount from the ledger.
  if (!expense.participantIds.includes(userId)) {
    throw new AppError('NOT_PARTICIPANT', 403, 'You are not a participant in this expense');
  }

  if (expense.isLocked) {
    throw new AppError('EXPENSE_LOCKED', 409, 'Expense is locked');
  }
```

- **Zero extra round-trips.** `Expense.participantIds` is a Postgres scalar array (`participantIds String[] @default([])`, `schema.prisma` L196), not a relation, and the full expense row is already fetched at L26-28. The check is pure in-memory — no `in`-style query, no join, no `include`.
- **Empty array = nobody may report.** `createExpense` already rejects a COLLECTIVE expense without `participantIds` (L190-191), so `[]` can only mean legacy or corrupt data — and `calculateCollectiveSplits` returns `[]` for it anyway, so reporting against it would erase money regardless. `[].includes(userId)` is `false`, which is the desired fail-closed outcome; no special case needed.
- **Deliberate ordering delta:** today a non-participant hitting a *locked* expense gets `409 EXPENSE_LOCKED`; after this change they get `403 NOT_PARTICIPANT`. Both reject, no money path changes, and authorization-before-state matches `unlockExpense`. A test must pin which error wins.

### `isPaymentAcceptanceActive` (new, `apps/frontend/src/utils/payments.js`)

```js
/**
 * Payment acceptance (status badge + creditor accept/reject) is live:
 *   - for DYNAMIC groups: always — they have no periods and no closure
 *   - for STATIC groups: only while the current period is CLOSING
 *
 * @param {'STATIC'|'DYNAMIC'|undefined} balanceMode
 * @param {'OPEN'|'CLOSING'|'CLOSED'|'FINAL'|undefined} periodStatus
 * @returns {boolean}
 */
export function isPaymentAcceptanceActive(balanceMode, periodStatus) {
  if (balanceMode === 'STATIC') {
    return periodStatus === 'CLOSING';
  }
  return true;
}
```

### `GroupDetailPage.jsx` — exact edits

```js
// L449-452 — isClosing stays; derivations become unconditional (ADR-10)
const isClosing = currentPeriod?.status === 'CLOSING';
const paymentAcceptanceActive = isPaymentAcceptanceActive(group.balanceMode, currentPeriod?.status);
const pendingPayments = payments.filter((p) => p.status === 'PENDING');
const acceptedPayments = payments.filter((p) => p.status === 'ACCEPTED');
// `rejectedPayments` (L451) has no consumers anywhere in the file — delete it (optional, 1 line).

// L594 — status badge
{paymentAcceptanceActive && (

// L608 — accept / reject controls
{paymentAcceptanceActive && isReceiver && isPending && (

// L631 — delete control: UNCHANGED (ADR-9)
{canDeletePayment && !isClosing && (
```

Verified preconditions, not assumptions:
- `renderPayments` is already mounted for DYNAMIC at L1358 (`{group.balanceMode !== 'STATIC' && renderPayments('mt-12 mb-12')}`), so **no new section and no new component**.
- `listPayments` returns PENDING payments for DYNAMIC groups (`payment.service.js` L175: `where` is `{ groupId, deletedAt: null }` only, no status filter).
- `handleAcceptPayment` / `handleRejectPayment` (L311-330) are already mode-agnostic and call `loadGroup()` after success, so balances refresh with no further wiring.
- Backend `acceptPayment` / `rejectPayment` have no `balanceMode` or period checks at all — **zero backend change for Bug 4**.
- i18n keys `payment.pending` / `payment.accepted` / `payment.rejected` already exist in both `en.json` and `es.json` — **zero locale change**.
- Cosmetic consequence, accepted: a group owner who is also the receiver of a PENDING DYNAMIC payment sees three controls (accept, reject, delete). Suppressing delete there would remove a real capability; clutter is the lesser cost.

## Testing Strategy

Strict TDD is active. Command: `pnpm --filter backend test && pnpm --filter frontend test -- --run`.

| Bug | Test file | Required failing test (red first) |
|-----|-----------|-----------------------------------|
| 2 | `apps/backend/src/utils/__tests__/splits.test.js` | **Replace** the existing `'handles fractional percentages'` case (L67-77). It uses `totalAmount = 100`, which divides evenly into 33.33/33.33/33.34 and therefore **passes today despite the bug** — a false negative. New case: `calculatePercentageSplits(10, [33.33, 33.33, 33.34])` must yield `3.33 / 3.33 / 3.34` summing to exactly `10` (today: `9.99`). Add an over-shoot case (e.g. `10` at `16.67 / 16.67 / 66.66` → naive `10.01`) and a `round2(sum) === round2(total)` property assertion. |
| 2 | `apps/frontend/src/utils/__tests__/splits.test.js` | Byte-identical cases, to pin backend/frontend parity (proposal risk: "the two copies drift apart"). |
| 2 | `apps/backend/src/services/__tests__/expense.service.test.js` | `createExpense` with PERCENTAGE splits summing to 100 across 4 members but `participantIds` listing 3 → throws `AppError` `INVALID_SPLITS` 400, and no expense/splits are written. |
| 1 | `apps/backend/src/services/__tests__/soft-delete-filters.test.js` | Per call site in the Bug 1 flow table: assert the `where` / `include` / `_count` argument handed to the mocked Prisma client contains `deletedAt: null`. Plus two behavior tests: `acceptPayment` and `rejectPayment` on a payment with `deletedAt` set throw `PAYMENT_NOT_FOUND` 404 and never call `payment.update`. |
| 3 | `apps/backend/src/services/__tests__/item-reporting.service.test.js` | `reportItem` on a COLLECTIVE expense whose `participantIds` excludes the caller → throws `NOT_PARTICIPANT` 403 and `prisma.expenseItem.upsert` is **not** called. Second case: the same expense also `isLocked` → `NOT_PARTICIPANT` still wins (pins the ordering delta). Third case: a listed participant still succeeds (no regression). |
| 4 | `apps/frontend/src/utils/__tests__/payments.test.js` | Truth table: `('DYNAMIC', undefined) → true`; `('DYNAMIC', 'OPEN') → true`; `('STATIC', 'CLOSING') → true`; `('STATIC', 'OPEN'/'CLOSED'/'FINAL'/undefined) → false`; `(undefined, undefined) → true` (treat a missing mode as DYNAMIC, matching the page's existing `!== 'STATIC'` idiom). |

Prisma mock shape for the service harness (ADR-1):

```js
vi.mock('../../lib/prisma.js', () => ({
  default: {
    payment: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    expense: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    // …group, groupMember, period, expenseItem as each test needs
  },
}));
```

Deliberately **not** covered: no component test for `GroupDetailPage` (ADR-8), no real-DB integration test (ADR-1). Both are infrastructure changes, not fixes.

### Process enabler (flagged)

`apps/frontend/package.json` declares `"test": "vitest"` — **watch mode**. The backend declares `"vitest run"`. The change mandates `pnpm --filter backend test && pnpm --filter frontend test`, which as written hangs forever on the frontend. Two ways out:

1. Change the script to `"vitest run"` (1 line, matches the backend, fixes it for everyone). Strictly this is "process cleanup", which the proposal routed to `permissions-and-process-cleanup`.
2. Leave it and always invoke `pnpm --filter frontend test -- --run`.

**Recommendation: option 1**, because the mandated Strict TDD command is otherwise broken. **Needs user confirmation** since it crosses the declared scope boundary.

## Review Budget / Delivery

Estimated changed lines:

| Slice | Production | Tests | Total |
|-------|-----------:|------:|------:|
| Bug 2 — split arithmetic | ~30 | ~70 | ~100 |
| Bug 1 — soft-delete filters | ~20 | ~150 | ~170 |
| Bug 3 — participant guard | ~8 | ~70 | ~78 |
| Bug 4 — DYNAMIC acceptance | ~25 | ~35 | ~60 |
| **Total** | **~83** | **~325** | **~408** |

**Chained PRs recommended: Yes. 400-line budget risk: High. Decision needed before apply: Yes.**

The proposal estimated a single PR comfortably under budget. That estimate predated the discovery that **no service-level test harness exists**; the test cost (~325 lines, ~4× the production diff) is what pushes the change to the ceiling. Delivery strategy is `ask-on-risk`, so this requires an explicit go-ahead.

Recommended chain (`stacked-to-main`, each slice independently revertible per the proposal's rollback plan):

1. **Bug 2** — pure functions, both `splits.js` copies in one commit, zero infrastructure. Highest money impact per line.
2. **Bug 1** — introduces the shared Prisma mock harness that slice 3 reuses.
3. **Bug 3** — participant guard, reuses the harness from slice 2.
4. **Bug 4** — frontend only, fully independent of 1-3.

If the user prefers a single PR, it needs `size:exception` recorded before apply.

## Migration / Rollout

1. **No schema change, no migration, no data mutation.** Every fix is pure code.
2. **No backfill.** Pre-production, zero real users. Existing PENDING DYNAMIC payments simply become acceptable once slice 4 ships; already-written `ExpenseSplit` rows keep whatever amounts they were computed with at creation time.
3. **Rollback** is a per-slice `git revert`. Reverting slice 2 restores the cent-losing math for *new* expenses only. Reverting slice 4 returns DYNAMIC payments to permanently-PENDING, while any `ACCEPTED` rows created in the meantime stay valid and keep counting in balances.
4. **Verification after apply**: `pnpm --filter backend test && pnpm --filter frontend test -- --run && pnpm -r run build`, plus a grep sweep over the five Bug 1 files confirming every `prisma.payment.` / `prisma.expense.` / `_count` call site in the flow table carries `deletedAt: null`.

## Out of Scope (do not design, do not implement here)

- Concurrency / race guards in the closure and payment flows → `closure-concurrency-guards`
- Frontend/backend permission drift, `item-reporting.service.js` `deletedAt` gaps, `updateItem`'s missing participant check → `permissions-and-process-cleanup`
- Centralized money-arithmetic utility (and with it, largest-remainder apportionment across all three split functions) → `money-arithmetic-utility`
- Prisma soft-delete client extension / global filter
- Render CI and deploy/migration gating
- Auto-accept semantics; DYNAMIC keeps explicit creditor acceptance
- Stale `static-group-closures` / `archive-groups` change folders — declared void by the owner; do not reconcile against them
