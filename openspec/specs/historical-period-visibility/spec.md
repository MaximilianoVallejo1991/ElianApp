# Historical Period Visibility Specification

## Purpose

Provides API access to past periods and their associated data (expenses, payments, balances) for STATIC groups. Members can review past settlements; non-members are barred from accessing period data.

## Requirements

### Requirement: List Periods for Group

The system MUST provide an endpoint `GET /groups/:groupId/periods` that returns all periods for a STATIC group, ordered by creation date descending. Each period MUST include `id`, `status` (OPEN, CLOSING, CLOSED, FINAL), `isCurrent`, `startedAt`, `closedAt` (nullable), and `createdAt`. The system MUST return HTTP 403 `{ code: "NOT_MEMBER" }` if the authenticated user is not an active group member.

#### Scenario: List periods returns all with status

- GIVEN STATIC group with period 1 (CLOSED, createdAt: 2025-01-01) and period 2 (OPEN, isCurrent: true, createdAt: 2025-02-01)
- WHEN member requests `GET /groups/:groupId/periods`
- THEN system returns HTTP 200 with `[{ id: 2, status: "OPEN", isCurrent: true, createdAt: "2025-02-01", closedAt: null }, { id: 1, status: "CLOSED", isCurrent: false, createdAt: "2025-01-01", closedAt: "2025-01-31" }]`

#### Scenario: DYNAMIC group has no periods

- GIVEN DYNAMIC group with no periods
- WHEN member requests `GET /groups/:groupId/periods`
- THEN system returns HTTP 200 with `[]`

#### Scenario: Non-member cannot list periods

- GIVEN authenticated user is not member of group
- WHEN user requests `GET /groups/:groupId/periods`
- THEN system returns HTTP 403 with `{ error: "User is not a group member", code: "NOT_MEMBER" }`

### Requirement: Get Period Details

The system MUST provide an endpoint `GET /groups/:groupId/periods/:periodId` that returns a single period's metadata. The system MUST return HTTP 403 `{ code: "NOT_MEMBER" }` if the authenticated user is not an active group member. The system MUST return HTTP 404 if the period does not exist or does not belong to the group.

#### Scenario: Get period details

- GIVEN STATIC group with period 1 (CLOSED)
- WHEN member requests `GET /groups/:groupId/periods/1`
- THEN system returns HTTP 200 with `{ id: 1, status: "CLOSED", createdAt: "...", closedAt: "..." }`

#### Scenario: Period not in group returns 404

- GIVEN STATIC group 1 with period 1, and STATIC group 2 with period 5
- WHEN member of group 1 requests `GET /groups/1/periods/5`
- THEN system returns HTTP 404 with `{ error: "Period not found", code: "NOT_FOUND" }`

#### Scenario: Non-member cannot get period details

- GIVEN authenticated user is not member of group
- WHEN user requests `GET /groups/:groupId/periods/1`
- THEN system returns HTTP 403 with `{ error: "User is not a group member", code: "NOT_MEMBER" }`

### Requirement: Get Period Expenses

The system MUST provide an endpoint `GET /groups/:groupId/periods/:periodId/expenses` that returns all non-deleted expenses for a specific period. The system MUST only return expenses where `periodId` matches the requested period. The system MUST return HTTP 403 `{ code: "NOT_MEMBER" }` if the authenticated user is not an active group member, and HTTP 404 if the period does not exist or does not belong to the group.

#### Scenario: Get period expenses returns only that period's data

- GIVEN STATIC group with period 1 (CLOSED, 3 expenses) and period 2 (OPEN, 2 expenses)
- WHEN member requests `GET /groups/:groupId/periods/1/expenses`
- THEN system returns only the 3 expenses from period 1

#### Scenario: Non-member cannot access period expenses

- GIVEN authenticated user is not member of group
- WHEN user requests `GET /groups/:groupId/periods/1/expenses`
- THEN system returns HTTP 403 with `{ error: "User is not a group member", code: "NOT_MEMBER" }`

### Requirement: Full Expense Detail Persistence Per Period

The system MUST preserve and serve the complete expense detail for every closed period for the entire lifetime of the group. Each expense in a closed period MUST remain accessible with ALL its attributes: `description`, `amount`, `payerId`, `date`, `splits` (who owes what, via the `splits` relation including user detail), and `items` (for COLLECTIVE expenses, via the `items` relation including user detail). This data MUST NOT be purged, summarized, or degraded regardless of how many subsequent closures occur. The system MUST serve this full detail inline via the existing list endpoint `GET /groups/:groupId/periods/:periodId/expenses` (`getPeriodExpenses`) — there is no separate single-expense-detail endpoint; every expense returned by that list already includes its full `splits`, `items`, `payer`, and `createdBy` detail.

#### Scenario: Full expense detail available from a closed period multiple closures ago

- GIVEN STATIC group with period 1 (CLOSED), period 2 (CLOSED), period 3 (CLOSED), and period 4 (OPEN)
- AND period 1 contains expense E1 with description "Dinner", amount 120, payerId: "alice", date: "2025-01-15", splits: [{ userId: "bob", amount: 60 }, { userId: "alice", amount: 60 }]
- WHEN member requests `GET /groups/:groupId/periods/1/expenses`
- THEN system returns HTTP 200 with a list including E1's full description, amount, payerId, date, and all splits
- AND no data is missing or summarized despite 3 subsequent closures

#### Scenario: COLLECTIVE expense items preserved in closed period

- GIVEN STATIC group with period 1 (CLOSED) containing a COLLECTIVE expense E2 with items [{ description: "Pizza", amount: 30 }, { description: "Beer", amount: 20 }]
- WHEN member requests `GET /groups/:groupId/periods/1/expenses`
- THEN system returns HTTP 200 with E2 included, with the full `items` array including each item's description and amount

#### Scenario: Non-member cannot access period expense detail

- GIVEN authenticated user is not member of group
- WHEN user requests `GET /groups/:groupId/periods/1/expenses`
- THEN system returns HTTP 403 with `{ error: "User is not a group member", code: "NOT_MEMBER" }`

### Requirement: Get Period Payments

The system MUST provide an endpoint `GET /groups/:groupId/periods/:periodId/payments` that returns all non-deleted payments for a specific period. The system MUST only return payments where `periodId` matches the requested period. Each payment MUST include its `status` field (PENDING, ACCEPTED, REJECTED). The system MUST return HTTP 403 `{ code: "NOT_MEMBER" }` if the authenticated user is not an active group member, and HTTP 404 if the period does not exist or does not belong to the group.

#### Scenario: Get period payments returns only that period's data

- GIVEN STATIC group with period 1 (CLOSED, 2 payments) and period 2 (OPEN, 1 payment)
- WHEN member requests `GET /groups/:groupId/periods/1/payments`
- THEN system returns only the 2 payments from period 1, each including `status` field

#### Scenario: Non-member cannot access period payments

- GIVEN authenticated user is not member of group
- WHEN user requests `GET /groups/:groupId/periods/1/payments`
- THEN system returns HTTP 403 with `{ error: "User is not a group member", code: "NOT_MEMBER" }`
