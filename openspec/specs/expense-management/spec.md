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

### Requirement: COLLECTIVE Create Rejects Items Outside Participants

The system MUST reject `POST /expenses` for a COLLECTIVE expense if any entry in `items[]` has a `userId` not present in `participantIds`, with HTTP 400 `{ code: "INVALID_PARTICIPANTS" }`. The system MUST NOT create the expense or any `ExpenseItem`/`ExpenseSplit` rows for a rejected request. This closes the same money defect as "Orphaned item is excluded and flips status to MISMATCH" (see `Validate COLLECTIVE Status` below) at its other entry point: an orphan item can corrupt the split either by surviving past creation (handled there) or by being submitted inline at creation time (handled here) — rejecting at creation is preferred over silent exclusion so the orphan never exists to need cleanup later.

#### Scenario: Create COLLECTIVE expense with an item outside participantIds

- GIVEN a group with active members A, B, D
- WHEN a user submits `POST /expenses` with `{ amount: 150, splitType: "COLLECTIVE", participantIds: ["A","B"], items: [{userId:"A",amount:50},{userId:"B",amount:50},{userId:"D",amount:50}] }`
- THEN system returns HTTP 400 `{ code: "INVALID_PARTICIPANTS" }`; no expense, item, or split is created

### Requirement: Report Individual Item (COLLECTIVE)

The system MUST allow a participant to add (or update, via upsert) an individual item to a COLLECTIVE expense. A participant SHALL only add items for themselves. The system MUST reject any user not in `participantIds` with HTTP 403 `{ code: "NOT_PARTICIPANT" }`, unconditionally, before creating or updating the item — there is no legitimate non-participant case. This check MUST run in `reportItem` (`item-reporting.service.js`) regardless of whether the call creates a new item or updates an existing one. The system MUST return HTTP 404 `{ code: "EXPENSE_NOT_FOUND" }` if the expense is soft-deleted (`deletedAt !== null`). Each item SHALL have `description` (default "mi gasto") and `amount` (can be 0). The system MUST return HTTP 201 with the created item.

(Previously: no participant check — any authenticated user could report an item on any COLLECTIVE expense; no `deletedAt` check — a soft-deleted expense still accepted new items)

#### Scenario: Participant reports item

- GIVEN COLLECTIVE expense 1 with status PENDING and participant user 2
- WHEN user 2 submits `POST /expenses/1/items` with `{ description: "my plate", amount: 40 }`
- THEN system creates item linked to user 2 and expense 1

#### Scenario: Creator reports item with default description

- GIVEN COLLECTIVE expense 1 created by user 1
- WHEN user 1 submits `POST /expenses/1/items` with `{ amount: 30 }`
- THEN system creates item with description "mi gasto" linked to user 1

#### Scenario: Non-participant cannot add items

- GIVEN collective expense `E` with `participantIds = [A, B]`
- WHEN user `D` (not a participant) submits `POST /expenses/E/items`
- THEN system returns HTTP 403 `{ code: "NOT_PARTICIPANT" }`; no item is created

#### Scenario: Non-participant cannot update via upsert

- GIVEN collective expense `E` with `participantIds = [A, B]`, and `reportItem` is implemented as an upsert
- WHEN user `D` (not a participant) submits `POST /expenses/E/items` with `{ amount: 20 }`, which would otherwise upsert an item for `D`
- THEN system returns HTTP 403 `{ code: "NOT_PARTICIPANT" }` before the upsert runs; expense status is not recomputed

#### Scenario: Report item on a soft-deleted expense

- GIVEN COLLECTIVE expense 1 has been soft-deleted
- WHEN a former participant submits `POST /expenses/1/items`
- THEN system returns HTTP 404 `{ code: "EXPENSE_NOT_FOUND" }`

### Requirement: Update Individual Item (COLLECTIVE)

The system MUST allow a participant to update their own item. The system MUST reject any user not in the expense's `participantIds` with HTTP 403 `{ code: "NOT_PARTICIPANT" }`, checked before the item-ownership check. The system MUST return HTTP 404 `{ code: "EXPENSE_NOT_FOUND" }` if the expense is soft-deleted. The system MUST return HTTP 200 with the updated item on success. The system MUST return HTTP 403 if a participant tries to update another participant's item.

(Previously: checked item ownership only (`item.userId !== userId`); no participation check and no `deletedAt` check)

#### Scenario: Participant updates own item

- GIVEN user 2 has item on COLLECTIVE expense 1
- WHEN user 2 submits `PATCH /expenses/1/items/5` with `{ amount: 45 }`
- THEN system updates item amount to 45 and triggers status validation

#### Scenario: Participant tries to update other's item

- GIVEN user 2 has item 5, user 3 has item 6 on expense 1
- WHEN user 3 submits `PATCH /expenses/1/items/5` with `{ amount: 50 }`
- THEN system returns HTTP 403

#### Scenario: Departed participant cannot update their own orphaned item

- GIVEN user D has item 9 on expense 1, but D was later removed from `participantIds`
- WHEN D submits `PATCH /expenses/1/items/9`
- THEN system returns HTTP 403 `{ code: "NOT_PARTICIPANT" }`; the item remains, still excluded from `itemsSum`

#### Scenario: Update item on a soft-deleted expense

- GIVEN COLLECTIVE expense 1 has been soft-deleted
- WHEN its creator submits `PATCH /expenses/1/items/5`
- THEN system returns HTTP 404 `{ code: "EXPENSE_NOT_FOUND" }`

### Requirement: Delete Individual Item (COLLECTIVE)

The system MUST allow a participant to delete their own item. The system MUST reject any user not in the expense's `participantIds` with HTTP 403 `{ code: "NOT_PARTICIPANT" }`, checked before the item-ownership check. The system MUST return HTTP 404 `{ code: "EXPENSE_NOT_FOUND" }` if the expense is soft-deleted. The system MUST return HTTP 200 on success.

(Previously: checked item ownership only; no participation check and no `deletedAt` check)

#### Scenario: Participant deletes own item

- GIVEN user 2 has item 5 on COLLECTIVE expense 1
- WHEN user 2 submits `DELETE /expenses/1/items/5`
- THEN system deletes item and triggers status validation

#### Scenario: Departed participant cannot delete their own orphaned item

- GIVEN user D has item 9 on expense 1, but D was later removed from `participantIds`
- WHEN D submits `DELETE /expenses/1/items/9`
- THEN system returns HTTP 403 `{ code: "NOT_PARTICIPANT" }`; item remains, still corrupting nothing because it is excluded from `itemsSum`

### Requirement: Get Item Reporting Status

The system MUST return HTTP 404 `{ code: "EXPENSE_NOT_FOUND" }` from `getItemStatus` when the expense is soft-deleted (`deletedAt !== null`), consistent with every other item-reporting entry point.

#### Scenario: Status check on soft-deleted expense

- GIVEN COLLECTIVE expense 1 has been soft-deleted
- WHEN any user requests its item reporting status
- THEN system returns HTTP 404 `{ code: "EXPENSE_NOT_FOUND" }`

### Requirement: Validate COLLECTIVE Status

The system MUST validate COLLECTIVE status after every item mutation. The system SHALL calculate `sum(items belonging to a userId still present in participantIds) + sharedCosts`, excluding any item from a user no longer in `participantIds` ("orphaned" item). If the sum equals `total` (±0.01), status MUST become `COMPLETED` and `isLocked=true`; otherwise `MISMATCH`. On a soft-deleted expense, recompute MUST be inert (no state change, no throw).

(Previously: `itemsSum` counted ALL items regardless of current `participantIds`, so an orphaned item's amount could push the sum to match `total` and flip status to COMPLETED while `generateSplits` silently dropped that same item from the persisted splits)

#### Scenario: Items sum matches total

- GIVEN COLLECTIVE expense with total=150, sharedCosts=50, items=[30, 40, 30], all participants
- WHEN system validates status
- THEN sum(30+40+30) + 50 = 150 = total → status=COMPLETED, isLocked=true

#### Scenario: Items sum mismatches total

- GIVEN COLLECTIVE expense with total=150, sharedCosts=50, items=[30, 40, 20], all participants
- WHEN system validates status
- THEN sum(30+40+20) + 50 = 140 ≠ 150 → status=MISMATCH

#### Scenario: Orphaned item is excluded and flips status to MISMATCH

- GIVEN expense total=150, sharedCosts=0, `participantIds=[A,B]`, items A=50, B=50, and orphan D=50 (D no longer in `participantIds`)
- WHEN system recomputes status
- THEN `itemsSum` excludes D's 50 → 100 ≠ 150 → status=MISMATCH; no splits are generated that under-count the orphan's amount

#### Scenario: Recompute on soft-deleted expense is inert

- GIVEN a COLLECTIVE expense has been soft-deleted
- WHEN an internal recompute is triggered for it
- THEN no status, lock, or split change occurs; function returns without mutating

### Requirement: Generate Splits on COLLECTIVE Completion

The system MUST generate ExpenseSplit records when a COLLECTIVE expense reaches COMPLETED. Each participant's split SHALL equal their individual items + (sharedCosts / participantCount). The system MUST make these splits visible to balance calculations. The system MUST reject (HTTP 400 `{ code: "VALIDATION_ERROR" }`), not silently persist, if the generated splits do not sum to the expense's total (±0.01) — the same defense-in-depth guard `computeSplits` already applies to non-COLLECTIVE splits.

(Previously: no sum guard — a COLLECTIVE expense could reach COMPLETED with persisted splits that did not sum to the total)

#### Scenario: Generate splits on completion

- GIVEN COLLECTIVE expense COMPLETED with sharedCosts=60, participants=[1,2,3], items: user1=30, user2=40, user3=20
- WHEN system generates splits
- THEN splits created: user1 owes 30+(60/3)=50, user2 owes 40+20=60, user3 owes 20+20=40

#### Scenario: Mismatched generated splits are rejected, not persisted

- GIVEN `itemsSum`/status computation and split generation disagree on which items count (defense-in-depth case)
- WHEN the generated splits do not sum to the expense total within ±0.01
- THEN the mutation is rejected with HTTP 400 `{ code: "VALIDATION_ERROR" }` and no mismatched splits are persisted

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

The system MUST allow the expense creator or the group owner to delete an expense (`userId === expense.createdById OR userId === group.ownerId`). The frontend MUST show a confirmation dialog before deletion. The system MUST perform a soft delete (set `deletedAt` timestamp, not remove from DB). The system MUST reject deletion of a locked COLLECTIVE expense. The system MUST return HTTP 200 on success. The frontend MUST gate the delete control with this exact rule, via the same shared helper used for edit/unlock gating, so a payer who is not creator and not owner never sees the control. Historical data MUST remain visible to other group members after soft delete.

(Previously: hard delete with no confirmation or COLLECTIVE lock check; later, the frontend derived delete access from the same `isCreator = payerId===me || createdById===me` flag used for edit, over-granting the delete control to a payer who is not the creator)

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

#### Scenario: Payer who is not creator or owner no longer sees delete control

- GIVEN expense 1's payer is user 2; creator is user 1; group owner is user 3
- WHEN user 2 (payer only) views expense 1
- THEN the delete control is not rendered for user 2, matching backend's creator-or-owner rule

### Requirement: EQUAL Split Membership Validation

The system MUST validate every id in an explicitly-provided `participantIds` list against active group membership for EQUAL-split `createExpense` and `updateExpense`, rejecting a non-member with HTTP 400 `{ code: "INVALID_PARTICIPANTS" }` — the same check PERCENTAGE already performs, via one shared validator both branches call. This validation MUST run only when the caller explicitly supplies `participantIds`. When `updateExpense` reconstructs `participantIds` internally from persisted `ExpenseSplit` rows because the caller omitted the field, the system MUST NOT re-validate that reconstructed set.

#### Scenario: Explicit non-member rejected on create

- GIVEN group 1's active members are [1,2,3]
- WHEN user 1 submits an EQUAL expense with `participantIds: [1,2,4]` (4 not a member)
- THEN system returns HTTP 400 `{ code: "INVALID_PARTICIPANTS" }`

#### Scenario: Explicit non-member rejected on update

- GIVEN EQUAL expense 1 exists; user 4 is not an active member of its group
- WHEN payer submits `PUT /expenses/1` with `{ participantIds: [1,2,4] }`
- THEN system returns HTTP 400 `{ code: "INVALID_PARTICIPANTS" }`

#### Scenario: Reconstructed fallback for a departed member still succeeds

- GIVEN EQUAL expense 1 was created with participants [1,2]; user 2 has since left the group; persisted splits still reference user 2
- WHEN payer submits `PUT /expenses/1` with `{ amount: 200 }` (no `participantIds` in body)
- THEN `updateExpense` reconstructs `participantIds` from persisted splits without re-validating against current membership, and the update succeeds

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

### Requirement: Percentage Splits Sum Exactly to Total

The system MUST ensure `calculatePercentageSplits` output sums exactly to `totalAmount`, with no cent lost or gained to independent per-share rounding. The system SHALL distribute each participant's rounded share except the last, and the last participant in the input order MUST absorb the remainder (`totalAmount` minus the sum of all preceding rounded shares), mirroring `calculateEqualSplits`. This fix MUST be applied identically in `apps/backend/src/utils/splits.js` and `apps/frontend/src/utils/splits.js`.

#### Scenario: Non-equal percentages sum exactly to total

- GIVEN `totalAmount = 10` and percentages `{ A: 33.33, B: 33.33, C: 33.34 }`
- WHEN `calculatePercentageSplits` runs on backend and on frontend
- THEN both return shares `[3.33, 3.33, 3.34]` summing to exactly `10.00`, with no 9.99 shortfall

#### Scenario: Backend and frontend splits.js produce identical output

- GIVEN the same `totalAmount` and percentage set
- WHEN `calculatePercentageSplits` is called in both `apps/backend/src/utils/splits.js` and `apps/frontend/src/utils/splits.js`
- THEN both return byte-identical amounts for every participant

### Requirement: Splits Re-Validated After Participant Filtering

The system MUST re-validate (or re-derive) the computed split set in `computeSplits` after filtering by `participantIds`, so a filtered subset can never silently fail to sum to `totalAmount`. If the filtered splits do not sum to `totalAmount` within the existing rounding tolerance, the system MUST reject with HTTP 400 `{ error: "Split amounts must sum to expense amount", code: "VALIDATION_ERROR" }` rather than persisting a mismatched set.

#### Scenario: Filtered split subset still sums to total

- GIVEN an EXACT-split expense with splits for users [1,2,3] summing to the total, and `participantIds = [1,2]`
- WHEN `computeSplits` filters to the provided `participantIds`
- THEN the system re-validates the filtered set and rejects if it no longer sums to `totalAmount`, instead of silently persisting an incomplete split set

### Requirement: PERCENTAGE Splits Reconstruction Treats Empty Array as Omitted

The system MUST treat `splits: []` the same as an omitted `splits` field when `updateExpense` decides whether to reconstruct PERCENTAGE splits from persisted data, mirroring the existing `participantIds` omitted-or-empty normalization. The `effectiveSplitType !== 'EQUAL'` optimization gate MUST remain unaffected.

#### Scenario: Empty splits array on PERCENTAGE update reconstructs instead of failing

- GIVEN PERCENTAGE expense 1 with persisted splits for [1,2]
- WHEN payer submits `PUT /expenses/1` with `{ amount: 300, splits: [] }`
- THEN system reconstructs percentages from persisted splits and returns HTTP 200, instead of `INVALID_SPLITS` 400

#### Scenario: EQUAL update with empty splits array is unaffected

- GIVEN EQUAL expense 1
- WHEN payer submits `PUT /expenses/1` with `{ amount: 300, splits: [] }`
- THEN the PERCENTAGE reconstruction query pair does not run; the update proceeds via `participantIds`-driven recomputation only

### Requirement: Lock Expense on Completion

The system MUST set `isLocked=true` when expense reaches COMPLETED status (for any split type). The system MUST prevent item modifications on locked expenses.

#### Scenario: Attempt to modify locked expense

- GIVEN COLLECTIVE expense with isLocked=true
- WHEN user submits `POST /expenses/1/items`
- THEN system returns HTTP 409 with error "Expense is locked"

### Requirement: Unlock Expense (COLLECTIVE)

The system MUST allow only the expense creator to unlock a COMPLETED COLLECTIVE expense (`userId === expense.createdById`), matching backend's existing creator-only rule. The frontend MUST gate the unlock control with that exact rule, via the same shared helper used for edit/delete gating. A refused unlock (HTTP 403) MUST be surfaced to the user, not swallowed silently.

#### Scenario: Creator unlocks a COMPLETED COLLECTIVE expense

- GIVEN COLLECTIVE expense 1, COMPLETED, isLocked=true, created by user 1
- WHEN user 1 clicks unlock
- THEN backend resets status to PENDING, isLocked=false, deletes existing splits, returns HTTP 200

#### Scenario: Payer who is not creator does not see unlock control

- GIVEN COLLECTIVE expense 1, COMPLETED, isLocked=true, payer is user 2, creator is user 1
- WHEN user 2 views the expense
- THEN the unlock control is not rendered for user 2

#### Scenario: Refused unlock surfaces a visible error

- GIVEN a stale UI state lets a non-creator trigger unlock
- WHEN backend returns HTTP 403 FORBIDDEN
- THEN the frontend displays a visible error; no bare `catch {}` swallows it

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
