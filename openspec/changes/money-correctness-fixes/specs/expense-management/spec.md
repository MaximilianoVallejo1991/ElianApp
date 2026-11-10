# Delta for Expense Management

## ADDED Requirements

### Requirement: Percentage Splits Sum Exactly to Total

The system MUST ensure `calculatePercentageSplits` output sums exactly to `totalAmount`, with no cent lost or gained to independent per-share rounding. The system SHALL distribute each participant's rounded share except the last, and the last participant in the input order MUST absorb the remainder (`totalAmount` minus the sum of all preceding rounded shares), mirroring `calculateEqualSplits`. This fix MUST be applied identically in `apps/backend/src/utils/splits.js` and `apps/frontend/src/utils/splits.js`.

#### Scenario: Non-equal percentages sum exactly to total

- GIVEN `totalAmount = 10` and percentages `{ A: 33.33, B: 33.33, C: 33.34 }`
- WHEN `calculatePercentageSplits` runs on backend and on frontend
- THEN both return shares `[3.33, 3.33, 3.34]` summing to exactly `10.00`, with no 9.99 shortfall

#### Scenario: Backend and frontend splits.js produce identical output

- GIVEN the same `totalAmount` and percentage set
- WHEN `calculatePercentageSplits` is called in both `apps/backend/src/utils/splits.js` and `apps/frontend/src/utils/splits.js`
- THEN both return byte-identical amounts for every participant

### Requirement: Splits Re-Validated After Participant Filtering

The system MUST re-validate (or re-derive) the computed split set in `computeSplits` after filtering by `participantIds`, so a filtered subset can never silently fail to sum to `totalAmount`. If the filtered splits do not sum to `totalAmount` within the existing rounding tolerance, the system MUST reject with HTTP 400 `{ error: "Split amounts must sum to expense amount", code: "VALIDATION_ERROR" }` rather than persisting a mismatched set.

#### Scenario: Filtered split subset still sums to total

- GIVEN an EXACT-split expense with splits for users [1,2,3] summing to the total, and `participantIds = [1,2]`
- WHEN `computeSplits` filters to the provided `participantIds`
- THEN the system re-validates the filtered set and rejects if it no longer sums to `totalAmount`, instead of silently persisting an incomplete split set

## MODIFIED Requirements

### Requirement: Add Individual Item

The system MUST allow a participant to add (or update, via upsert) an individual item to a COLLECTIVE expense. A participant SHALL only add items for themselves. The system MUST reject any user who is not in the expense's `participantIds` with HTTP 403 `{ error: "Only participants can report items", code: "NOT_PARTICIPANT" }`, unconditionally, before creating or updating the item — there is no legitimate non-participant case. This check MUST run in `reportItem` (`item-reporting.service.js`) regardless of whether the call creates a new item or updates an existing one.

(Previously: the original capability spec required this check, but the unified `reportItem` implementation introduced after the collective-expense unification does not enforce it — any authenticated user could report an item on any COLLECTIVE expense)

#### Scenario: Participant adds own item

- GIVEN collective expense `E` with participants `[A, B, C]`
- WHEN `B` adds item `{ amount: 15.00, description: "Dessert" }`
- THEN `ExpenseItem` is created with `userId = B`

#### Scenario: Non-participant cannot add items

- GIVEN collective expense `E` with `participantIds = [A, B]`
- WHEN user `D` (not a participant) submits `POST /expenses/E/items` with any amount
- THEN system returns HTTP 403 with `{ error: "Only participants can report items", code: "NOT_PARTICIPANT" }` and no item is created or updated

#### Scenario: Non-participant cannot update via upsert

- GIVEN collective expense `E` with `participantIds = [A, B]`, and `reportItem` is implemented as an upsert
- WHEN user `D` (not a participant) submits `POST /expenses/E/items` with `{ amount: 20 }`, which would otherwise upsert an item for `D`
- THEN system returns HTTP 403 with `{ error: "Only participants can report items", code: "NOT_PARTICIPANT" }` before the upsert runs; expense status is not recomputed

Note: this requirement was folded in from a separate `individual-item-reporting` capability delta — the current codebase already merged that capability into `expense-management`, so the spec tree follows the real module boundary instead of a stale split.
