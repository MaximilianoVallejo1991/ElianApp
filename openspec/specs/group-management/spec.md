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

The system MUST allow only the group owner to edit group name, currency, or balanceMode. The system MUST return HTTP 200 with updated group on success. The system MUST return HTTP 403 if non-owner attempts edit.

#### Scenario: Owner edits group

- GIVEN authenticated user is owner of group 1
- WHEN user submits `PUT /groups/1` with `{ name: "Updated Name", currency: "EUR" }`
- THEN system updates group and returns HTTP 200 with `{ id, name: "Updated Name", currency: "EUR" }`

#### Scenario: Non-owner edits group

- GIVEN authenticated user is member (not owner) of group 1
- WHEN user submits `PUT /groups/1` with `{ name: "Hacked Name" }`
- THEN system returns HTTP 403 with `{ error: "Only owner can edit group", code: "FORBIDDEN" }`

### Requirement: Delete Group

The system MUST allow only the group owner to delete the group. The system SHALL cascade delete all memberships via Prisma `onDelete: Cascade`. The system MUST return HTTP 200 on success.

#### Scenario: Owner deletes group

- GIVEN authenticated user is owner of group 1
- WHEN user submits `DELETE /groups/1`
- THEN system deletes group and all its memberships, returns HTTP 200

#### Scenario: Non-owner deletes group

- GIVEN authenticated user is member (not owner) of group 1
- WHEN user submits `DELETE /groups/1`
- THEN system returns HTTP 403 with `{ error: "Only owner can delete group", code: "FORBIDDEN" }`

### Requirement: Get Group Details

The system MUST allow group members to view group details. The system MUST return HTTP 404 if group does not exist or user is not a member.

#### Scenario: Member views group

- GIVEN authenticated user is member of group 1
- WHEN user requests `GET /groups/1`
- THEN system returns HTTP 200 with `{ id, name, currency, balanceMode, ownerId, members: [...] }`

#### Scenario: Non-member views group

- GIVEN authenticated user is not member of group 1
- WHEN user requests `GET /groups/1`
- THEN system returns HTTP 404 with `{ error: "Group not found", code: "NOT_FOUND" }`

### Requirement: List User's Groups

The system MUST return all groups where authenticated user is a member.

#### Scenario: List groups

- GIVEN authenticated user is member of groups 1 and 3
- WHEN user requests `GET /groups`
- THEN system returns HTTP 200 with `[{ id, name, currency, balanceMode }, ...]` (user's groups only)