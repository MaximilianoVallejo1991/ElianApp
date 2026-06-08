# Expense Management Specification

## Purpose

Handles expense creation, listing, editing, and deletion within a group. Supports multiple split types and validates all business rules before persisting.

## Requirements

### Requirement: Create Expense

The system MUST allow authenticated group members to create expenses. The system SHALL require `amount` (positive number), `description` (non-empty string), `category` (enum: FOOD, TRANSPORT, HOUSING, ENTERTAINMENT, OTHER), `payerId` (must be group member), `splitType` (enum: EQUAL, EXACT, PERCENTAGE), and `splits` (array with one entry per group member). The system MUST compute split amounts based on `splitType`.

For EQUAL split: each member receives `amount / active_member_count`.
For EXACT split: each `splits[].amount` must sum to `amount`.
For PERCENTAGE split: each `splits[].percentage` must sum to 100.

The system MUST return HTTP 201 with created expense including all splits.

#### Scenario: Create expense with EQUAL split

- GIVEN authenticated user is member of group with 3 members
- WHEN user submits `POST /groups/1/expenses` with `{ amount: 90, description: "Dinner", category: "FOOD", payerId: 1, splitType: "EQUAL", splits: [{userId: 1}, {userId: 2}, {userId: 3}] }`
- THEN system creates expense with amount 90, splits `[30, 30, 30]` for users `[1, 2, 3]`, returns HTTP 201

#### Scenario: Create expense with EXACT split

- GIVEN authenticated user is member of group with 2 members
- WHEN user submits `POST /groups/1/expenses` with `{ amount: 100, description: "Taxi", category: "TRANSPORT", payerId: 1, splitType: "EXACT", splits: [{userId: 1, amount: 40}, {userId: 2, amount: 60}] }`
- THEN system creates expense, returns HTTP 201

#### Scenario: Create expense with PERCENTAGE split

- GIVEN authenticated user is member of group with 2 members
- WHEN user submits `POST /groups/1/expenses` with `{ amount: 100, description: "Groceries", category: "HOUSING", payerId: 1, splitType: "PERCENTAGE", splits: [{userId: 1, percentage: 60}, {userId: 2, percentage: 40}] }`
- THEN system creates expense with splits `[60, 40]`, returns HTTP 201

#### Scenario: EXACT splits do not sum to total

- GIVEN authenticated user is member of group
- WHEN user submits expense with EXACT split where amounts sum to 80 but amount is 100
- THEN system returns HTTP 400 with `{ error: "Split amounts must sum to expense amount", code: "VALIDATION_ERROR" }`

#### Scenario: PERCENTAGE splits do not sum to 100

- GIVEN authenticated user is member of group
- WHEN user submits expense with PERCENTAGE split where percentages sum to 90
- THEN system returns HTTP 400 with `{ error: "Split percentages must sum to 100", code: "VALIDATION_ERROR" }`

#### Scenario: Payer is not group member

- GIVEN authenticated user is member of group
- WHEN user submits expense with `payerId` not in group members
- THEN system returns HTTP 400 with `{ error: "Payer must be group member", code: "VALIDATION_ERROR" }`

### Requirement: List Group Expenses

The system MUST return all expenses in a group ordered by `createdAt` descending. The system MUST return only expenses for groups where authenticated user is a member.

#### Scenario: List expenses

- GIVEN authenticated user is member of group with 2 expenses
- WHEN user requests `GET /groups/1/expenses`
- THEN system returns HTTP 200 with `[{ id, amount, description, category, payerId, splitType, createdAt }, ...]`

#### Scenario: Non-member cannot list expenses

- GIVEN authenticated user is not member of group 1
- WHEN user requests `GET /groups/1/expenses`
- THEN system returns HTTP 404 with `{ error: "Group not found", code: "NOT_FOUND" }`

### Requirement: Get Expense Details

The system MUST allow group members to view a single expense with all splits populated.

#### Scenario: Get expense with splits

- GIVEN authenticated user is member of group containing expense 1
- WHEN user requests `GET /groups/1/expenses/1`
- THEN system returns HTTP 200 with `{ id, amount, description, category, payerId, splits: [{userId, amount, percentage}], createdAt }`

### Requirement: Edit Expense

The system MUST allow only the payer or creator to edit an expense. The system MUST allow updating `amount`, `description`, `category`, `splitType`, and `splits`. The system MUST return HTTP 200 with updated expense.

#### Scenario: Payer edits expense

- GIVEN authenticated user is payer of expense 1 in group
- WHEN user submits `PUT /groups/1/expenses/1` with `{ amount: 150, description: "Updated dinner" }`
- THEN system updates expense, returns HTTP 200

#### Scenario: Non-payer/creator edits expense

- GIVEN authenticated user is member but not payer or creator of expense 1
- WHEN user submits `PUT /groups/1/expenses/1` with `{ amount: 200 }`
- THEN system returns HTTP 403 with `{ error: "Only payer or creator can edit expense", code: "FORBIDDEN" }`

### Requirement: Delete Expense

The system MUST allow only the payer or creator to delete an expense. The system MUST return HTTP 200 on success.

#### Scenario: Payer deletes expense

- GIVEN authenticated user is payer of expense 1
- WHEN user submits `DELETE /groups/1/expenses/1`
- THEN system deletes expense and its splits, returns HTTP 200

#### Scenario: Non-payer/creator deletes expense

- GIVEN authenticated user is member but not payer or creator of expense 1
- WHEN user submits `DELETE /groups/1/expenses/1`
- THEN system returns HTTP 403 with `{ error: "Only payer or creator can delete expense", code: "FORBIDDEN" }`