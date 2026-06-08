# Collective Expense Management Specification

## Purpose

Manage collective expenses where a group shares costs equally and each participant reports individual items. The system verifies that reported items plus shared costs sum to the declared total.

## Requirements

### Requirement: Collective Expense Creation

The system MUST allow a group creator to create a collective expense with a total amount, shared costs, and a list of participant IDs. Only ACTIVE group members SHALL be eligible as participants.

- GIVEN a group with ACTIVE membership
- WHEN the creator submits a collective expense with `total`, `sharedCosts`, and `participantIds`
- THEN the system SHALL create a `CollectiveExpense` with status `PENDING`
- AND all listed participants MUST be ACTIVE group members
- AND the creator MUST be included in the participant list

#### Scenario: Creator creates collective expense with valid participants

- GIVEN group `G` has members `[A, B, C]` all with status `ACTIVE`
- WHEN user `A` creates collective expense `{ total: 100.00, sharedCosts: 30.00, participantIds: [A, B, C] }`
- THEN collective expense `E` is created with `status: PENDING`
- AND `E.groupId = G`, `E.creatorId = A`

#### Scenario: Creator cannot add INACTIVE members as participants

- GIVEN group `G` has members `[A, B]` with `A: ACTIVE`, `B: INACTIVE`
- WHEN user `A` creates collective expense `{ participantIds: [A, B] }`
- THEN the system SHALL return error `NOT_PARTICIPANT`

### Requirement: List Collective Expenses

The system SHALL list all collective expenses in a group, regardless of verification status.

- GIVEN a group with multiple collective expenses in various states
- WHEN a user requests the group's collective expenses
- THEN the system SHALL return all expenses with `status` in `[PENDING, MATCH, MISMATCH, COMPLETED]`

#### Scenario: List returns all verification states

- GIVEN group `G` has expenses in states `PENDING`, `MATCH`, `MISMATCH`
- WHEN user requests `GET /groups/G/collective-expenses`
- THEN all three expenses are returned with their respective statuses

### Requirement: Get Collective Expense Details

The system MUST return a collective expense with all reported individual items and computed verification status.

- GIVEN a collective expense exists
- WHEN a user requests the expense details
- THEN the response SHALL include `total`, `sharedCosts`, `participantIds`, `status`, and all `IndividualItem` records

#### Scenario: Get includes all individual items

- GIVEN collective expense `E` has items from participants `A`, `B`, `C`
- WHEN user requests `GET /groups/G/collective-expenses/E.id`
- THEN response includes all three IndividualItems with amounts

### Requirement: Update Collective Expense

The system SHALL allow only the creator to update a collective expense, and only when no individual items have been reported.

- GIVEN a collective expense with no IndividualItems yet reported
- WHEN the creator updates `total`, `sharedCosts`, or `participantIds`
- THEN the expense SHALL be updated
- AND the status SHALL remain `PENDING`

#### Scenario: Creator can update before items reported

- GIVEN collective expense `E` created by `A` with no items
- WHEN `A` updates `{ total: 150.00 }`
- THEN `E.total = 150.00`

#### Scenario: Cannot update after items reported

- GIVEN collective expense `E` has at least one IndividualItem
- WHEN the creator attempts to update the expense
- THEN the system SHALL return error `CANNOT_UPDATE_AFTER_ITEMS`

### Requirement: Delete Collective Expense

The system SHALL allow only the creator to delete a collective expense, and only if no individual items have been reported.

- GIVEN a collective expense with no IndividualItems
- WHEN the creator requests deletion
- THEN the expense and all associated items SHALL be removed
- AND the system SHALL return `204 No Content`

#### Scenario: Creator can delete before items reported

- GIVEN collective expense `E` created by `A` with no items
- WHEN `A` deletes `E`
- THEN `E` is removed from database

#### Scenario: Cannot delete after items reported

- GIVEN collective expense `E` has at least one IndividualItem
- WHEN the creator attempts to delete `E`
- THEN the system SHALL return error `CANNOT_DELETE_WITH_ITEMS`