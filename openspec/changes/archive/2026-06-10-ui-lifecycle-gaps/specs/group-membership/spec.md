# Delta for Group Membership

## MODIFIED Requirements

### Requirement: Remove Member from Group

The system MUST allow only the group owner to remove members. The frontend MUST show a remove action only to the group owner. The system MUST set the membership status to REMOVED (soft-delete) rather than deleting the record. The owner MUST NOT be removable (must transfer ownership or delete group). The frontend MUST show a confirmation dialog before removal. The owner MAY remove a member even if that member has pending debts (owner takes responsibility for unsettled balances). The group MUST become hidden from the removed member's view. For remaining members, the removed member's expenses, payments, and debts MUST remain visible as history. A removed member MUST NOT have new expenses or splits created with their name. If a removed member re-joins later (via invite link or owner invitation), ALL their historical data MUST reappear as if they never left.

(Previously: Hard delete of membership record with no REMOVED status, no confirmation flow, no debt/visibility/rejoin rules)

#### Scenario: Owner removes member

- GIVEN authenticated user is owner of group 1, user with id 2 is a member
- WHEN owner clicks remove on member 2, confirmation dialog appears, owner confirms
- THEN frontend calls `DELETE /groups/1/members/2`, backend sets membership status to REMOVED, returns HTTP 200

#### Scenario: Owner removes member with pending debts

- GIVEN authenticated user is owner of group 1, user 2 is a member with a negative net balance (-30)
- WHEN owner clicks remove on member 2 and confirms
- THEN backend sets membership status to REMOVED, owner implicitly takes responsibility for unsettled debts, returns HTTP 200

#### Scenario: Owner removes self fails

- GIVEN authenticated user is owner of group 1
- WHEN owner submits `DELETE /groups/1/members/1` (owner id)
- THEN system returns HTTP 400 with `{ error: "Owner cannot leave; transfer ownership or delete group", code: "CANNOT_REMOVE_OWNER" }`

#### Scenario: Non-owner tries to remove member

- GIVEN authenticated user is member (not owner) of group 1
- WHEN user submits `DELETE /groups/1/members/3`
- THEN system returns HTTP 403 with `{ error: "Only owner can remove members", code: "FORBIDDEN" }`

#### Scenario: Removed member cannot see group

- GIVEN user 2 membership in group 1 has been set to REMOVED
- WHEN user 2 fetches their groups list or attempts to access group 1
- THEN group 1 is hidden from user 2's view; API returns HTTP 404 or excludes group from listings

#### Scenario: Removed member's history visible to remaining members

- GIVEN user 2 was removed from group 1, user 2 had expense splits and payments in group 1
- WHEN remaining members view group 1 expenses and balances
- THEN user 2's expenses, payments, and debts MUST remain visible as historical data

#### Scenario: Removed member cannot receive new splits

- GIVEN user 2 membership in group 1 has status REMOVED
- WHEN any member creates a new expense in group 1
- THEN user 2 MUST NOT appear as an eligible participant for splits

#### Scenario: Removed member rejoins group

- GIVEN user 2 was removed from group 1 (status REMOVED), owner sends invite to user 2
- WHEN user 2 accepts the invitation
- THEN membership status changes from REMOVED to ACTIVE, ALL user 2's historical expenses, payments, and debts reappear

### Requirement: Leave Group

The system MUST allow any member (except owner) to leave the group. The frontend MUST show a "Leave Group" action to non-owner members. The frontend MUST show a confirmation dialog before leaving. The system MUST set the membership status to REMOVED (soft-delete) rather than hard-deleting the record. The frontend MUST call `POST /groups/:groupId/leave`. A member MUST NOT leave if they have a negative net balance (pending debts); they MUST settle debts first. The group MUST become hidden from the leaver's view. For remaining members, the leaver's expenses, payments, and debts MUST remain visible as history. The leaver MUST NOT have new expenses or splits created with their name. If the leaver re-joins later (via invite link or owner invitation), ALL their historical data MUST reappear as if they never left.

(Previously: Used hard-delete for membership record with no REMOVED status, no debt-blocking rule, no visibility/rejoin semantics)

#### Scenario: Member leaves group

- GIVEN authenticated user with id 2 is member of group 1 (user 1 is owner), user 2 has zero or positive net balance
- WHEN user clicks "Leave Group", confirmation dialog appears, user confirms
- THEN frontend calls `POST /groups/1/leave`, backend sets membership status to REMOVED, returns HTTP 200

#### Scenario: Member with pending debts cannot leave

- GIVEN authenticated user with id 2 is member of group 1 with a negative net balance (-50)
- WHEN user clicks "Leave Group", confirmation dialog appears, user confirms
- THEN backend returns HTTP 400 with `{ error: "Cannot leave group with pending debts; settle first", code: "CANNOT_LEAVE_WITH_DEBTS" }`

#### Scenario: Owner tries to leave group

- GIVEN authenticated user is owner of group 1
- WHEN owner submits `POST /groups/1/leave`
- THEN system returns HTTP 400 with `{ error: "Owner cannot leave; transfer ownership or delete group", code: "CANNOT_LEAVE_AS_OWNER" }`

#### Scenario: Leaver's group hidden from view

- GIVEN user 2 has left group 1 (membership status REMOVED)
- WHEN user 2 fetches their groups list
- THEN group 1 is hidden from user 2's view

#### Scenario: Leaver's history visible to remaining members

- GIVEN user 2 has left group 1, user 2 had expenses and payments in group 1
- WHEN remaining members view group 1 expenses and balances
- THEN user 2's expenses, payments, and debts MUST remain visible as historical data

#### Scenario: Leaver cannot receive new splits

- GIVEN user 2 has left group 1 (membership status REMOVED)
- WHEN any member creates a new expense in group 1
- THEN user 2 MUST NOT appear as an eligible participant for splits

#### Scenario: Leaver rejoins group

- GIVEN user 2 left group 1 (status REMOVED), owner sends invite to user 2
- WHEN user 2 accepts the invitation
- THEN membership status changes from REMOVED to ACTIVE, ALL user 2's historical expenses, payments, and debts reappear

## ADDED Requirements

### Requirement: Reject Invitation

The system MUST hard-delete the membership record when a user rejects a group invitation. The system MUST NOT preserve the membership record — it disappears forever. The frontend MUST show a confirmation dialog before rejection. The frontend MUST call `DELETE /groups/:groupId/members/:memberId/invitation` (or equivalent reject endpoint).

#### Scenario: User rejects invitation

- GIVEN user 2 has a PENDING invitation to group 1
- WHEN user 2 clicks "Reject", confirmation dialog appears, user confirms
- THEN frontend calls the reject endpoint, backend hard-deletes the membership record, returns HTTP 200

#### Scenario: Rejected invitation disappears completely

- GIVEN user 2 has rejected the invitation to group 1 (membership hard-deleted)
- WHEN user 2 views their pending invitations
- THEN invitation to group 1 is no longer listed