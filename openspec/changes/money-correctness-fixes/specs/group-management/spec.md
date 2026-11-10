# Delta for Group Management

## MODIFIED Requirements

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
