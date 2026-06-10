# Delta for Payment Recording

## MODIFIED Requirements

### Requirement: Delete Payment

The system MUST allow the payment sender or the group owner to delete a payment (`userId === payment.fromUserId OR userId === group.ownerId`). The frontend MUST show a confirmation dialog before deletion. The system MUST perform a soft delete (set `deletedAt` timestamp, not remove from DB). The system MUST recalculate group balances after soft delete. The system MUST return HTTP 200 on success. The frontend MUST show delete controls only to the sender or group owner.

(Previously: Only the sender could delete; hard delete with no confirmation and no balance recalculation requirement)

#### Scenario: Sender deletes payment successfully

- GIVEN authenticated user (id 1) is sender of payment 1 in group 1
- WHEN sender clicks delete, confirmation dialog appears, sender confirms
- THEN frontend calls `DELETE /groups/1/payments/1`, backend soft-deletes payment (`deletedAt` set), recalculates balances, returns HTTP 200

#### Scenario: Group owner deletes any payment

- GIVEN authenticated user (id 3) is owner of group 1, payment 1 was sent by user 2
- WHEN owner clicks delete on payment 1, confirmation dialog appears, owner confirms
- THEN frontend calls `DELETE /groups/1/payments/1`, backend soft-deletes payment, recalculates balances, returns HTTP 200

#### Scenario: Non-sender non-owner delete rejected

- GIVEN authenticated user (id 2) is not sender of payment 1 in group 1 and is not group owner
- WHEN user submits `DELETE /groups/1/payments/1`
- THEN system returns HTTP 403 with `{ error: "Only sender or group owner can delete payment", code: "FORBIDDEN" }`

#### Scenario: Delete affects balance recalculation

- GIVEN payment 1 (fromUserId: 1, toUserId: 2, amount: 50) exists in group 1
- WHEN sender (user 1) deletes payment 1
- THEN system soft-deletes payment (`deletedAt` set) and recalculates group balances excluding the deleted payment