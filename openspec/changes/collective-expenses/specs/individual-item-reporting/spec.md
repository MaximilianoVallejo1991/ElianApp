# Individual Item Reporting Specification

## Purpose

Allow participants to report their individual items within a collective expense. The system verifies that all reported items plus shared costs match the declared total within a tolerance of 0.01.

## Requirements

### Requirement: Add Individual Item

The system MUST allow a participant to add an individual item to a collective expense. A participant SHALL only add items for themselves.

- GIVEN a collective expense `E` with participant `P` in its participantIds list
- WHEN `P` submits an individual item `{ amount: 25.00, description: "Appetizer" }`
- THEN the system SHALL create an `IndividualItem` with `collectiveExpenseId = E.id`, `userId = P.id`
- AND the system SHALL recompute verification status

#### Scenario: Participant adds own item

- GIVEN collective expense `E` with participants `[A, B, C]`
- WHEN `B` adds item `{ amount: 15.00, description: "Dessert" }`
- THEN `IndividualItem` is created with `userId = B`

#### Scenario: Non-participant cannot add items

- GIVEN collective expense `E` with participants `[A, B]`
- WHEN user `D` (not a participant) attempts to add item
- THEN the system SHALL return error `NOT_PARTICIPANT`

### Requirement: Update Own Item

The system SHALL allow a participant to update their own individual item, provided the collective expense has not been finalized.

- GIVEN a collective expense `E` with an individual item `I` reported by participant `P`
- WHEN `P` updates `{ amount: 20.00, description: "Updated Dessert" }`
- THEN `I.amount` and `I.description` SHALL be updated
- AND verification status SHALL be recomputed

#### Scenario: Participant updates their item

- GIVEN item `I` belongs to participant `B` with amount `15.00`
- WHEN `B` updates to `{ amount: 20.00 }`
- THEN `I.amount = 20.00`

### Requirement: Delete Own Item

The system SHALL allow a participant to delete their own individual item before the expense is finalized.

- GIVEN a collective expense `E` with an individual item `I` reported by participant `P`
- WHEN `P` deletes item `I`
- THEN `I` is removed from the database
- AND verification status SHALL be recomputed to `PENDING`

#### Scenario: Participant deletes their item

- GIVEN collective expense `E` has item `I` from participant `B`
- WHEN `B` deletes item `I`
- THEN `I` is removed

### Requirement: Verification Computation

The system SHALL compute verification status after any individual item change. The formula is:
```
sumIndividualItems = SUM(IndividualItem.amount WHERE collectiveExpenseId = X)
totalParts = sumIndividualItems + collectiveExpense.sharedCosts
IF ABS(totalParts - collectiveExpense.total) <= 0.01 → MATCH
ELSE → MISMATCH
```

- GIVEN a collective expense with total `100.00` and sharedCosts `30.00`
- WHEN all individual items sum to `70.00`
- THEN status SHALL be `MATCH` (since 70 + 30 = 100)

#### Scenario: Verification MATCH within tolerance

- GIVEN `E.total = 100.00`, `E.sharedCosts = 30.00`
- AND IndividualItems sum to `70.00`
- WHEN system computes verification
- THEN `status = MATCH`

#### Scenario: Verification MISMATCH when sum differs

- GIVEN `E.total = 100.00`, `E.sharedCosts = 30.00`
- AND IndividualItems sum to `65.00`
- WHEN system computes verification
- THEN `status = MISMATCH`
- AND response SHALL include `discrepancy: 5.00`

### Requirement: Get Verification Status

The system MUST return the current verification status with the discrepancy amount when MISMATCH.

- GIVEN a collective expense in any state
- WHEN a user requests verification status
- THEN the response SHALL include `status: PENDING | MATCH | MISMATCH`
- AND if `MISMATCH`, include `discrepancy: (total - (sumItems + sharedCosts))`

#### Scenario: PENDING when not all participants reported

- GIVEN collective expense has 3 participants but only 1 has reported items
- WHEN verification is computed
- THEN `status = PENDING`

### Requirement: PENDING When Items Remain

The system SHALL set status to `PENDING` when not all participants have reported items, regardless of sum.

- GIVEN collective expense `E` with participants `[A, B, C]`
- WHEN only `A` and `B` have reported items (C has none)
- THEN `status = PENDING`
- AND this remains even if the sum matches total

#### Scenario: PENDING despite matching sum

- GIVEN participants `[A, B, C]`, total `100.00`, sharedCosts `0.00`
- AND `A` reported `50.00`, `B` reported `50.00`, `C` reported nothing
- WHEN verification is computed
- THEN `status = PENDING` (not all participants have reported)