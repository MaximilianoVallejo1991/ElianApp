# Payment Acceptance Specification

## Purpose

Manages payment acceptance and rejection flow for both DYNAMIC and STATIC groups. Allows creditors to accept or reject pending payments independent of closure status.

## Requirements

### Requirement: Accept Payment

The system MUST allow the payment receiver (`toUserId`) to accept a PENDING payment, in both DYNAMIC and STATIC groups, independent of any closure or period state. The system SHALL transition the payment `status` from PENDING to ACCEPTED. Only the authenticated user matching `toUserId` MAY accept. The system MUST return HTTP 200 with updated payment.

(Previously: scoped to STATIC groups during a CLOSING period only; DYNAMIC groups could not accept)

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

### Requirement: Reject Payment

The system MUST allow the payment receiver (`toUserId`) to reject a PENDING payment, in both DYNAMIC and STATIC groups, independent of any closure or period state. The system SHALL transition the payment `status` from PENDING to REJECTED. The system MUST return HTTP 200 with updated payment including an optional `rejectionReason`.

(Previously: scoped to STATIC groups during a CLOSING period only; DYNAMIC groups could not reject)

#### Scenario: Creditor rejects payment in a DYNAMIC group

- GIVEN DYNAMIC group with payment 1, `toUserId=user2`, `status=PENDING`
- WHEN user 2 submits `POST /payments/1/reject` with `{ rejectionReason: "Incorrect amount" }`
- THEN payment status transitions to REJECTED, system returns HTTP 200

#### Scenario: Non-receiver cannot reject

- GIVEN a group with payment 1 where `toUserId=user2`
- WHEN user 1 submits `POST /payments/1/reject`
- THEN system returns HTTP 403 with `{ error: "Only the payment receiver can reject", code: "FORBIDDEN" }`

### Requirement: Rejection Blocks STATIC Closure

The system MUST prevent closure completion if any payment in a STATIC group's period has status REJECTED. The owner MUST resolve REJECTED payments before proceeding. This requirement does not apply to DYNAMIC groups, which have no closure workflow.

(Previously: identical scope — closure blocking is unchanged, kept here for completeness)

#### Scenario: Rejected payment prevents STATIC closure

- GIVEN STATIC group with CLOSING period and payment 1 with `status=REJECTED`
- WHEN owner submits `POST /groups/:groupId/periods/current/complete-closure`
- THEN system returns HTTP 409 with `{ error: "All payments must be ACCEPTED; found REJECTED payments", code: "CLOSURE_BLOCKED" }`
