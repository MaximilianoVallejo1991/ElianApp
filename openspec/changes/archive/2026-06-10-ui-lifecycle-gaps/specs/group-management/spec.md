# Delta for Group Management

## MODIFIED Requirements

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