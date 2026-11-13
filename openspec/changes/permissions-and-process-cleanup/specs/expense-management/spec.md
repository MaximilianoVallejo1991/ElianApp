# Delta for Expense Management

## ADDED Requirements

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

### Requirement: Get Item Reporting Status

The system MUST return HTTP 404 `{ code: "EXPENSE_NOT_FOUND" }` from `getItemStatus` when the expense is soft-deleted (`deletedAt !== null`), consistent with every other item-reporting entry point.

#### Scenario: Status check on soft-deleted expense

- GIVEN COLLECTIVE expense 1 has been soft-deleted
- WHEN any user requests its item reporting status
- THEN system returns HTTP 404 `{ code: "EXPENSE_NOT_FOUND" }`

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

### Requirement: COLLECTIVE Create Rejects Items Outside Participants

The system MUST reject `POST /expenses` for a COLLECTIVE expense if any entry in `items[]` has a `userId` not present in `participantIds`, with HTTP 400 `{ code: "INVALID_PARTICIPANTS" }`. The system MUST NOT create the expense or any `ExpenseItem`/`ExpenseSplit` rows for a rejected request. This closes the same money defect as "Orphaned item is excluded and flips status to MISMATCH" (see `Validate COLLECTIVE Status` below) at its other entry point: an orphan item can corrupt the split either by surviving past creation (handled there) or by being submitted inline at creation time (handled here) — rejecting at creation is preferred over silent exclusion so the orphan never exists to need cleanup later.

#### Scenario: Create COLLECTIVE expense with an item outside participantIds

- GIVEN a group with active members A, B, D
- WHEN a user submits `POST /expenses` with `{ amount: 150, splitType: "COLLECTIVE", participantIds: ["A","B"], items: [{userId:"A",amount:50},{userId:"B",amount:50},{userId:"D",amount:50}] }`
- THEN system returns HTTP 400 `{ code: "INVALID_PARTICIPANTS" }`; no expense, item, or split is created

## MODIFIED Requirements

### Requirement: Delete Expense

The system MUST allow the expense creator or the group owner to delete an expense (`userId === expense.createdById OR userId === group.ownerId`). The frontend MUST show a confirmation dialog before deletion. The system MUST perform a soft delete (set `deletedAt` timestamp, not remove from DB). The system MUST reject deletion of a locked COLLECTIVE expense. The system MUST return HTTP 200 on success. The frontend MUST gate the delete control with this exact rule, via the same shared helper used for edit/unlock gating, so a payer who is not creator and not owner never sees the control. Historical data MUST remain visible to other group members after soft delete.

(Previously: frontend derived delete access from the same `isCreator = payerId===me || createdById===me` flag used for edit, over-granting the delete control to a payer who is not the creator)

#### Scenario: Creator deletes expense with confirmation

- GIVEN authenticated user is creator of expense 1
- WHEN creator clicks delete, confirmation dialog appears, creator confirms
- THEN frontend calls `DELETE /groups/1/expenses/1`, backend soft-deletes expense, returns HTTP 200

#### Scenario: Group owner deletes any expense

- GIVEN authenticated user is owner of group 1, expense 1 created by user 2
- WHEN owner clicks delete, confirms
- THEN frontend calls `DELETE /groups/1/expenses/1`, backend soft-deletes expense, returns HTTP 200

#### Scenario: Delete locked COLLECTIVE expense fails

- GIVEN COLLECTIVE expense 1 with `isLocked=true`
- WHEN creator submits `DELETE /groups/1/expenses/1`
- THEN system returns HTTP 409 `{ code: "LOCKED" }`

#### Scenario: Delete expense with existing items

- GIVEN COLLECTIVE expense 1 with status PENDING and 2 reported items
- WHEN creator submits `DELETE /groups/1/expenses/1`
- THEN system soft-deletes expense and associated items, returns HTTP 200

#### Scenario: Non-creator non-owner delete rejected

- GIVEN authenticated user is member but not creator or group owner of expense 1
- WHEN user submits `DELETE /groups/1/expenses/1`
- THEN system returns HTTP 403 `{ code: "FORBIDDEN" }`

#### Scenario: Soft-deleted expense preserved for other members

- GIVEN expense 1 has been soft-deleted
- WHEN other group members view group expenses
- THEN deleted expense is excluded from active listings but preserved as historical data

#### Scenario: Payer who is not creator or owner no longer sees delete control

- GIVEN expense 1's payer is user 2; creator is user 1; group owner is user 3
- WHEN user 2 (payer only) views expense 1
- THEN the delete control is not rendered for user 2, matching backend's creator-or-owner rule

### Requirement: Report Individual Item (COLLECTIVE)

The system MUST allow a participant to add (or update, via upsert) an individual item to a COLLECTIVE expense. A participant SHALL only add items for themselves. The system MUST reject any user not in `participantIds` with HTTP 403 `{ code: "NOT_PARTICIPANT" }`, unconditionally, before creating or updating the item. The system MUST return HTTP 404 `{ code: "EXPENSE_NOT_FOUND" }` if the expense is soft-deleted (`deletedAt !== null`). Each item SHALL have `description` (default "mi gasto") and `amount` (can be 0). The system MUST return HTTP 201 on success.

(Previously: no `deletedAt` check — a soft-deleted expense still accepted new items)

#### Scenario: Participant reports item

- GIVEN COLLECTIVE expense 1 with status PENDING and participant user 2
- WHEN user 2 submits `POST /expenses/1/items` with `{ description: "my plate", amount: 40 }`
- THEN system creates item linked to user 2 and expense 1

#### Scenario: Non-participant cannot add items

- GIVEN collective expense E with `participantIds = [A, B]`
- WHEN user D (not a participant) submits `POST /expenses/E/items`
- THEN system returns HTTP 403 `{ code: "NOT_PARTICIPANT" }`; no item is created

#### Scenario: Report item on a soft-deleted expense

- GIVEN COLLECTIVE expense 1 has been soft-deleted
- WHEN a former participant submits `POST /expenses/1/items`
- THEN system returns HTTP 404 `{ code: "EXPENSE_NOT_FOUND" }`

### Requirement: Update Individual Item (COLLECTIVE)

The system MUST allow a participant to update their own item. The system MUST reject any user not in the expense's `participantIds` with HTTP 403 `{ code: "NOT_PARTICIPANT" }`, checked before the item-ownership check. The system MUST return HTTP 404 `{ code: "EXPENSE_NOT_FOUND" }` if the expense is soft-deleted. The system MUST return HTTP 200 with the updated item on success.

(Previously: checked item ownership only (`item.userId !== userId`); no participation check and no `deletedAt` check)

#### Scenario: Participant updates own item

- GIVEN user 2 has item on COLLECTIVE expense 1
- WHEN user 2 submits `PATCH /expenses/1/items/5` with `{ amount: 45 }`
- THEN system updates item amount to 45 and triggers status validation

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

### Requirement: Validate COLLECTIVE Status

The system MUST validate COLLECTIVE status after every item mutation. The system SHALL calculate `sum(items belonging to a userId still present in participantIds) + sharedCosts`, excluding any item from a user no longer in `participantIds` ("orphaned" item). If the sum equals `total` (±0.01), status MUST become `COMPLETED` and `isLocked=true`; otherwise `MISMATCH`. On a soft-deleted expense, recompute MUST be inert (no state change, no throw).

(Previously: `itemsSum` counted ALL items regardless of current `participantIds`, so an orphaned item's amount could push the sum to match `total` and flip status to COMPLETED while `generateSplits` silently dropped that same item from the persisted splits)

#### Scenario: Items sum matches total

- GIVEN COLLECTIVE expense total=150, sharedCosts=50, items=[30,40,30], all participants
- WHEN system validates status
- THEN sum(30+40+30)+50=150=total → status=COMPLETED, isLocked=true

#### Scenario: Orphaned item is excluded and flips status to MISMATCH

- GIVEN expense total=150, sharedCosts=0, `participantIds=[A,B]`, items A=50, B=50, and orphan D=50 (D no longer in `participantIds`)
- WHEN system recomputes status
- THEN `itemsSum` excludes D's 50 → 100 ≠ 150 → status=MISMATCH; no splits are generated that under-count the orphan's amount

#### Scenario: Recompute on soft-deleted expense is inert

- GIVEN a COLLECTIVE expense has been soft-deleted
- WHEN an internal recompute is triggered for it
- THEN no status, lock, or split change occurs; function returns without mutating

### Requirement: Generate Splits on COLLECTIVE Completion

The system MUST generate ExpenseSplit records when a COLLECTIVE expense reaches COMPLETED. Each participant's split SHALL equal their individual items + (sharedCosts / participantCount). The system MUST reject (HTTP 400 `{ code: "VALIDATION_ERROR" }`), not silently persist, if the generated splits do not sum to the expense's total (±0.01) — the same defense-in-depth guard `computeSplits` already applies to non-COLLECTIVE splits.

(Previously: no sum guard — a COLLECTIVE expense could reach COMPLETED with persisted splits that did not sum to the total)

#### Scenario: Generate splits on completion

- GIVEN COLLECTIVE expense COMPLETED, sharedCosts=60, participants=[1,2,3], items: 1=30, 2=40, 3=20
- WHEN system generates splits
- THEN splits created: 1 owes 50, 2 owes 60, 3 owes 40

#### Scenario: Mismatched generated splits are rejected, not persisted

- GIVEN `itemsSum`/status computation and split generation disagree on which items count (defense-in-depth case)
- WHEN the generated splits do not sum to the expense total within ±0.01
- THEN the mutation is rejected with HTTP 400 `{ code: "VALIDATION_ERROR" }` and no mismatched splits are persisted
