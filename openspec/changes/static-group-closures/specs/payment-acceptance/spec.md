# Payment Acceptance Specification

## Purpose

Defines the payment acceptance flow for STATIC groups during closure. Creditors must accept or reject payments recorded against them before a period can transition to CLOSED. This flow only applies during CLOSING status; DYNAMIC groups are unaffected.

## Requirements

### Requirement: Accept Payment

The system MUST allow the payment receiver (`toUserId`) to accept a PENDING payment. The system SHALL transition the payment `status` from PENDING to ACCEPTED. Only the authenticated user matching `toUserId` MAY accept. The system MUST return HTTP 200 with updated payment.

#### Scenario: Creditor accepts payment

- GIVEN STATIC group with CLOSING period, payment 1 with `toUserId=user2`, `status=PENDING`
- WHEN user 2 submits `POST /payments/1/accept`
- THEN payment status transitions to ACCEPTED, system returns HTTP 200

#### Scenario: Non-receiver cannot accept

- GIVEN STATIC group with payment 1 where `toUserId=user2`
- WHEN user 1 (sender) submits `POST /payments/1/accept`
- THEN system returns HTTP 403 with `{ error: "Only the payment receiver can accept", code: "FORBIDDEN" }`

### Requirement: Reject Payment

The system MUST allow the payment receiver (`toUserId`) to reject a PENDING payment. The system SHALL transition the payment `status` from PENDING to REJECTED. The system MUST return HTTP 200 with updated payment including a `rejectionReason` field (optional, MAY be provided by the receiver).

#### Scenario: Creditor rejects payment

- GIVEN STATIC group with CLOSING period, payment 1 with `toUserId=user2`, `status=PENDING`
- WHEN user 2 submits `POST /payments/1/reject` with `{ rejectionReason: "Incorrect amount" }`
- THEN payment status transitions to REJECTED, system returns HTTP 200

#### Scenario: Non-receiver cannot reject

- GIVEN STATIC group with payment 1 where `toUserId=user2`
- WHEN user 1 submits `POST /payments/1/reject`
- THEN system returns HTTP 403 with `{ error: "Only the payment receiver can reject", code: "FORBIDDEN" }`

### Requirement: Rejection Blocks Closure

The system MUST prevent closure completion if any payment in the period has status REJECTED. The owner MUST resolve REJECTED payments (delete and re-record, or negotiate) before proceeding.

#### Scenario: Rejected payment prevents closure

- GIVEN STATIC group with CLOSING period and payment 1 with `status=REJECTED`
- WHEN owner submits `POST /groups/:groupId/periods/current/complete-closure`
- THEN system returns HTTP 409 with `{ error: "All payments must be ACCEPTED; found REJECTED payments", code: "CLOSURE_BLOCKED" }`

### Requirement: DYNAMIC Groups Unaffected

The system MUST NOT apply acceptance/rejection flow to DYNAMIC groups. Payments in DYNAMIC groups are auto-accepted upon creation as before.

#### Scenario: DYNAMIC payment has no status field

- GIVEN DYNAMIC group with payment created by user 1
- WHEN payment is recorded
- THEN payment is immediately effective with status ACCEPTED; no accept/reject endpoints are applicable