# Group Management Specification

## Purpose

Handles full group lifecycle: create, edit, delete, list groups, and group settings including balance mode.

## Requirements

### Requirement: Create Group

The system MUST allow authenticated users to create groups. The system SHALL require `name`, `currency`, and `balanceMode` (DYNAMIC or STATIC). The creating user MUST become the group owner. The system MUST return HTTP 201 with the created group object.

#### Scenario: Successful creation

- GIVEN authenticated user with id 1
- WHEN user submits `POST /groups` with `{ name: "Trip Expenses", currency: "USD", balanceMode: "DYNAMIC" }`
- THEN system creates group with user 1 as owner and returns HTTP 201 with `{ id, name, currency, balanceMode, ownerId }`

#### Scenario: Missing required fields

- GIVEN authenticated user
- WHEN user submits `POST /groups` with `{ name: "Trip" }` (missing currency and balanceMode)
- THEN system returns HTTP 400 with Zod validation error

### Requirement: Edit Group

The system MUST allow only the group owner to edit group `name` and `currency`. The `balanceMode` field is IMMUTABLE after group creation — changing it mid-lifecycle would break closure and settlement semantics for STATIC groups, where closures rely on a consistent balance mode throughout the group's history. The frontend MUST provide an edit modal in GroupDetailPage with pre-filled fields for name and currency only; `balanceMode` MUST NOT appear as an editable field. The frontend MUST submit changes via `PUT /groups/:id`. The system MUST return HTTP 200 with updated group on success. The system MUST return HTTP 403 if non-owner attempts edit. If a `PUT /groups/:id` request includes `balanceMode` in the payload, the system MUST reject the request with HTTP 422 and `{ error: "balanceMode is immutable after group creation", code: "IMMUTABLE_FIELD" }`. The frontend MUST show edit controls only to the group owner.

(Previously: Backend-only requirement allowed editing name, currency, or balanceMode; no frontend modal or owner-gated UI)

#### Scenario: Owner edits group successfully

- GIVEN authenticated user is owner of group 1 and viewing GroupDetailPage
- WHEN owner opens edit modal, changes name to "Updated Trip" and currency to "EUR", and submits
- THEN frontend calls `PUT /groups/1` with `{ name: "Updated Trip", currency: "EUR" }` and displays updated group on success

#### Scenario: Non-owner edit rejected

- GIVEN authenticated user is member (not owner) of group 1 and viewing GroupDetailPage
- WHEN page renders
- THEN edit button is not visible; if non-owner calls `PUT /groups/1`, backend returns HTTP 403

#### Scenario: Non-owner edits group

- GIVEN authenticated user is member (not owner) of group 1
- WHEN user submits `PUT /groups/1` with `{ name: "Hacked Name" }`
- THEN system returns HTTP 403 with `{ error: "Only owner can edit group", code: "FORBIDDEN" }`

#### Scenario: Attempt to change immutable balanceMode

- GIVEN authenticated user is owner of group 1 (balanceMode: STATIC)
- WHEN owner submits `PUT /groups/1` with `{ balanceMode: "DYNAMIC" }`
- THEN system returns HTTP 422 with `{ error: "balanceMode is immutable after group creation", code: "IMMUTABLE_FIELD" }`

#### Scenario: Edit modal hides balanceMode field

- GIVEN authenticated user is owner of group 1 and viewing GroupDetailPage
- WHEN owner opens edit modal
- THEN modal shows editable fields for name and currency only; balanceMode is not rendered as an input

### Requirement: Delete Group

The system MUST allow only the group owner to delete the group. The frontend MUST show a confirmation dialog before deletion. The frontend MUST warn the owner if the group has associated expenses. The system SHALL cascade delete all memberships via Prisma `onDelete: Cascade`. The system MUST return HTTP 200 on success.

(Previously: Backend-only requirement with no confirmation flow or expense-warning behavior)

#### Scenario: Owner deletes empty group

- GIVEN authenticated user is owner of group 1, group 1 has no expenses
- WHEN owner clicks delete, confirmation dialog appears, owner confirms
- THEN frontend calls `DELETE /groups/1` and redirects to GroupsPage on success

#### Scenario: Owner deletes group with expenses

- GIVEN authenticated user is owner of group 1, group 1 has expenses
- WHEN owner clicks delete, confirmation dialog warns about existing expenses
- THEN owner MUST confirm again; frontend calls `DELETE /groups/1` and redirects to GroupsPage on success

#### Scenario: Non-owner deletes group

- GIVEN authenticated user is member (not owner) of group 1
- WHEN user submits `DELETE /groups/1`
- THEN system returns HTTP 403 with `{ error: "Only owner can delete group", code: "FORBIDDEN" }`

### Requirement: Get Group Details

The system MUST allow group members to view group details. The system MUST return HTTP 404 if group does not exist or user is not a member. The `expenses` and `payments` includes MUST filter `deletedAt: null`, so soft-deleted expenses and payments are never returned in group detail.

(Previously: no soft-delete filter on the `expenses`/`payments` includes — a soft-deleted record still appeared in group detail)

#### Scenario: Member views group

- GIVEN authenticated user is member of group 1
- WHEN user requests `GET /groups/1`
- THEN system returns HTTP 200 with `{ id, name, currency, balanceMode, ownerId, members: [...] }`

#### Scenario: Non-member views group

- GIVEN authenticated user is not member of group 1
- WHEN user requests `GET /groups/1`
- THEN system returns HTTP 404 with `{ error: "Group not found", code: "NOT_FOUND" }`

#### Scenario: Soft-deleted expense excluded from group detail

- GIVEN group 1 has an expense that has been soft-deleted (`deletedAt` set)
- WHEN a member requests `GET /groups/1`
- THEN the soft-deleted expense does not appear in the `expenses` array

#### Scenario: Soft-deleted payment excluded from group detail

- GIVEN group 1 has a payment that has been soft-deleted (`deletedAt` set)
- WHEN a member requests `GET /groups/1`
- THEN the soft-deleted payment does not appear in the `payments` array

### Requirement: List User's Groups

The system MUST return all groups where authenticated user is a member.

#### Scenario: List groups

- GIVEN authenticated user is member of groups 1 and 3
- WHEN user requests `GET /groups`
- THEN system returns HTTP 200 with `[{ id, name, currency, balanceMode }, ...]` (user's groups only)