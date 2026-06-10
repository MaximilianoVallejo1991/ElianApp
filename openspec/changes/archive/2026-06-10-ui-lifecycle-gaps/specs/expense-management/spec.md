# Delta for Expense Management

## MODIFIED Requirements

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