# Proposal: Money Correctness Fixes

## Intent

Four confirmed defects silently lose or miscalculate real money. (1) Soft-deleted payments/expenses still count in closures, balances, periods and group detail — a deleted PENDING payment blocks closure forever with no visible reason, and can still be accepted/rejected. (2) `calculatePercentageSplits` rounds every share independently, so $10 at 33.33/33.33/33.34 splits to $9.99 — a cent nobody owes; `computeSplits` also validates before filtering to `participantIds`, so the filtered subset can miss the total. (3) `reportItem` never checks participation: a non-participant's item counts toward COMPLETED but is excluded from splits, erasing its amount from the ledger. (4) DYNAMIC-group payments can never be accepted in the UI, so they stay PENDING forever and are invisible to every balance. Scope is exactly these four.

## Scope

### In Scope
- `deletedAt: null` filters in closure, balance, period, group and payment reads/counts/includes
- Soft-delete guard in `acceptPayment` / `rejectPayment`
- Last-participant-absorbs-remainder in `calculatePercentageSplits` (backend **and** frontend copies, kept in sync)
- Re-validate splits after `participantIds` filtering in `computeSplits`
- Participant check in `reportItem` → 403 `NOT_PARTICIPANT`
- Mode-aware payment acceptance UI: pending-payment visibility + accept/reject for DYNAMIC groups
- Failing-test-first coverage per fix (Strict TDD, `pnpm --filter backend test && pnpm --filter frontend test`)

### Out of Scope
- Concurrency/race guards in closure and payment flows → `closure-concurrency-guards`
- Frontend/backend permission drift, `item-reporting.service.js` `deletedAt` gaps, deploy/CI migration gating → `permissions-and-process-cleanup`
- Centralized money-arithmetic utility → `money-arithmetic-utility`
- Prisma soft-delete extension (global filter); this change uses targeted filters only
- Backfill/migration for existing PENDING payments (pre-production, zero real users)
- Auto-accept semantics; DYNAMIC keeps explicit creditor acceptance

## Capabilities

### New Capabilities
- `payment-acceptance`: creditor accept/reject lifecycle, valid for DYNAMIC and STATIC alike, independent of any period state (no live spec exists today)

### Modified Capabilities
- `payment-recording`: soft-deleted payments MUST be excluded from all reads, counts and includes; accept/reject MUST reject a soft-deleted payment
- `balance-calculation`: balance, closure and period queries MUST ignore soft-deleted payments and expenses
- `expense-management`: percentage splits MUST sum exactly to the total; splits MUST be re-validated after participant filtering; item reporting MUST be restricted to declared participants
- `group-management`: group detail MUST NOT return soft-deleted expenses or payments

## Approach

1. **Soft-delete filters (Option A, targeted)**: add `deletedAt: null` to each affected `where`; inside `include`/`_count` use `payments: { where: { deletedAt: null } }`. In `acceptPayment`/`rejectPayment`, guard `if (!payment || payment.deletedAt)` right after `findUnique`.
2. **Split arithmetic**: mirror `calculateEqualSplits` — distribute rounded shares, last participant absorbs the remainder. Apply identically in both `splits.js` copies. In `computeSplits`, filter to `participantIds` first, then validate/derive.
3. **Participation guard**: reject non-participants in `reportItem` before upsert, unconditionally, no delegation feature.
4. **DYNAMIC acceptance**: `renderPayments` is already mounted for DYNAMIC (`GroupDetailPage.jsx` L1358), but the status badge (L594) and accept/reject block (L608) are gated on `isClosing`. Replace that gate with a mode-aware flag (`isClosing || balanceMode !== 'STATIC'`) and surface a receiver-scoped pending section/badge. Backend endpoints are already mode-agnostic — no backend change.
5. **Error convention**: `throw new AppError(code, status, message)` from `src/utils/errors.js` (the project's actual convention; `NOT_PARTICIPANT` and `PAYMENT_NOT_FOUND` codes already exist).
6. **Delivery risk (ask-on-risk)**: money-affecting logic → medium risk, explicit go-ahead required before PR. Four independent fixes, ~12 filter lines + 2 util changes + 1 guard + 1 UI regate; expected under the 400-line budget as a single PR. If Bug 4's UI grows beyond regating, split as `stacked-to-main` chain: #1 soft-delete filters, #2 split arithmetic, #3 participation guard, #4 DYNAMIC acceptance UI.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/backend/src/services/closure.service.js` | Modified | `deletedAt: null` in L78 ACCEPTED query and L157/218/278/349 PENDING counts |
| `apps/backend/src/services/balance.service.js` | Modified | `deletedAt: null` in `paymentWhere` (L119) |
| `apps/backend/src/services/period.service.js` | Modified | `deletedAt: null` in L52/61-64/102/165/340/390 counts, balances, expense and payment queries (`getPeriodExpenses` has none today) |
| `apps/backend/src/services/group.service.js` | Modified | `where: { deletedAt: null }` inside expenses (L119) and payments (L134) includes |
| `apps/backend/src/services/payment.service.js` | Modified | Soft-delete guard in `acceptPayment` (L268) and `rejectPayment` (L323) |
| `apps/backend/src/utils/splits.js` | Modified | `calculatePercentageSplits` remainder absorption |
| `apps/frontend/src/utils/splits.js` | Modified | Same fix, byte-identical behavior for the live split preview |
| `apps/backend/src/services/expense.service.js` | Modified | `computeSplits` re-validation after `participantIds` filtering |
| `apps/backend/src/services/item-reporting.service.js` | Modified | Participant guard in `reportItem` |
| `apps/frontend/src/pages/GroupDetailPage.jsx` | Modified | Mode-aware payment status/accept/reject gating + pending section for DYNAMIC |
| `apps/backend/src/utils/__tests__/splits.test.js` | Modified | Replace the false-negative 33.33/33.33/33.34 @ 100 case with a `totalAmount = 10` reproducer |
| `apps/frontend/src/**/__tests__/` | New | Split-preview and pending-acceptance UI tests |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| A missed `deletedAt` call site keeps a stale-money path alive | Med | Enumerate every `payment.`/`expense.` query in the five files during spec; grep-verify after apply |
| Backend and frontend `splits.js` drift apart | Med | Change both in the same commit; identical test cases in both suites |
| Existing split test passes despite the bug (`totalAmount = 100` divides evenly) | High | Red test with `totalAmount = 10` (9.99 today) is required before the fix |
| Bug 4 UI work exceeds the 400-line review budget | Low | Reuse mounted `renderPayments`; if it grows, split into a `stacked-to-main` chain |
| Making DYNAMIC payments acceptable changes perceived balances once accepted | Med | Pre-production, no real users; no backfill — forward-fix only |
| Brief assumed `Object.assign(new Error(...))`; project actually uses `AppError` | High | Convention corrected here; specs and apply MUST use `AppError` |
| Stale `static-group-closures` / `archive-groups` change folders imply in-flight work | Med | Declared void by the owner; do not reconcile, merge or verify against them |

## Rollback Plan

1. Each fix is an isolated commit: revert individually without touching the others.
2. No schema, no migration, no data mutation — revert is pure code, zero data risk.
3. Reverting the split fix restores the cent-losing math but leaves already-created `ExpenseSplit` rows untouched (they were computed at creation time).
4. Reverting the DYNAMIC acceptance UI returns those payments to permanently-PENDING; `ACCEPTED` rows created meanwhile stay valid and keep counting in balances.

## Dependencies

- `AppError` + codes `NOT_PARTICIPANT`, `PAYMENT_NOT_FOUND`, `EXPENSE_NOT_FOUND` in `apps/backend/src/utils/errors.js` (already present)
- Existing `acceptPayment` / `rejectPayment` endpoints (already mode-agnostic)
- Vitest in both apps; Strict TDD active

## Success Criteria

- [ ] A soft-deleted PENDING payment no longer blocks `startClosure`, `completeClosure`, `partialClosure` or `finalClosure`
- [ ] A soft-deleted payment is excluded from balances, period queries, period expenses and group detail
- [ ] `acceptPayment` and `rejectPayment` reject a soft-deleted payment with `PAYMENT_NOT_FOUND`
- [ ] Soft-deleted expenses no longer appear in group detail or `getPeriodExpenses`
- [ ] `calculatePercentageSplits` sums exactly to the total; $10 at 33.33/33.33/33.34 yields 3.33/3.33/3.34
- [ ] Backend and frontend `splits.js` produce identical amounts for the same inputs
- [ ] `computeSplits` rejects (or re-derives) a participant-filtered split set that does not sum to the total
- [ ] `reportItem` returns 403 `NOT_PARTICIPANT` for a non-participant; expense status and splits stay consistent
- [ ] A DYNAMIC-group payment can be accepted by its receiver and then appears in balances
- [ ] A receiver sees pending payments in a DYNAMIC group with no period or closure involved
- [ ] One failing test preceded every fix; `pnpm --filter backend test && pnpm --filter frontend test` passes
- [ ] `pnpm -r run build` passes
