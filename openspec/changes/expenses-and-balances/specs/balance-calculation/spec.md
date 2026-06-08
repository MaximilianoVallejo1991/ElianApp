# Balance Calculation Specification

## Purpose

Computes net balances per user in a group by aggregating expenses paid and payments received. Balances are computed on read (not stored) for DYNAMIC balance mode groups.

## Requirements

### Requirement: Calculate Net Balances

The system MUST compute net balance per user in a group. The system SHALL calculate: `(sum of expenses user paid for others) - (sum of expenses others paid for user) + (sum of payments user received from others) - (sum of payments user sent to others)`. The system MUST return list sorted by balance descending (most owed to least owed).

For each expense, the payer's balance increases by `amount`. Each split reduces the corresponding user's balance by their split share.
For each payment, the sender's balance decreases and receiver's balance increases by `amount`.

The system MUST return `{ userId, user: { id, name, email }, netBalance }` for each member. Balance MUST be rounded to 2 decimal places.

#### Scenario: Calculate balances for group with expenses

- GIVEN group with members A and B; A paid expense of 100 split equally
- WHEN user requests `GET /groups/1/balances`
- THEN system returns `[{ userId: A, user: {...}, netBalance: 50 }, { userId: B, user: {...}, netBalance: -50 }]`

#### Scenario: Calculate balances with payments

- GIVEN group with members A and B; A paid 100 for B (A is owed 100); then B paid A 50 (B paid A 50)
- WHEN user requests `GET /groups/1/balances`
- THEN system returns A with netBalance 50, B with netBalance -50

#### Scenario: Calculate balances for group with no activity

- GIVEN group with members A and B, no expenses or payments
- WHEN user requests `GET /groups/1/balances`
- THEN system returns `[{ userId: A, user: {...}, netBalance: 0 }, { userId: B, user: {...}, netBalance: 0 }]`

#### Scenario: Non-member cannot get balances

- GIVEN authenticated user is not member of group 1
- WHEN user requests `GET /groups/1/balances`
- THEN system returns HTTP 404 with `{ error: "Group not found", code: "NOT_FOUND" }`

#### Scenario: Multiple expenses with different payers

- GIVEN group with members A, B, C; A paid 90 (equal split = 30 each); B paid 60 (equal split = 20 each)
- WHEN user requests `GET /groups/1/balances`
- THEN system calculates: A balance = 90 - 30 - 20 = 40; B balance = 60 - 30 - 20 = 10; C balance = 0 - 30 - 20 = -50
- AND returns sorted by balance descending

### Requirement: Balance Mode Compatibility

The system SHOULD compute balances for both DYNAMIC and STATIC balance mode groups identically for now. The closure workflow for STATIC groups is out of scope for this change.

#### Scenario: STATIC balance mode group

- GIVEN group with balanceMode "STATIC" and members A, B; A paid 100 split equally
- WHEN user requests `GET /groups/1/balances`
- THEN system returns same balance calculation as DYNAMIC mode (placeholder behavior)