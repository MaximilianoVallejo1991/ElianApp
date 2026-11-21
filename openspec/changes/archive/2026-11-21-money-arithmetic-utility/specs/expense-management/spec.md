# Delta for Expense Management

## MODIFIED Requirements

### Requirement: Percentage Splits Sum Exactly to Total

The system MUST ensure `calculateEqualSplits`, `calculatePercentageSplits`, and `calculateCollectiveSplits` each produce output that sums exactly to `totalAmount`, with no cent lost or gained to independent per-share rounding. The system SHALL distribute the floored per-share cents to every participant, then assign each leftover cent to the participant whose unrounded share had the largest fractional remainder; on a tie, the participant with the lowest original index in the input order MUST receive the cent (the same largest-remainder/Hamilton-apportionment rule — not "the last participant absorbs the remainder"). No generated split amount MUST ever be negative, for any `totalAmount > 0` and any participant count. This fix MUST be applied identically in `apps/backend/src/utils/splits.js` and `apps/frontend/src/utils/splits.js`.

(Previously: this requirement covered only `calculatePercentageSplits`; `calculateEqualSplits` and `calculateCollectiveSplits` instead gave the entire rounding remainder to the last participant in input order, which could drive that participant's amount negative)

#### Scenario: Non-equal percentages sum exactly to total

- GIVEN `totalAmount = 10` and percentages `{ A: 33.33, B: 33.33, C: 33.34 }`
- WHEN `calculatePercentageSplits` runs on backend and on frontend
- THEN both return shares `[3.33, 3.33, 3.34]` summing to exactly `10.00`, with no 9.99 shortfall

#### Scenario: Backend and frontend splits.js produce identical output

- GIVEN the same `totalAmount` and percentage set
- WHEN `calculatePercentageSplits` is called in both `apps/backend/src/utils/splits.js` and `apps/frontend/src/utils/splits.js`
- THEN both return byte-identical amounts for every participant

#### Scenario: EQUAL split with 30 members never goes negative

- GIVEN `totalAmount = 3.18` and 30 member IDs
- WHEN `calculateEqualSplits` runs
- THEN no member's amount is negative; the first 18 members (by input order) receive `0.11` and the remaining 12 receive `0.10`, summing exactly to `3.18`

#### Scenario: COLLECTIVE split with no reported items never goes negative

- GIVEN `calculateCollectiveSplits([], 3.18, <30 participant ids>)` — nobody has reported an individual item, so each participant's split comes entirely from `sharedCosts`
- WHEN the function runs
- THEN no participant's amount is negative; the first 18 participants (by input order) receive `0.11` and the remaining 12 receive `0.10`, summing exactly to `3.18`

#### Scenario: Remainder cent goes to the lowest tied index, not the last participant

- GIVEN `totalAmount = 10` and 3 member IDs `[X, Y, Z]`
- WHEN `calculateEqualSplits` runs
- THEN `X` receives `3.34` and `Y`, `Z` each receive `3.33` — the leftover cent goes to the lowest original index among equally-ranked remainders, not to `Z` (the last participant), which is what the prior last-absorbs-remainder rule would have produced
