# Tasks: Money Arithmetic Utility

## Testing Philosophy

Ponytail discipline: one RED test per real case, no combinatorial matrix across split types.
`apportionCents` is proven once, via `calculateEqualSplits` as its pass-through (ADR-1 keeps it
module-private). The other two functions' existing (updated) + new tests are the regression proof
— no primitive-level re-testing through them. Exactly 3 existing assertions change VALUE (2
renamed cases + ADR-7's integer-cents sum idiom) — these are edits, not new assertions bolted on.
Backend's `splits.test.js` is missing a `calculateCollectiveSplits` describe block entirely; add
it with the cases frontend already has, plus the one new non-negative case — nothing beyond that.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~310 (production ~200, tests ~110) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR, all 4 files, one commit (ADR-8) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending (single PR; cached `stacked-to-main` does not apply here) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

If the diff creeps toward 400 while implementing, trim JSDoc prose in the two production files —
do not split backend from frontend into separate PRs; either half alone is a knowingly
parity-broken intermediate commit (ADR-8).

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Full `apportionCents` extraction, wrapper rewrite, all test updates, final verification | PR 1 (only PR) | base `main`; tests included in the same commit |

## Phase 1: Backend — `apps/backend/src/utils/splits.js`

- [ ] 1.1 [RED] `apps/backend/src/utils/__tests__/splits.test.js`: rename `'handles rounding —
      last member absorbs the remainder'`; re-expect `calculateEqualSplits(100,[u1,u2,u3])` →
      `33.34/33.33/33.33`; sum assertion via ADR-7's integer-cents idiom, not float `toBe(100)`
- [ ] 1.2 [RED] Same file: add `calculateEqualSplits(1,[a,b,c])` → `0.34/0.33/0.33` (remainder to
      lowest tied index, not last participant)
- [ ] 1.3 [RED] Same file: add `calculateEqualSplits(3.18, <30 member ids>)` → every amount
      `>= 0`, first 18 at `0.11`, remaining 12 at `0.10`, integer-cents sum `=== 318`
- [ ] 1.4 [RED] Same file: add a `calculateCollectiveSplits` describe block (absent today) — port
      frontend's existing cases (`[]→[]`; shared `30`/2 ids `→25,35`; missing-item participant
      `→40,25`; zero shared costs `→50,50`); add the renamed remainder case (3×item `10`, shared
      `100`, 3 ids → `43.34/43.33/43.33`, ADR-7 idiom); add
      `calculateCollectiveSplits([], 3.18, <30 participant ids>)` → every amount `>= 0`, cents sum
      `=== 318`
- [ ] 1.5 [GREEN] `splits.js`: add module-private `apportionCents(totalCents, weights)` per
      design's exact Hamilton/largest-remainder implementation (lowest-index tie-break); delete
      `normalizedPercentages` (ADR-3)
- [ ] 1.6 [GREEN] Rewrite `calculateEqualSplits` body (after the existing empty guard) to call
      `apportionCents(Math.round(totalAmount*100), memberIds.map(()=>1))`
- [ ] 1.7 [GREEN] Rewrite `calculatePercentageSplits`: keep L69-85 validation unchanged (ADR-4),
      replace the inline Hamilton + rescale with
      `apportionCents(Math.round(totalAmount*100), splits.map(s=>s.percentage))`, keep reporting
      the original non-normalized `percentage`
- [ ] 1.8 [GREEN] Rewrite `calculateCollectiveSplits` (after the existing empty guard):
      `sharedCents = apportionCents(Math.round(sharedCosts*100), participantIds.map(()=>1))`, add
      `itemMap.get(userId) || 0` per participant, keep the final `Math.round(...*100)/100`
- [ ] 1.9 [GREEN] Update the 3 functions' JSDoc blocks: drop "the last member absorbs the
      remainder" language and the rescale paragraph; point to the shared largest-remainder rule
- [ ] 1.10 [Verify] `pnpm --filter backend test` green, including the 4 untouched PERCENTAGE
      regression cases (L69, L86, L140, L99 per design's trace) and
      `expense.service.test.js` / `item-reporting.service.test.js` unedited

## Phase 2: Frontend — `apps/frontend/src/utils/splits.js`

- [ ] 2.1 [RED] `apps/frontend/src/utils/__tests__/splits.test.js`: same re-expect as 1.1
      (`calculateEqualSplits(100,[u1,u2,u3])` → `33.34/33.33/33.33`, ADR-7 idiom)
- [ ] 2.2 [RED] Same file: rename `'last participant absorbs shared cost rounding remainder'`;
      re-expect `calculateCollectiveSplits(3×item 10, shared 100, 3 ids)` →
      `43.34/43.33/43.33`, ADR-7 idiom
- [ ] 2.3 [RED] Same file: add `calculateEqualSplits(3.18, <30 member ids>)` non-negative test
      (same assertions as 1.3)
- [ ] 2.4 [RED] Same file: add `calculateCollectiveSplits([], 3.18, <30 participant ids>)`
      non-negative test (same assertions as 1.4's new case)
- [ ] 2.5 [GREEN] `splits.js`: mirror 1.5-1.9. `apportionCents` body byte-identical to backend's
      (ADR-5's parity surface); wrapper shells stay as today (plain `Error`, no `AppError`, no
      `assertSplitsSumToTotal`)
- [ ] 2.6 [Verify] `pnpm --filter frontend test` green; confirm backend and frontend produce
      identical amounts for the shared scenarios (spec: "Backend and frontend splits.js produce
      identical output")

## Phase 3: Final Verification

- [ ] 3.1 Run `pnpm --filter backend test && pnpm --filter frontend test` — full suite green, zero
      regressions outside the 3 re-expected cases
- [ ] 3.2 Run `pnpm -r run build` — passes
- [ ] 3.3 Grep sweep: zero matches for `normalizedPercentages` anywhere in the repo; no second
      copy of the floor-plus-remainder algorithm exists outside `apportionCents` in either
      `splits.js` file
- [ ] 3.4 **Real-stack check — do NOT skip as "already covered by unit tests."** Docker/Postgres
      is available in this environment. Bring up the container, confirm migrations are current,
      then exercise the REAL `createExpense` (EQUAL, 30 participants, `amount=3.18`) and
      `createExpense`/`reportItem` (COLLECTIVE, 30 participants, zero reported items,
      `sharedCosts=3.18`) end-to-end against the live DB — not mocked, not the pure-function unit
      tests. Assert every persisted `ExpenseSplit.amount >= 0` and the split rows sum to exactly
      `318` cents for both cases.
- [ ] 3.5 Delete all test data created in 3.4 (expense, splits, items, group, memberships,
      throwaway users) in FK-safe order; verify zero rows remain via a follow-up query
