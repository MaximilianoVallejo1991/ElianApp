# Delta for Expense Management

## ADDED Requirements

### Requirement: Period-Scoped Expense Creation for STATIC Groups

The system MUST link every expense created in a STATIC group to the group's current open period via `periodId`. The system SHALL automatically set `periodId` to the group's `currentPeriodId` when an expense is created. The system MUST return HTTP 201 with the created expense including `periodId`.

#### Scenario: Expense created in OPEN period of STATIC group

- GIVEN STATIC group with current OPEN period (id=5)
- WHEN member submits `POST /groups/:groupId/expenses` with valid expense data
- THEN system creates expense with `periodId=5` and returns HTTP 201

#### Scenario: Expense creation blocked during CLOSING period

- GIVEN STATIC group with current period status CLOSING
- WHEN member submits `POST /groups/:groupId/expenses`
- THEN system returns HTTP 409 with `{ error: "Cannot create expense during closing period", code: "PERIOD_FROZEN" }`

#### Scenario: Expense creation blocked in CLOSED group

- GIVEN STATIC group with status CLOSED
- WHEN member submits `POST /groups/:groupId/expenses`
- THEN system returns HTTP 403 with `{ error: "Group is permanently closed", code: "GROUP_CLOSED" }`

### Requirement: DYNAMIC Groups Unaffected by Period Logic

The system MUST NOT require `periodId` for expenses in DYNAMIC groups. Expense creation for DYNAMIC groups MUST work exactly as before with no period linkage.

#### Scenario: DYNAMIC group expense creation unchanged

- GIVEN DYNAMIC group (no periods exist)
- WHEN member submits `POST /groups/:groupId/expenses` with valid expense data
- THEN system creates expense with `periodId=null` and returns HTTP 201 (existing behavior unchanged)

## MODIFIED Requirements

### Requirement: List Group Expenses

The system MUST return all expenses for a group, including their status and split type. The system SHALL include COLLECTIVE expenses regardless of status. For STATIC groups, the system MUST filter expenses to the current open period by default. The system MUST accept `?periodId=...` query parameter to list expenses for a specific period. The system MUST accept `?includeHistory=true` to list expenses across all periods.

(Previously: Listed all expenses globally with no period filtering)

#### Scenario: List expenses with mixed types

- GIVEN group 1 has EQUAL expense (COMPLETED), COLLECTIVE expense (PENDING), PERCENTAGE expense (COMPLETED)
- WHEN user requests `GET /groups/1/expenses`
- THEN system returns all 3 expenses with their respective statuses

#### Scenario: Non-member cannot list expenses

- GIVEN authenticated user is not member of group 1
- WHEN user requests `GET /groups/1/expenses`
- THEN system returns HTTP 404 with `{ error: "Group not found", code: "NOT_FOUND" }`

#### Scenario: STATIC group lists current period expenses by default

- GIVEN STATIC group with period 1 (CLOSED, 2 expenses) and period 2 (OPEN, 3 expenses)
- WHEN user requests `GET /groups/:groupId/expenses`
- THEN system returns only the 3 expenses from period 2

#### Scenario: STATIC group queries specific period expenses

- GIVEN STATIC group with period 1 (CLOSED, 2 expenses)
- WHEN user requests `GET /groups/:groupId/expenses?periodId=1`
- THEN system returns the 2 expenses from period 1

#### Scenario: STATIC group lists all periods with includeHistory

- GIVEN STATIC group with period 1 (CLOSED, 2 expenses) and period 2 (OPEN, 3 expenses)
- WHEN user requests `GET /groups/:groupId/expenses?includeHistory=true`
- THEN system returns all 5 expenses across both periods