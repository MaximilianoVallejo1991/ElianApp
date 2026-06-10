# Expense Management Specification

## Purpose

Manages expense lifecycle for all split types: EQUAL, EXACT, PERCENTAGE, and COLLECTIVE. Handles creation, item reporting, status transitions, and split generation. Replaces the separate CollectiveExpense and IndividualItem flows with a unified model.

## Requirements

### Requirement: Create Expense

The system MUST allow group members to create expenses with any split type (EQUAL, EXACT, PERCENTAGE, COLLECTIVE). The system SHALL require `description`, `total`, `splitType`, and `participantIds`. For COLLECTIVE expenses, the system MUST set `status=PENDING` and `isLocked=false` initially. For EXACT splits, each `splits[].amount` must sum to `total`. The system MUST return HTTP 201 with the created expense.

#### Scenario: Create EQUAL expense

- GIVEN authenticated user is member of group 1
- WHEN user submits `POST /groups/1/expenses` with `{ description: "Lunch", total: 100, splitType: "EQUAL", participantIds: [1, 2, 3] }`
- THEN system creates expense with status COMPLETED and generates 3 equal splits (~33.33 each)

#### Scenario: Create PERCENTAGE expense

- GIVEN authenticated user is member of group 1
- WHEN user submits `POST /groups/1/expenses` with `{ description: "Dinner", total: 200, splitType: "PERCENTAGE", participantIds: [1, 2], percentages: { 1: 60, 2: 40 } }`
- THEN system creates expense with status COMPLETED and generates splits: user 1 owes 120, user 2 owes 80

#### Scenario: Create expense with EXACT split

- GIVEN authenticated user is member of group with 2 members
- WHEN user submits `POST /groups/1/expenses` with `{ description: "Taxi", total: 100, splitType: "EXACT", participantIds: [1, 2], splits: [{userId: 1, amount: 40}, {userId: 2, amount: 60}] }`
- THEN system creates expense with status COMPLETED and generates splits: user 1 owes 40, user 2 owes 60

#### Scenario: EXACT splits do not sum to total

- GIVEN authenticated user is member of group
- WHEN user submits expense with EXACT split where amounts sum to 80 but total is 100
- THEN system returns HTTP 400 with `{ error: "Split amounts must sum to expense amount", code: "VALIDATION_ERROR" }`

#### Scenario: Payer is not group member

- GIVEN authenticated user is member of group
- WHEN user submits expense with `payerId` not in group members
- THEN system returns HTTP 400 with `{ error: "Payer must be group member", code: "VALIDATION_ERROR" }`

#### Scenario: Create COLLECTIVE expense

- GIVEN authenticated user is member of group 1
- WHEN user submits `POST /groups/1/expenses` with `{ description: "Group dinner", total: 150, splitType: "COLLECTIVE", participantIds: [1, 2, 3], sharedCosts: 50 }`
- THEN system creates expense with status PENDING, isLocked=false, and no ExpenseSplit records

### Requirement: Report Individual Item (COLLECTIVE)

The system MUST allow all participants (including creator) to report their individual items for COLLECTIVE expenses. Each item SHALL have `description` (default "mi gasto") and `amount` (can be 0). The system MUST return HTTP 201 with the created item.

#### Scenario: Participant reports item

- GIVEN COLLECTIVE expense 1 with status PENDING and participant user 2
- WHEN user 2 submits `POST /expenses/1/items` with `{ description: "my plate", amount: 40 }`
- THEN system creates item linked to user 2 and expense 1

#### Scenario: Creator reports item with default description

- GIVEN COLLECTIVE expense 1 created by user 1
- WHEN user 1 submits `POST /expenses/1/items` with `{ amount: 30 }`
- THEN system creates item with description "mi gasto" linked to user 1

### Requirement: Update Individual Item (COLLECTIVE)

The system MUST allow participants to update their own items. The system MUST return HTTP 200 with updated item. The system MUST return HTTP 403 if user tries to update another participant's item.

#### Scenario: Participant updates own item

- GIVEN user 2 has item on COLLECTIVE expense 1
- WHEN user 2 submits `PATCH /expenses/1/items/5` with `{ amount: 45 }`
- THEN system updates item amount to 45 and triggers status validation

#### Scenario: Participant tries to update other's item

- GIVEN user 2 has item 5, user 3 has item 6 on expense 1
- WHEN user 3 submits `PATCH /expenses/1/items/5` with `{ amount: 50 }`
- THEN system returns HTTP 403

### Requirement: Delete Individual Item (COLLECTIVE)

The system MUST allow participants to delete their own items. The system MUST return HTTP 200 on success.

#### Scenario: Participant deletes own item

- GIVEN user 2 has item 5 on COLLECTIVE expense 1
- WHEN user 2 submits `DELETE /expenses/1/items/5`
- THEN system deletes item and triggers status validation

### Requirement: Validate COLLECTIVE Status

The system MUST validate COLLECTIVE status after every item mutation. The system SHALL calculate `sum(items) + sharedCosts`. If the sum equals `total` (within ±0.01 tolerance), the system MUST set `status=COMPLETED` and `isLocked=true`. If mismatch, the system MUST set `status=MISMATCH`.

#### Scenario: Items sum matches total

- GIVEN COLLECTIVE expense with total=150, sharedCosts=50, items=[30, 40, 30]
- WHEN system validates status
- THEN sum(30+40+30) + 50 = 150 = total → status=COMPLETED, isLocked=true

#### Scenario: Items sum mismatches total

- GIVEN COLLECTIVE expense with total=150, sharedCosts=50, items=[30, 40, 20]
- WHEN system validates status
- THEN sum(30+40+20) + 50 = 140 ≠ 150 → status=MISMATCH

### Requirement: Generate Splits on COLLECTIVE Completion

The system MUST generate ExpenseSplit records when COLLECTIVE expense reaches COMPLETED. Each participant's split SHALL equal their individual items + (sharedCosts / participantCount). The system MUST make these splits visible to balance calculations.

#### Scenario: Generate splits on completion

- GIVEN COLLECTIVE expense COMPLETED with sharedCosts=60, participants=[1,2,3], items: user1=30, user2=40, user3=20
- WHEN system generates splits
- THEN splits created: user1 owes 30+(60/3)=50, user2 owes 40+20=60, user3 owes 20+20=40

### Requirement: Get Expense Details

The system MUST allow group members to view a single expense with all splits populated. The system MUST return HTTP 200 with full expense including all split records.

#### Scenario: Get expense with splits

- GIVEN authenticated user is member of group containing expense 1
- WHEN user requests `GET /groups/1/expenses/1`
- THEN system returns HTTP 200 with `{ id, total, description, category, splitType, status, splits: [{userId, amount, percentage}], createdAt }`

#### Scenario: Non-member cannot get expense

- GIVEN authenticated user is not member of the group
- WHEN user requests `GET /groups/1/expenses/1`
- THEN system returns HTTP 404

### Requirement: Edit Expense

The system MUST allow only the payer or creator to edit an expense. The frontend MUST provide edit mode in ExpenseForm with pre-filled data. The frontend MUST submit changes via `PUT /groups/:groupId/expenses/:id`. The system MUST recalculate all splits when total or splitType changes. The system MUST return HTTP 200 with updated expense. The system MUST return HTTP 403 if non-payer/creator attempts edit. The frontend MUST show edit controls only to the payer or creator.

(Previously: Backend-only edit with no frontend edit mode or split recalculation requirement)

#### Scenario: Payer edits amount and splits recalculated

- GIVEN authenticated user is payer of EQUAL expense 1 (total: 100, 3 participants)
- WHEN user opens ExpenseForm in edit mode, changes total to 150, and submits
- THEN frontend calls `PUT /groups/1/expenses/1` with `{ total: 150 }`, backend recalculates splits (~50 each), returns HTTP 200

#### Scenario: Non-payer/creator edit rejected

- GIVEN authenticated user is member but not payer or creator of expense 1, viewing GroupDetailPage
- WHEN page renders
- THEN edit button is not visible for this user; backend returns HTTP 403 if attempted

#### Scenario: Non-payer/creator edits expense

- GIVEN authenticated user is member but not payer or creator of expense 1
- WHEN user submits `PUT /groups/1/expenses/1` with `{ total: 200 }`
- THEN system returns HTTP 403 with `{ error: "Only payer or creator can edit expense", code: "FORBIDDEN" }`

### Requirement: Delete Expense

The system MUST allow the expense creator or the group owner to delete an expense (`userId === expense.createdById OR userId === group.ownerId`). The frontend MUST show a confirmation dialog before deletion. The system MUST perform a soft delete (set `deletedAt` timestamp, not remove from DB). The system MUST reject deletion of a locked COLLECTIVE expense. The system MUST return HTTP 200 on success. The frontend MUST show delete controls only to the creator or group owner. Historical data MUST remain visible to other group members after soft delete.

(Previously: Only the creator could delete; hard delete with no confirmation, no COLLECTIVE lock check)

#### Scenario: Creator deletes expense with confirmation

- GIVEN authenticated user is creator of expense 1
- WHEN creator clicks delete, confirmation dialog appears, creator confirms
- THEN frontend calls `DELETE /groups/1/expenses/1`, backend soft-deletes expense (`deletedAt` set), returns HTTP 200

#### Scenario: Group owner deletes any expense

- GIVEN authenticated user is owner of group 1, expense 1 was created by another user (user 2)
- WHEN owner clicks delete on expense 1, confirmation dialog appears, owner confirms
- THEN frontend calls `DELETE /groups/1/expenses/1`, backend soft-deletes expense, returns HTTP 200

#### Scenario: Delete locked COLLECTIVE expense fails

- GIVEN COLLECTIVE expense 1 with `isLocked=true`
- WHEN creator submits `DELETE /groups/1/expenses/1`
- THEN system returns HTTP 409 with `{ error: "Cannot delete locked expense", code: "LOCKED" }`

#### Scenario: Delete expense with existing items

- GIVEN COLLECTIVE expense 1 with status PENDING and 2 reported items
- WHEN creator submits `DELETE /groups/1/expenses/1`
- THEN system soft-deletes expense and all associated items, returns HTTP 200

#### Scenario: Non-creator non-owner delete rejected

- GIVEN authenticated user is member but not creator or group owner of expense 1
- WHEN user submits `DELETE /groups/1/expenses/1`
- THEN system returns HTTP 403 with `{ error: "Only creator or group owner can delete expense", code: "FORBIDDEN" }`

#### Scenario: Soft-deleted expense preserved for other members

- GIVEN expense 1 has been soft-deleted by the creator
- WHEN other group members view group expenses
- THEN the deleted expense remains in DB with `deletedAt` set; it is excluded from active expense listings but preserved as historical data

### Requirement: PERCENTAGE Split Validation

The system MUST validate that percentage values are valid numbers (0-100). The system SHALL allow 0% and 100% for individual participants. The system MUST reject if sum of all percentages does not equal exactly 100%.

#### Scenario: Valid percentages summing to 100

- GIVEN PERCENTAGE expense with participants [1,2,3]
- WHEN user submits percentages {1: 50, 2: 30, 3: 20}
- THEN system accepts (50+30+20=100)

#### Scenario: Individual 0% allowed

- GIVEN PERCENTAGE expense with participants [1,2]
- WHEN user submits percentages {1: 100, 2: 0}
- THEN system accepts (user 2 pays nothing)

#### Scenario: Invalid percentages sum

- GIVEN PERCENTAGE expense with participants [1,2]
- WHEN user submits percentages {1: 60, 2: 50}
- THEN system rejects (60+50=110 ≠ 100)

### Requirement: Lock Expense on Completion

The system MUST set `isLocked=true` when expense reaches COMPLETED status (for any split type). The system MUST prevent item modifications on locked expenses.

#### Scenario: Attempt to modify locked expense

- GIVEN COLLECTIVE expense with isLocked=true
- WHEN user submits `POST /expenses/1/items`
- THEN system returns HTTP 409 with error "Expense is locked"

### Requirement: List Group Expenses

The system MUST return all expenses for a group, including their status and split type. The system SHALL include COLLECTIVE expenses regardless of status.

#### Scenario: List expenses with mixed types

- GIVEN group 1 has EQUAL expense (COMPLETED), COLLECTIVE expense (PENDING), PERCENTAGE expense (COMPLETED)
- WHEN user requests `GET /groups/1/expenses`
- THEN system returns all 3 expenses with their respective statuses

#### Scenario: Non-member cannot list expenses

- GIVEN authenticated user is not member of group 1
- WHEN user requests `GET /groups/1/expenses`
- THEN system returns HTTP 404 with `{ error: "Group not found", code: "NOT_FOUND" }`
