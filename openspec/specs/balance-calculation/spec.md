# Balance Calculation Specification

## Purpose

Calculates and returns balance information for groups and users. Includes all expense types (EQUAL, PERCENTAGE, COLLECTIVE) once they have ExpenseSplit records. COLLECTIVE expenses only affect balances when status=COMPLETED.

## Requirements

### Requirement: Calculate Group Balances

The system MUST calculate net balances for all group members based on ExpenseSplit records AND Payment records. The system SHALL include splits from EQUAL, PERCENTAGE, and COMPLETED COLLECTIVE expenses, and incorporate payments (sender balance decreases, receiver balance increases). The system MUST return HTTP 200 with balance array.

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

#### Scenario: Calculate balances with payments

- GIVEN group with members A and B; A paid 100 for B (A is owed 100); then B paid A 50 (B settled 50)
- WHEN user requests `GET /groups/1/balances`
- THEN system returns A with netBalance 50, B with netBalance -50

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

### Requirement: Balance Calculation Identical Across Modes

The system MUST calculate balances using the same base algorithm for both DYNAMIC and STATIC groups. Every accepted payment MUST trigger a balance recalculation. Every new expense MUST trigger a balance recalculation. The system MUST NOT apply different balance logic based on group mode, EXCEPT that a STATIC group's period balances (via `getPeriodBalances`) reflect only direct debts while the period is CLOSING (see "No Transitive Debt Simplification During Closure").

#### Scenario: STATIC group recalculates balance on accepted payment

- GIVEN STATIC group in a CLOSING period where user1 owes user2 $50
- WHEN user1 registers a payment and user2 (creditor) accepts it
- THEN system recalculates the period balance, reducing user1's direct debt to user2

#### Scenario: DYNAMIC group recalculates balance identically

- GIVEN DYNAMIC group with existing expenses
- WHEN a payment is accepted
- THEN system recalculates balance using the same base algorithm as STATIC mode

### Requirement: No Transitive Debt Simplification During Closure

When a STATIC group's current period is in CLOSING state, the balances returned by `getPeriodBalances` MUST reflect only direct obligations — who owes whom, as recorded by expense splits — without transitive cancellation or reassignment. Payments during CLOSING MUST reduce only the direct debt between payer and creditor, and MUST NOT alter any other member's debts.

#### Scenario: Direct debt unchanged by payment between other members

- GIVEN STATIC group in CLOSING period where userA owes userB $100 and userB owes userC $100
- WHEN userB pays userC $100 and userC accepts the payment
- THEN userB's debt to userC is settled
- AND userA's debt to userB remains $100 unchanged

#### Scenario: Payment reduces direct debt only during CLOSING

- GIVEN STATIC group in CLOSING period where user1 owes user2 $100 directly
- WHEN user1 pays user2 $60 and user2 accepts
- THEN user1's debt to user2 becomes $40
- AND no other member's debts change as a side effect

### Requirement: STATIC Closure Period Freezes Expense Creation

The system MUST block new expense creation for STATIC groups when the current period's status is CLOSING (see `expense-management`'s "Period-Scoped Expense Creation for STATIC Groups"). During CLOSING, only payment registration and acceptance are permitted — no new expenses can alter the period's balance computation.

#### Scenario: Expense creation blocked during CLOSING

- GIVEN STATIC group with current period in CLOSING status
- WHEN a member attempts to create a new expense
- THEN system rejects the expense creation with HTTP 409 `{ code: "PERIOD_FROZEN" }`

### Requirement: DYNAMIC Continuous Balance Behavior

DYNAMIC groups MUST operate with continuous balance calculation and no closure periods. The system MUST NOT impose period boundaries or closures on DYNAMIC groups.

#### Scenario: DYNAMIC balance has no period boundary

- GIVEN DYNAMIC group where userA, userB, and userC are members
- WHEN any payment or expense is recorded
- THEN balances recalculate continuously; no closure or period boundary applies

### Requirement: Historical Balance Query

The system MUST allow querying balances for a specific period via `GET /groups/:groupId/periods/:periodId/balances`. For a CLOSED or FINAL period, the system MUST return the balances as frozen at closure time. For an OPEN or CLOSING period, the system MUST return live-calculated balances.

#### Scenario: Query closed period balances

- GIVEN STATIC group with period 1 (CLOSED) and period 2 (OPEN)
- WHEN user requests `GET /groups/:groupId/periods/1/balances`
- THEN system returns the frozen balances from period 1 as they were at closure time

#### Scenario: Query open period balances

- GIVEN STATIC group with period 2 (OPEN)
- WHEN user requests `GET /groups/:groupId/periods/2/balances`
- THEN system returns live-calculated balances for period 2

### Requirement: Closure Balance Precondition Check

Closure completion (`completeClosure`, `partialClosure`, `finalClosure`) MUST verify that every active member's net balance in the current period is already zero (within a 0.01 tolerance) before proceeding. The system MUST NOT zero or reset balances as part of closing — this check is a precondition gate, not a balance-mutating action. If any member's balance is non-zero, the system MUST reject the closure with HTTP 409 `{ code: "CLOSURE_BLOCKED" }` and perform no state transition.

#### Scenario: Closure blocked when unsettled debts remain

- GIVEN STATIC group in CLOSING period where user1 still owes user2 $30
- WHEN owner attempts to complete closure
- THEN system returns HTTP 409 with `{ code: "CLOSURE_BLOCKED" }`; the period remains CLOSING and no balances are modified

#### Scenario: Partial closure opens a new period with nothing carried over

- GIVEN STATIC group in CLOSING period where all debts are already settled and all payments accepted
- WHEN owner performs a partial closure
- THEN the current period transitions to CLOSED and a new OPEN period is created with no expenses or payments of its own

#### Scenario: Final closure permanently locks the group

- GIVEN STATIC group in CLOSING period where all debts are already settled
- WHEN owner performs a final closure
- THEN the period transitions to FINAL, `group.status` is set to CLOSED, and no further expenses or periods can be created

### Requirement: Exclude Soft-Deleted Records From Balance, Period, and Closure Queries

The system MUST exclude soft-deleted payments and expenses (`deletedAt` set) from every balance, period, and closure computation. This applies to: `balance.service.js` ACCEPTED payment lookup used for net balances; `period.service.js` period summaries, expense/payment counts, and `getPeriodExpenses`; and `closure.service.js` ACCEPTED payment queries and PENDING payment/expense counts used to gate `startClosure`, `completeClosure`, `partialClosure`, and `finalClosure`. A soft-deleted record MUST NOT contribute to any returned balance, total, or count.

#### Scenario: Soft-deleted payment excluded from group balances

- GIVEN group 1 has an ACCEPTED payment from user A to user B that has been soft-deleted (`deletedAt` set)
- WHEN user requests `GET /groups/1/balances`
- THEN the soft-deleted payment's amount is not reflected in either user's net balance

#### Scenario: Soft-deleted expense excluded from period expenses

- GIVEN a period has an expense that has been soft-deleted (`deletedAt` set)
- WHEN the owner requests the period's expense list via `getPeriodExpenses`
- THEN the soft-deleted expense does not appear and its amount is excluded from the period total

#### Scenario: Soft-deleted payment excluded from period payment counts

- GIVEN a period has one PENDING payment that has been soft-deleted
- WHEN the system computes the period's pending-payment count
- THEN the soft-deleted payment is not counted
