# Delta for Group Management

## MODIFIED Requirements

### Requirement: Delete Group

The system MUST allow only the group owner to delete the group. The frontend MUST show a confirmation dialog before deletion. The frontend MUST warn the owner if the group has associated expenses. The system MUST perform the deletion inside a `$transaction` that deletes `Period` rows before deleting the `Group` row (Period-before-Group lock ordering, matching `finalClosure`'s ordering, so this path can never deadlock against period closure). The system SHALL still rely on Prisma `onDelete: Cascade` as a safety net for any row the explicit deletion does not cover. The system MUST return HTTP 200 on success.

(Previously: a bare `prisma.group.delete` with no `$transaction`; `Period` rows were removed only via `onDelete: Cascade` after `Group`, the inverse of `finalClosure`'s Period-before-Group order)

#### Scenario: Owner deletes empty group

- GIVEN authenticated user is owner of group 1, group 1 has no expenses
- WHEN owner clicks delete, confirmation dialog appears, owner confirms
- THEN frontend calls `DELETE /groups/1` and redirects to GroupsPage on success

#### Scenario: Owner deletes group with expenses

- GIVEN authenticated user is owner of group 1, group 1 has expenses
- WHEN owner clicks delete, confirmation dialog warns about existing expenses, owner confirms again
- THEN frontend calls `DELETE /groups/1` and redirects to GroupsPage on success

#### Scenario: Non-owner deletes group

- GIVEN authenticated user is member (not owner) of group 1
- WHEN user submits `DELETE /groups/1`
- THEN system returns HTTP 403 `{ code: "FORBIDDEN" }`

#### Scenario: Period rows are deleted before the Group row

- GIVEN group 1 (STATIC) has one Period record and no active expenses or payments
- WHEN owner submits `DELETE /groups/1`
- THEN the deletion runs inside a `$transaction`; `invocationCallOrder` proves `tx.period.deleteMany` is invoked before `tx.group.delete`; the group and its periods are both removed, HTTP 200
