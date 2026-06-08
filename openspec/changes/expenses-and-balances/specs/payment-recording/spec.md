# Payment Recording Specification

## Purpose

Records one-way payments between users in a group. Payments update balances but do NOT create expenses. Payments represent settling of debts.

## Requirements

### Requirement: Record Payment

The system MUST allow authenticated group members to record payments. The system SHALL require `fromUserId` (sender), `toUserId` (receiver), and `amount` (positive number). Both users MUST be group members. The `fromUserId` MUST be the authenticated user making the request. The system MAY accept `method` (string, e.g., "cash", "venmo") and `paidAt` (ISO date string).

The system MUST return HTTP 201 with created payment.

#### Scenario: Record payment between members

- GIVEN authenticated user (id 1) is member of group with users 1 and 2
- WHEN user submits `POST /groups/1/payments` with `{ fromUserId: 1, toUserId: 2, amount: 50, method: "cash" }`
- THEN system creates payment with amount 50, returns HTTP 201 with `{ id, fromUserId, toUserId, amount, method, paidAt }`

#### Scenario: Non-member tries to record payment

- GIVEN authenticated user is not member of group 1
- WHEN user submits `POST /groups/1/payments` with `{ fromUserId: 5, toUserId: 6, amount: 100 }`
- THEN system returns HTTP 404 with `{ error: "Group not found", code: "NOT_FOUND" }`

#### Scenario: fromUserId does not match authenticated user

- GIVEN authenticated user (id 1) is member of group 1
- WHEN user submits `POST /groups/1/payments` with `{ fromUserId: 2, toUserId: 3, amount: 50 }`
- THEN system returns HTTP 403 with `{ error: "Only sender can record payment", code: "FORBIDDEN" }`

#### Scenario: Amount must be positive

- GIVEN authenticated user (id 1) is member of group 1
- WHEN user submits `POST /groups/1/payments` with `{ fromUserId: 1, toUserId: 2, amount: -50 }`
- THEN system returns HTTP 400 with `{ error: "Amount must be positive", code: "VALIDATION_ERROR" }`

### Requirement: List Group Payments

The system MUST return all payments in a group ordered by `paidAt` descending. The system MUST return only payments for groups where authenticated user is a member.

#### Scenario: List payments

- GIVEN authenticated user is member of group with 2 payments
- WHEN user requests `GET /groups/1/payments`
- THEN system returns HTTP 200 with `[{ id, fromUserId, toUserId, amount, method, paidAt }, ...]`

#### Scenario: Non-member cannot list payments

- GIVEN authenticated user is not member of group 1
- WHEN user requests `GET /groups/1/payments`
- THEN system returns HTTP 404 with `{ error: "Group not found", code: "NOT_FOUND" }`

### Requirement: Delete Payment

The system MUST allow only the sender to delete a payment. The system MUST return HTTP 200 on success.

#### Scenario: Sender deletes payment

- GIVEN authenticated user (id 1) is sender of payment 1
- WHEN user submits `DELETE /groups/1/payments/1`
- THEN system deletes payment, returns HTTP 200

#### Scenario: Non-sender deletes payment

- GIVEN authenticated user (id 2) is not sender of payment 1
- WHEN user submits `DELETE /groups/1/payments/1`
- THEN system returns HTTP 403 with `{ error: "Only sender can delete payment", code: "FORBIDDEN" }`