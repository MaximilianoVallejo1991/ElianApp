# Group Membership Specification

## Purpose

Handles group membership lifecycle: invite users, accept/reject invitations, remove members, and leave groups.

## Requirements

### Requirement: Invite User to Group

The system MUST allow only the group owner to invite users by email or nickName. The system MUST reject invites for already-member users. The system MUST reject invites for non-existent users. The system SHALL create a pending membership record.

#### Scenario: Owner invites by email

- GIVEN authenticated user is owner of group 1, user `bob@example.com` exists but is not a member
- WHEN owner submits `POST /groups/1/members` with `{ email: "bob@example.com" }`
- THEN system creates pending membership and returns HTTP 201 with `{ userId, groupId, status: "PENDING" }`

#### Scenario: Owner invites by nickName

- GIVEN authenticated user is owner of group 1, user with nickName `bob` exists but is not a member
- WHEN owner submits `POST /groups/1/members` with `{ nickName: "bob" }`
- THEN system creates pending membership and returns HTTP 201

#### Scenario: Invite existing member

- GIVEN authenticated user is owner of group 1, user `bob@example.com` is already a member
- WHEN owner submits `POST /groups/1/members` with `{ email: "bob@example.com" }`
- THEN system returns HTTP 400 with `{ error: "User is already a member", code: "ALREADY_MEMBER" }`

#### Scenario: Invite non-existent user

- GIVEN authenticated user is owner of group 1, no user with email `nonexistent@example.com` exists
- WHEN owner submits `POST /groups/1/members` with `{ email: "nonexistent@example.com" }`
- THEN system returns HTTP 404 with `{ error: "User not found", code: "USER_NOT_FOUND" }`

#### Scenario: Non-owner invites

- GIVEN authenticated user is member (not owner) of group 1
- WHEN user submits `POST /groups/1/members` with `{ email: "bob@example.com" }`
- THEN system returns HTTP 403 with `{ error: "Only owner can invite members", code: "FORBIDDEN" }`

### Requirement: Accept Invitation

The system MUST allow invited user to accept invitation. The system SHALL update membership status to ACTIVE and set joinedAt timestamp.

#### Scenario: Accept invitation

- GIVEN user with id 2 has pending membership in group 1
- WHEN user submits `POST /groups/1/members/accept`
- THEN system updates membership to ACTIVE and returns HTTP 200

### Requirement: Reject Invitation

The system MUST allow invited user to reject invitation. The system SHALL delete the membership record.

#### Scenario: Reject invitation

- GIVEN user with id 2 has pending membership in group 1
- WHEN user submits `POST /groups/1/members/reject`
- THEN system deletes membership record and returns HTTP 200

### Requirement: Remove Member from Group

The system MUST allow only the group owner to remove members. The system MUST delete the membership record. The owner MUST NOT be removable (must transfer ownership or delete group).

#### Scenario: Owner removes member

- GIVEN authenticated user is owner of group 1, user with id 2 is a member
- WHEN owner submits `DELETE /groups/1/members/2`
- THEN system deletes membership and returns HTTP 200

#### Scenario: Owner removes self

- GIVEN authenticated user is owner of group 1
- WHEN owner submits `DELETE /groups/1/members/1` (owner id)
- THEN system returns HTTP 400 with `{ error: "Owner cannot leave; transfer ownership or delete group", code: "CANNOT_REMOVE_OWNER" }`

#### Scenario: Non-owner removes member

- GIVEN authenticated user is member (not owner) of group 1, user with id 3 is another member
- WHEN user submits `DELETE /groups/1/members/3`
- THEN system returns HTTP 403 with `{ error: "Only owner can remove members", code: "FORBIDDEN" }`

### Requirement: Leave Group

The system MUST allow any member (except owner) to leave the group. The system SHALL delete the membership record.

#### Scenario: Member leaves

- GIVEN authenticated user with id 2 is member of group 1 (user 1 is owner)
- WHEN user submits `DELETE /groups/1/members/leave`
- THEN system deletes membership and returns HTTP 200

#### Scenario: Owner leaves

- GIVEN authenticated user is owner of group 1
- WHEN user submits `DELETE /groups/1/members/leave`
- THEN system returns HTTP 400 with `{ error: "Owner cannot leave; transfer ownership or delete group", code: "CANNOT_LEAVE_AS_OWNER" }`