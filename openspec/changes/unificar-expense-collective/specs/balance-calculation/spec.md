# Balance Calculation Specification

## Purpose

Calculates and returns balance information for groups and users. Includes all expense types (EQUAL, PERCENTAGE, COLLECTIVE) once they have ExpenseSplit records. COLLECTIVE expenses only affect balances when status=COMPLETED.

## Requirements

### Requirement: Calculate Group Balances

The system MUST calculate net balances for all group members based on ExpenseSplit records. The system SHALL include splits from EQUAL, PERCENTAGE, and COMPLETED COLLECTIVE expenses. The system MUST return HTTP 200 with balance array.

#### Scenario: Balance includes EQUAL expense

- GIVEN group 1 has EQUAL expense (total=90, 3 participants, 30 each)
- WHEN user requests `GET /groups/1/balances`
- THEN system returns balances reflecting 30 owed by each participant

#### Scenario: Balance includes PERCENTAGE expense

- GIVEN group 1 has PERCENTAGE expense (total=100, user1=60%, user2=40%)
- WHEN user requests `GET /groups/1/balances`
- THEN system returns balances: user1 owes 60, user2 owes 40

#### Scenario: Balance includes COMPLETED COLLECTIVE expense

- GIVEN group 1 has COLLECTIVE expense with status=COMPLETED and ExpenseSplits
- WHEN user requests `GET /groups/1/balances`
- THEN system includes COLLECTIVE splits in balance calculation

#### Scenario: Balance excludes PENDING COLLECTIVE expense

- GIVEN group 1 has COLLECTIVE expense with status=PENDING (no splits yet)
- WHEN user requests `GET /groups/1/balances`
- THEN system does NOT include this expense in balances

### Requirement: Calculate User Balance in Group

The system MUST calculate a specific user's net balance in a group. The system SHALL sum all splits where user is debtor minus splits where user is creditor.

#### Scenario: User owes more than is owed

- GIVEN user 1 has splits: owes 100 (as debtor), is owed 30 (as creditor)
- WHEN user requests `GET /groups/1/balances/1`
- THEN system returns net balance: -70 (user 1 owes 70)

#### Scenario: User is owed more than owes

- GIVEN user 2 has splits: owes 20, is owed 80
- WHEN user requests `GET /groups/1/balances/2`
- THEN system returns net balance: +60 (user 2 is owed 60)

### Requirement: Balance Calculation Excludes Unlocked Expenses

The system MUST NOT include expenses with `isLocked=false` in balance calculations. The system SHALL only include expenses where `isLocked=true`.

#### Scenario: COLLECTIVE expense not locked

- GIVEN COLLECTIVE expense with isLocked=false, status=PENDING
- WHEN system calculates balances
- THEN expense is excluded from calculation

#### Scenario: COLLECTIVE expense locked after completion

- GIVEN COLLECTIVE expense with isLocked=true, status=COMPLETED
- WHEN system calculates balances
- THEN expense is included in calculation

### Requirement: Handle Zero Shared Costs

The system MUST correctly handle COLLECTIVE expenses where `sharedCosts=0`. The system SHALL calculate splits based only on individual items.

#### Scenario: COLLECTIVE with zero shared costs

- GIVEN COLLECTIVE expense with total=100, sharedCosts=0, items: user1=60, user2=40
- WHEN expense completes
- THEN splits: user1 owes 60, user2 owes 40 (no shared cost allocation)

### Requirement: Handle Single Participant

The system MUST handle expenses with only one participant. The system SHALL assign full amount to that participant.

#### Scenario: Single participant expense

- GIVEN PERCENTAGE expense with total=50, participant=[user1], percentage=100%
- WHEN expense is created
- THEN split: user1 owes 50

### Requirement: Rounding Precision

The system MUST use 2 decimal places for all monetary calculations. The system SHALL handle rounding consistently to avoid cent discrepancies.

#### Scenario: Rounding in EQUAL split

- GIVEN EQUAL expense with total=100, 3 participants
- WHEN system calculates splits
- THEN splits: 33.33, 33.33, 33.34 (last participant absorbs rounding)
