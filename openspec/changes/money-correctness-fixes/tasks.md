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

**Second addendum (PR 1, second post-merge-review fix)** — a second fresh-context review found that the "last element absorbs the remainder" algorithm in `calculatePercentageSplits` (both copies) can push the *last* participant's amount negative when many small per-item roundings accumulate across a large participant count. Confirmed by execution: 49 participants at ~2.0406% + 1 at 0.01%, splitting $1000, gave the last participant `amount: -0.09` under the old algorithm instead of their true ~$0.10 — a sign-flip bug, not just an unfairness issue. Replaced the remainder-distribution step in `calculatePercentageSplits` (both files, same scope as the first addendum — `calculateEqualSplits`/`calculateCollectiveSplits` unchanged, still deferred to `money-arithmetic-utility`) with the largest-remainder method (Hamilton apportionment), computed in integer cents: floor every share, then give +1 cent to the N participants with the largest fractional remainder (N = leftover cents), ranked with a deterministic index tie-break. This provably sums exactly to the total and cannot go negative when every percentage is non-negative. Also fixed a test-quality issue in the existing "absorbs an over-shooting remainder" test, which wrapped the computed total in `Math.round(total * 100) / 100` before comparing — masking a potential real off-by-one-cent regression; now compares the raw summed total directly, matching the sibling test's style.

- [x] 1.6 [RED→GREEN] `apps/backend/src/utils/splits.js` + `apps/frontend/src/utils/splits.js`: replace `calculatePercentageSplits`'s "last absorbs remainder" step with the largest-remainder method (integer cents, floor + rank-by-remainder-descending with index tie-break); new regression test (49×2.0406% + 1×0.01%, total $1000) confirmed failing under the old algorithm (`-0.09`, RED) before the fix and passing after (GREEN, every amount ≥ 0, sum exactly 100000 cents); fixed the over-shoot test's masking `Math.round` before comparison; full suites green (`backend` 15/15, `frontend` 30/30)

**Third addendum (PR 1, third post-merge-review fix)** — a third fresh-context review found 3 more real defects in `calculatePercentageSplits` (both copies), all fixed in a single pass since they touch the same guard/math region:

- **Bug A (rescale within epsilon)**: the sum guard allows percentages within `0.01` of 100 (e.g. `100.0066`) to pass, but the cents math then used the *raw* percentages directly, so `distributedFloor` didn't sum to `totalCents` and `leftoverCents` could go negative or exceed `splits.length` — `order.slice(0, leftoverCents)` with a negative end silently counts from the array's end instead of giving zero elements, corrupting the output without throwing. Fix: after the sum-within-epsilon check passes, rescale each percentage to `(s.percentage * 100) / percentageSum` and use that normalized value for the cents math only; the original `s.percentage` is still what's returned to callers.
- **Bug B (NaN bypass)**: `Math.abs(NaN - 100) > epsilon` is always `false`, so a split with a missing/non-numeric `percentage` sailed through the guard and produced `amount: NaN` in the output. Fix: guard now also rejects when `percentageSum` is not `Number.isFinite` (a `NaN` in any individual percentage propagates to the sum), using the same `AppError('INVALID_SPLITS', 400, ...)` / `Error(...)` as the existing guard.
- **Bug C (empty array bypass)**: the special-cased `if (!splits || splits.length === 0) return [];` early return ran *before* the percentage-sum guard, so `calculatePercentageSplits(totalAmount, [])` silently returned `[]` for a real non-zero `totalAmount` instead of erroring — relevant because `expense.service.js`'s `computeSplits` can reach this with an empty filtered array. Fix: removed the early return entirely; an empty `splits` array naturally reduces to `percentageSum = 0`, which already fails the sum guard and throws, with no special-casing needed. Checked `expense.service.js`'s only call site (`computeSplits`) — no legitimate caller relies on `calculatePercentageSplits(0, [])` returning `[]`, so no zero-amount exception was added.

New tests added to both `splits.test.js` files, each confirmed RED against pre-fix code then GREEN after: rescale test (reviewer's repro: `totalAmount=10000`, `[60.0033, 40.0033]` → sums to exactly `10000`, not `10000.66`), NaN/missing-percentage test (throws `INVALID_SPLITS` / `Error`, not `NaN`), empty-array test (`calculatePercentageSplits(100, [])` throws, not `[]`). The pre-existing "handles empty splits array" test (asserted `toEqual([])`) was replaced by the new empty-array-throws test since Bug C's fix inverts that exact behavior. Full suites green after: `backend` 17/17, `frontend` 32/32. Same scope as prior addenda — `calculateEqualSplits`/`calculateCollectiveSplits`/`expense.service.js` untouched.

**Fourth addendum (PR 1, fourth post-merge-review fix)** — a fourth fresh-context review found that `calculatePercentageSplits` (both copies) validated only that percentages *sum* to ~100, never that each *individual* percentage was non-negative. Confirmed by execution: `calculatePercentageSplits(100, [{userId:'u1',percentage:-10},{userId:'u2',percentage:110}])` returned `amount: -10` for `u1` directly — the exact negative-amount defect this PR exists to eliminate, reached through a crafted negative/positive pair instead of rounding accumulation. Fix: added a per-element check (`!Number.isFinite(s.percentage) || s.percentage < 0`) alongside the existing sum/NaN/empty guards in both files; any split with a negative (or non-finite) individual percentage now throws the same `AppError('INVALID_SPLITS', 400, 'Split percentages must sum to 100')` (backend) / `Error('Split percentages must sum to 100')` (frontend) — no new error code. New regression test added to both `splits.test.js` files (`-10`/`110` pair), confirmed RED against pre-fix code (test failed: "expected function to throw... but it didn't") then GREEN after the fix. Full suites green after: `backend` 18/18, `frontend` 33/33. Same scope as prior addenda — `calculateEqualSplits`/`calculateCollectiveSplits`/`expense.service.js` untouched and still deferred to `money-arithmetic-utility` per prior user decision.

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

> **FLAG — found during PR 1's fourth post-merge review, belongs to this phase, NOT implemented here:** `updateExpense` in `apps/backend/src/services/expense.service.js` (~line 536) builds `splitsInput = data.splits ?? []` for partial updates. For an existing PERCENTAGE-split expense, a request body containing only `{ amount: ... }` (no `splits`) now reaches `calculatePercentageSplits(amount, [])`, which — correctly, per this PR's fixes — throws `INVALID_SPLITS` instead of the old silent `[]`. This is NOT a bug in `calculatePercentageSplits` (it is correctly refusing to guess); it is a pre-existing design gap in `computeSplits`'s defaulting logic: a `PUT /groups/:id/expenses/:id` with only `{ amount }` on an existing PERCENTAGE expense now 400s where it previously silently mis-saved. PR 3's rework of `computeSplits` (task 3.2, ADR-6) should also address this — e.g. by having `computeSplits` fall back to the expense's EXISTING persisted split percentages when `data.splits` is omitted from the update payload, rather than defaulting to `[]`. Add this to PR 3's implementation scope; not fixed as part of PR 1.

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
