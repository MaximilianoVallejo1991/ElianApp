# Delta for Payment Acceptance

## MODIFIED Requirements

### Requirement: Accept Payment

The system MUST allow the payment receiver (`toUserId`) to accept a PENDING payment, in both DYNAMIC and STATIC groups, independent of any closure or period state. The system SHALL transition the payment `status` from PENDING to ACCEPTED via an atomic conditional update that re-asserts `status = 'PENDING'` inside the write (`updateMany` + count), never via a separate read-then-write. Only the authenticated user matching `toUserId` MAY accept. The system MUST return HTTP 200 with the updated payment, including `fromUser` and `toUser` relations. If the payment is no longer PENDING at write time (already accepted, rejected, or lost a concurrent race), the system MUST return HTTP 409 `NOT_PENDING` instead of a success response.

(Previously: scoped to STATIC groups during a CLOSING period only; DYNAMIC groups could not accept)
(Previously: non-PENDING status was detected by a separate read-then-check and returned HTTP 400 `INVALID_OPERATION`; now detected atomically in the write's `WHERE` clause and returns HTTP 409 `NOT_PENDING`)

#### Scenario: Creditor accepts payment in a STATIC group during closure

- GIVEN STATIC group with CLOSING period, payment 1 with `toUserId=user2`, `status=PENDING`
- WHEN user 2 submits `POST /payments/1/accept`
- THEN payment status transitions to ACCEPTED, system returns HTTP 200

#### Scenario: Creditor accepts payment in a DYNAMIC group with no closure involved

- GIVEN DYNAMIC group with payment 1 recorded by user 1, `toUserId=user2`, `status=PENDING`, no closure or period in progress
- WHEN user 2 submits `POST /payments/1/accept`
- THEN payment status transitions to ACCEPTED, system returns HTTP 200, and the payment now counts toward balances

#### Scenario: Non-receiver cannot accept

- GIVEN a group with payment 1 where `toUserId=user2`
- WHEN user 1 (sender) submits `POST /payments/1/accept`
- THEN system returns HTTP 403 with `{ error: "Only the payment receiver can accept", code: "FORBIDDEN" }`

#### Scenario: Concurrent accept requests yield exactly one winner

- GIVEN payment 1 with `toUserId=user2`, `status=PENDING`
- WHEN two concurrent `POST /payments/1/accept` requests arrive from user 2
- THEN exactly one request transitions the payment to ACCEPTED and returns HTTP 200 with `fromUser`/`toUser` populated
- AND the other request receives HTTP 409 with `code: "NOT_PENDING"`, never a success response

### Requirement: Reject Payment

The system MUST allow the payment receiver (`toUserId`) to reject a PENDING payment, in both DYNAMIC and STATIC groups, independent of any closure or period state. The system SHALL transition the payment `status` from PENDING to REJECTED via an atomic conditional update that re-asserts `status = 'PENDING'` inside the write (`updateMany` + count), never via a separate read-then-write. The system MUST return HTTP 200 with the updated payment, including `fromUser`/`toUser` relations and an optional `rejectionReason`. If the payment is no longer PENDING at write time, the system MUST return HTTP 409 `NOT_PENDING` instead of a success response.

(Previously: scoped to STATIC groups during a CLOSING period only; DYNAMIC groups could not reject)
(Previously: non-PENDING status returned HTTP 400 `INVALID_OPERATION`; now returns HTTP 409 `NOT_PENDING` via the same atomic guard as accept)

#### Scenario: Creditor rejects payment in a DYNAMIC group

- GIVEN DYNAMIC group with payment 1, `toUserId=user2`, `status=PENDING`
- WHEN user 2 submits `POST /payments/1/reject` with `{ rejectionReason: "Incorrect amount" }`
- THEN payment status transitions to REJECTED, system returns HTTP 200

#### Scenario: Non-receiver cannot reject

- GIVEN a group with payment 1 where `toUserId=user2`
- WHEN user 1 submits `POST /payments/1/reject`
- THEN system returns HTTP 403 with `{ error: "Only the payment receiver can reject", code: "FORBIDDEN" }`

#### Scenario: Concurrent accept and reject on the same payment yield one terminal status

- GIVEN payment 1 with `toUserId=user2`, `status=PENDING`
- WHEN a concurrent `accept` and `reject` request from user 2 both target payment 1
- THEN exactly one request succeeds and the payment reaches exactly one terminal status (`ACCEPTED` or `REJECTED`)
- AND the losing request receives HTTP 409 `NOT_PENDING`, and its response never claims a different outcome than the final DB state

### Requirement: Rejection Blocks STATIC Closure

The system MUST prevent closure completion if any payment in a STATIC group's period has status REJECTED. The owner MUST resolve REJECTED payments before proceeding. This requirement does not apply to DYNAMIC groups, which have no closure workflow.

(Previously: identical scope — closure blocking is unchanged, kept here for completeness)

#### Scenario: Rejected payment prevents STATIC closure

- GIVEN STATIC group with CLOSING period and payment 1 with `status=REJECTED`
- WHEN owner submits `POST /groups/:groupId/periods/current/complete-closure`
- THEN system returns HTTP 409 with `{ error: "All payments must be ACCEPTED; found REJECTED payments", code: "CLOSURE_BLOCKED" }`
