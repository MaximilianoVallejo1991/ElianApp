# Tasks: Money Correctness Fixes

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines (single PR) | ~500 (99 prod + ~400 tests) |
| 400-line budget risk | High (single PR) / Low per chained PR |
| Chained PRs recommended | Yes |
| Suggested split | PR1 ~90 → PR2 ~195 → PR3 ~145 → PR4 ~70 |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Correction to design's suggested order

Design proposed `Bug2 → Bug1 → Bug3 → Bug4`, calling Bug 2 "zero infrastructure." That's only true for the pure `calculatePercentageSplits` half. The other Bug-2 fix — `computeSplits` re-validation (ADR-6) — is private, reachable only through `createExpense`, and needs the same `vi.mock('../../lib/prisma.js')` harness as Bug 1/Bug 3 (mocks `group`, `groupMember`×2, `period`). Splitting Bug 2 in two and moving its service half after the harness exists removes a false "zero infra" dependency.

### Suggested Work Units

| Unit | Goal | PR | Lines | Depends on |
|------|------|-----|------:|------------|
| 1 | Split-arithmetic fix, both `splits.js` copies (pure, Bug 2a) | PR 1 | ~90 | none |
| 2 | Soft-delete filters + shared Prisma mock harness (Bug 1) | PR 2 | ~195 | none |
| 3 | `computeSplits` re-validation + `reportItem` guard (Bug 2b + Bug 3) | PR 3 | ~145 | PR 2 (harness) |
| 4 | DYNAMIC payment-acceptance UI (Bug 4) | PR 4 | ~70 | none |

## Phase 1: Split Arithmetic — PR 1 `[backend][frontend]`

- [x] 1.1 [RED] `apps/backend/src/utils/__tests__/splits.test.js`: replace the `totalAmount=100` fractional case with `calculatePercentageSplits(10,[33.33,33.33,33.34])→[3.33,3.33,3.34]`, add an over-shoot case, add a sum-exactness assertion; confirm it fails
- [x] 1.2 [GREEN] `apps/backend/src/utils/splits.js`: add empty-guard + last-element-absorbs-remainder to `calculatePercentageSplits` (mirrors `calculateEqualSplits`)
- [x] 1.3 [RED] Mirror 1.1's cases in `apps/frontend/src/utils/__tests__/splits.test.js`; confirm failure
- [x] 1.4 [GREEN] Apply the byte-identical fix to `apps/frontend/src/utils/splits.js`; confirm backend/frontend parity

**Addendum (PR 1, post-merge-review fix)** — fresh-context review of PR 1's diff found that `calculatePercentageSplits` now assumes its input `splits` sums to 100%, but `expense.service.js`'s `computeSplits` can call it with a `participantIds`-filtered subset that doesn't (e.g. a single filtered participant at 33.34% would get billed `amount: 100`). Added a defensive guard directly in both `calculatePercentageSplits` copies — throws `AppError('INVALID_SPLITS', 400, 'Split percentages must sum to 100')` (backend) / `Error('Split percentages must sum to 100')` (frontend, no `AppError` equivalent exists there) when `Math.abs(sum(percentage) - 100) > 0.01`. The proper service-layer re-validation of the filtered subset (ADR-6, PR 3 task 3.2) is unchanged and still required — this is a defense-in-depth guard on the pure function, not a replacement for it.

- [x] 1.5 [RED→GREEN] `apps/backend/src/utils/splits.js` + `apps/frontend/src/utils/splits.js`: add percentage-sum guard to `calculatePercentageSplits` (throws on non-100% subsets); regression tests added to both `splits.test.js` files for the exact filtered-subset scenario

## Phase 2: Soft-Delete Filters + Prisma Mock Harness — PR 2 `[backend]`

- [ ] 2.1 [infra] Create `apps/backend/src/services/__tests__/soft-delete-filters.test.js` skeleton: `vi.mock` of `../../lib/prisma.js` (payment/expense mocks), `beforeEach(vi.clearAllMocks)` — no assertions yet
- [ ] 2.2 [RED] Assert `deletedAt: null` reaches every Bug-1 call site (closure.service.js L78/157/218/278/349; balance.service.js L119-121; period.service.js L51-65/101-103/165/340/390; group.service.js L119/134); add 2 cases: `acceptPayment`/`rejectPayment` on a soft-deleted payment throw `PAYMENT_NOT_FOUND` and never call `update`
- [ ] 2.3 [GREEN] `closure.service.js`: add `deletedAt: null` to L78 ACCEPTED query and the 4 PENDING counts
- [ ] 2.4 [GREEN] `balance.service.js`: add `deletedAt: null` to both `paymentWhere` branches (L119-121)
- [ ] 2.5 [GREEN] `period.service.js`: filtered `_count` (L51-53, L101-103); `deletedAt: null` at L62/65/165/340/390
- [ ] 2.6 [GREEN] `group.service.js`: `where: { deletedAt: null }` as first key of `expenses` (L119) and `payments` (L134) includes
- [ ] 2.7 [GREEN] `payment.service.js` `acceptPayment`: separate `if (payment.deletedAt !== null) throw AppError('PAYMENT_NOT_FOUND', 404, …)` block after the `!payment` check (ADR-4)
- [ ] 2.8 [GREEN] Same guard block in `rejectPayment`; confirm all Phase 2 assertions pass

## Phase 3: Service Guards Reusing the Harness — PR 3 `[backend]`

- [ ] 3.1 [RED] Create `apps/backend/src/services/__tests__/expense.service.test.js` (reuse 2.1's harness + DYNAMIC-group fixture): `createExpense` with 4-member PERCENTAGE splits but `participantIds` of 3 → throws `INVALID_SPLITS` 400, no `expense.create`
- [ ] 3.2 [GREEN] `expense.service.js` `computeSplits`: call `validateSplits(totalAmount, 'PERCENTAGE', filteredSplits)` on the filtered set after the active-member loop (ADR-6)
- [ ] 3.3 [RED] Create `apps/backend/src/services/__tests__/item-reporting.service.test.js`: non-participant → `NOT_PARTICIPANT` 403, upsert never called; same expense also `isLocked` → `NOT_PARTICIPANT` still wins; listed participant still succeeds
- [ ] 3.4 [GREEN] `item-reporting.service.js` `reportItem`: insert participant guard between `splitType` and `isLocked` checks — `if (!expense.participantIds.includes(userId)) throw AppError('NOT_PARTICIPANT', 403, …)`

## Phase 4: DYNAMIC Payment Acceptance UI — PR 4 `[frontend]`

- [ ] 4.1 [RED] Create `apps/frontend/src/utils/__tests__/payments.test.js`: truth table for `isPaymentAcceptanceActive` (DYNAMIC→true always; STATIC→true only when CLOSING)
- [ ] 4.2 [GREEN] Create `apps/frontend/src/utils/payments.js` exporting `isPaymentAcceptanceActive(balanceMode, periodStatus)` (ADR-8)
- [ ] 4.3 [GREEN] `GroupDetailPage.jsx`: import helper; derive `paymentAcceptanceActive`; make `pendingPayments`/`acceptedPayments` unconditional (ADR-10); delete unused `rejectedPayments` (L451)
- [ ] 4.4 [GREEN] Swap the gate at L594 (badge) and L608 (accept/reject) to `paymentAcceptanceActive`; leave L631 delete gate (`canDeletePayment && !isClosing`) UNCHANGED (ADR-9, intentional)
- [ ] 4.5 Manual check: DYNAMIC PENDING payment shows badge + accept/reject with no period/closure; STATIC behavior unchanged in every period state

## Phase 5: Final Verification (after all 4 PRs merged)

- [ ] 5.1 Run `pnpm --filter backend test && pnpm --filter frontend test` — full suite green
- [ ] 5.2 Run `pnpm -r run build` — passes
- [ ] 5.3 Grep sweep: every `prisma.payment.`/`prisma.expense.`/`_count` site in the Bug-1 flow table carries `deletedAt: null`
