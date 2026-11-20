# Design: Money Arithmetic Utility

## Technical Approach

Extract Cycle 1's already-shipped Hamilton apportionment out of `calculatePercentageSplits` (`splits.js` L87-116) into one module-private primitive, then make all three split functions call it. This is the pattern already in the file — nothing new is invented; the algorithm is lifted verbatim and generalized from "percentages" to "weights".

| Function | Today | After |
|----------|-------|-------|
| `calculateEqualSplits` | last member absorbs remainder (can go negative) | `apportionCents(cents, Array(n).fill(1))` |
| `calculatePercentageSplits` | inline Hamilton + `normalizedPercentages` rescale | validation unchanged + `apportionCents(cents, percentages)` |
| `calculateCollectiveSplits` | last participant absorbs shared remainder (can go negative) | `apportionCents(sharedCents, Array(n).fill(1))`, then `itemAmount + share` |

Net effect is code *reduction*: one algorithm instead of three, and the `normalizedPercentages` step disappears (ADR-3).

## Architecture Decisions

| # | Decision | Choice | Alternatives | Rationale |
|---|----------|--------|-------------|-----------|
| ADR-1 | `apportionCents` visibility | **Module-private** (not exported) | Export it for direct unit tests | All three callers live in the same file. Keeping it private makes its precondition (ADR-2) unviolatable instead of merely documented, and tests reach it fully through `calculateEqualSplits`, which is a 1:1 pass-through. If a 4th caller appears outside the file, export then — not now. |
| ADR-2 | Precondition handling (`weights.length === 0`, `sum(weights) === 0`, `totalCents < 0`) | **Callers guard; the primitive documents the precondition and adds no branch** | Defensive guards inside the primitive | Proven unreachable from all three callers — see "Precondition proof". A guard would be dead code, and the only honest failure response (throw) cannot be written identically on both sides because the frontend has no `AppError` (ADR-4). |
| ADR-3 | `normalizedPercentages` rescale (L89-94) | **Delete** | Keep it and feed normalized values to the primitive | Algebraic identity, not faith: today `exact_i = totalCents · (p_i·100/S) / 100`; the primitive computes `exact_i = totalCents · p_i / S`. Same expression, one fewer intermediate. The rescale *was* the normalization; the primitive now does it by construction. |
| ADR-4 | Percentage-specific validation (L69-85) | **Stays in the wrapper, runs before the primitive, unchanged** | Move sum-100/negative/NaN checks into the primitive | Those rules are about percentages, not about apportionment — `apportionCents` has no notion of "100". Moving them would also force `AppError` into the primitive and break backend/frontend parity. They also *establish* the primitive's precondition, so they must run first. |
| ADR-5 | Backend/frontend parity mechanism | **Manually mirrored, same commit; identical numeric behavior, not identical bytes** | Build-time codegen / shared package | Out of scope per the proposal's minimal-footprint framing, and the files are already *not* byte-identical: the frontend throws plain `Error`, has no `AppError` import, and has no `assertSplitsSumToTotal`. `apportionCents` itself is pure integer math and **can** be byte-identical — that is the parity surface that matters. |
| ADR-6 | Empty-input contract of the two wrappers | **Keep both existing early `return []` guards verbatim** | Let the primitive return `[]` for empty weights | It happens to work, but the early returns are the tested public contract (`calculateEqualSplits(100, null) → []`) and they are what makes ADR-2's precondition hold. Zero reason to touch them. |
| ADR-7 | Float sum assertions in updated tests | **Compare integer cents** (`reduce((s, x) => s + Math.round(x*100), 0)`) where the moved remainder changes addition order | Keep `expect(total).toBe(100)` | Reordering `33.33 + 33.33 + 33.34` into `33.34 + 33.33 + 33.33` changes IEEE-754 accumulation and can produce `100.00000000000001`. The percentage test at `splits.test.js` L118-122 already uses the cents idiom for exactly this reason. Follow it. |
| ADR-8 | Delivery shape | **Single PR** | Chained PRs | ~310 changed lines across 4 files, no schema, no new infrastructure. Splitting backend from frontend would ship a knowingly parity-broken intermediate commit — strictly worse than one slightly larger PR. See "Review Workload Forecast". |

### Precondition proof (ADR-2)

`apportionCents` requires `weights.length > 0`, `sum(weights) > 0`, `totalCents >= 0`, `weights[i] >= 0`.

- **EQUAL / COLLECTIVE**: `weights = Array(n).fill(1)` → `sum = n`. The existing early returns mean `n >= 1`, so `sum >= 1`. `sum === 0` requires `n === 0`, which is exactly the already-handled empty case. `totalAmount` is `z.number().positive()`; `sharedCosts` is `z.number().min(0)` (`expense.schemas.js` L49) and coerced via `Number(...) || 0` at both call sites.
- **PERCENTAGE**: the wrapper guard forces every percentage finite and `>= 0` and `|S - 100| <= 0.01`, so `S ∈ [99.99, 100.01]`. `S === 0` is unreachable; the empty array is rejected by the same guard (`|0 - 100| > 0.01`).
- Given those, standard Hamilton guarantees `leftover ∈ [0, n-1]`, so `order.slice(0, leftover)` is never the negative-index tail slice.

### Tie-break determinism

`sort((a, b) => remainders[b] - remainders[a] || a - b)` — identical to the current L106-108. For `a !== b` the comparator never returns `0` (`a - b !== 0`), so it is a strict total order and the resulting permutation is unique, independent of whether the engine's sort is stable. Lowest original index wins ties.

## Data Flow

```
  totalAmount (float)            weights (float[])
        │                              │
        ▼                              │
  Math.round(x * 100) ───── totalCents │
                                │      │
                                ▼      ▼
                         apportionCents(totalCents, weights)
                                │
                     exact_i = totalCents * w_i / Σw
                     floor → remainders → rank desc (tie: lower index)
                     bump the first `leftover` indices
                                │
                                ▼
                          cents[]  (Σ === totalCents, every element >= 0)
                                │
         ┌──────────────────────┼──────────────────────┐
         ▼                      ▼                      ▼
    EQUAL: c/100       PERCENTAGE: c/100      COLLECTIVE: itemAmount + c/100
                                                   (items never enter the primitive)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/backend/src/utils/splits.js` | Modify | Add private `apportionCents`; rewrite the three functions as wrappers; delete `normalizedPercentages`; update the three JSDoc blocks that still promise "the last member absorbs the remainder" |
| `apps/frontend/src/utils/splits.js` | Modify | Same change, same commit (ADR-5) |
| `apps/backend/src/utils/__tests__/splits.test.js` | Modify | 1 case re-expected; 2 RED non-negative cases; new `calculateCollectiveSplits` describe (absent today) |
| `apps/frontend/src/utils/__tests__/splits.test.js` | Modify | 2 cases re-expected; 2 RED non-negative cases |

Untouched: `computeCollectiveStatus`, `assertSplitsSumToTotal`, `expense.service.js`, `item-reporting.service.js` — signatures and return shapes are unchanged.

## Interfaces / Contracts

```js
/**
 * Apportion `totalCents` across `weights` by the largest-remainder (Hamilton)
 * method: floor each exact share, then give the leftover cents to the largest
 * fractional remainders, ties broken by lowest original index.
 *
 * Precondition, held by every caller in this file: `weights` is non-empty,
 * every weight is a finite number >= 0, `sum(weights) > 0`, `totalCents >= 0`.
 * Module-private so that precondition cannot be broken from outside.
 *
 * @param {number} totalCents — integer cents to distribute
 * @param {number[]} weights — relative shares; any positive scale works
 * @returns {number[]} integer cents, same length/order, summing exactly to totalCents
 */
function apportionCents(totalCents, weights) {
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  const exact = weights.map((w) => (totalCents * w) / weightSum);
  const floors = exact.map((c) => Math.floor(c));
  const remainders = exact.map((c, i) => c - floors[i]);

  const leftover = totalCents - floors.reduce((sum, c) => sum + c, 0);

  // Earlier original index wins a remainder tie, so the output is deterministic
  // regardless of the engine's sort-stability guarantees.
  const order = weights
    .map((_, i) => i)
    .sort((a, b) => remainders[b] - remainders[a] || a - b);

  const result = floors.slice();
  for (let k = 0; k < leftover; k++) {
    result[order[k]] += 1;
  }
  return result;
}
```

(Shipped version simplifies the remainder bump to a direct loop instead of a `Set`+`.has()` pair
— same result, flagged by post-apply code review and fixed, see `tasks.md`'s addendum.)

### Migration shape per function

```js
// calculateEqualSplits — body after the existing empty guard
const cents = apportionCents(Math.round(totalAmount * 100), memberIds.map(() => 1));
return memberIds.map((userId, i) => ({ userId, amount: cents[i] / 100 }));

// calculatePercentageSplits — L69-85 validation UNCHANGED, then:
const cents = apportionCents(Math.round(totalAmount * 100), splits.map((s) => s.percentage));
return splits.map((s, i) => ({
  userId: s.userId,
  amount: cents[i] / 100,
  percentage: s.percentage,            // original, non-normalized, as today
}));

// calculateCollectiveSplits — body after the existing empty guard
const sharedCents = apportionCents(Math.round(sharedCosts * 100), participantIds.map(() => 1));
const itemMap = new Map(items.map((item) => [item.userId, item.amount]));
return participantIds.map((userId, i) => ({
  userId,
  amount: Math.round(((itemMap.get(userId) || 0) + sharedCents[i] / 100) * 100) / 100,
}));
```

COLLECTIVE confirmed against current L181-188: only `sharedCosts` is apportioned, `itemAmount` is added afterwards per participant, and the final `Math.round(… * 100) / 100` is retained because `itemAmount` arrives as an unconstrained float from the DB.

## Testing Strategy

Strict TDD. Command: `pnpm --filter backend test && pnpm --filter frontend test`.

### Existing cases whose expected values change (exhaustive)

| File | Case | Today | After |
|------|------|-------|-------|
| `apps/backend/.../__tests__/splits.test.js` L28-39 `'handles rounding — last member absorbs the remainder'` | `calculateEqualSplits(100, [u1,u2,u3])` | `33.33 / 33.33 / 33.34` | **`33.34 / 33.33 / 33.33`** — rename the case; apply ADR-7 to the `toBe(100)` sum |
| `apps/frontend/.../__tests__/splits.test.js` L28-39 (same case, mirrored) | same | same | same |
| `apps/frontend/.../__tests__/splits.test.js` L260-276 `'last participant absorbs shared cost rounding remainder'` | `calculateCollectiveSplits(3×item 10, shared 100, 3 ids)` | `43.33 / 43.33 / 43.34` | **`43.34 / 43.33 / 43.33`** — rename; apply ADR-7 to the `toBe(130)` sum |

Nothing else. Verified unchanged: EQUAL empty/null → `[]`, single member `50`, two members `50/50`, zero total, `(1, 5 ids) → 0.2` each; COLLECTIVE empty → `[]`, `shared 30 / 2 → 25,35`, missing-item participant `→ 40,25`, zero shared costs `→ 50,50`; the whole `computeCollectiveStatus` and `assertSplitsSumToTotal` blocks. Also verified unchanged: every amount in `expense.service.test.js` and `item-reporting.service.test.js` either divides evenly (`100/2`, `300/2`, `150/3`, `sharedCosts: 0`) or rejects before splits are computed — **zero service-test changes**.

### PERCENTAGE regression net — traced, not assumed

| Existing case | Trace through `apportionCents` | Verdict |
|---|---|---|
| L69 `(10, [33.33, 33.33, 33.34])` | `S≈100`, exact `333.3/333.3/333.4`, floors sum `999`, leftover `1` → highest remainder is index 2 | `3.33/3.33/3.34`, sum `10` — identical to the current expectation |
| L86 `(10, [16.67, 16.67, 66.66])` | `S=100`, exact `166.7/166.7/666.6`, floors sum `998`, leftover `2`, remainders `.7/.7/.6` → indices 0 and 1 bumped | `1.67/1.67/6.66`, total `10` — assertion is total-only, passes |
| L140 `(10000, [60.0033, 40.0033])` (the epsilon-rescale case) | `S=100.0066`, exact `599993.40/400006.59`, leftover `1` → index 1 | `5999.93/4000.07`, total `10000`, original percentages still reported — **this is precisely the case ADR-3 subsumes**; it keeps passing unmodified because `totalCents·p/S` is the same value the rescale produced |
| L99 the 49×`2.0406` + `0.01` case | `S=99.9994`, 49 identical remainders `≈.6122` + one `≈.00006`, leftover `30` → indices 0-29 bumped | `20.41`×30, `20.40`×19, `0.10`; all `>= 0`; cents sum `100000` — passes |

Residual float note: the two expression orderings can differ by ~1 ULP, which could only flip *which* participant receives a cent when two remainders are within 1 ULP — never the total, never the sign. All four cases above have remainder gaps many orders of magnitude larger.

### New RED tests (one per function, both sides)

| Test | Assertion |
|------|-----------|
| `calculateEqualSplits(3.18, <30 ids>)` | every `amount >= 0`; cents sum `=== 318` (today the last member gets `-0.01`) |
| `calculateCollectiveSplits([], 3.18, <30 ids>)` | every `amount >= 0`; cents sum `=== 318`; a zero-item participant gets their shared share |
| Tie-break pin: `calculateEqualSplits(1, [a,b,c])` | `0.34 / 0.33 / 0.33` — lowest index wins an exact tie |
| PERCENTAGE | none added; Cycle 1's existing cases are the regression net and must pass **unmodified** |

Backend's `splits.test.js` has no `calculateCollectiveSplits` describe at all today — the COLLECTIVE RED test requires adding one. That is a bounded parity fix the proposal already asks for ("backend and frontend"), not scope creep.

## Review Workload Forecast

| Slice | Production | Tests | Total |
|-------|-----------:|------:|------:|
| `apps/backend/src/utils/splits.js` | ~100 | — | ~100 |
| `apps/frontend/src/utils/splits.js` | ~100 | — | ~100 |
| Backend tests (3 re-expected lines + 2 RED cases + new COLLECTIVE describe) | — | ~70 | ~70 |
| Frontend tests (6 re-expected lines + 2 RED cases) | — | ~40 | ~40 |
| **Total** | **~200** | **~110** | **~310** |

The ~100 per production file is mostly **JSDoc rewriting** — the three doc blocks currently promise "the last member absorbs the remainder" and the 6-line rescale paragraph goes away; actual logic shrinks.

**Chained PRs recommended: No. 400-line budget risk: Medium. Decision needed before apply: No.**

Single PR. If the diff creeps toward 400, trim JSDoc prose — do **not** split backend from frontend, because either half alone is a knowingly parity-broken commit (the proposal's own Med-likelihood drift risk).

## Migration / Rollout

No migration. No schema change. No data mutation. Persisted `ExpenseSplit` rows are computed at write time and stay as-is; only newly computed splits use the new remainder recipient. Rollback is a single `git revert` of one commit touching four files.

## Open Questions

None. ADR-5 (manual parity) and ADR-8 (single PR) are decisions, not questions; both follow the proposal's declared scope.
