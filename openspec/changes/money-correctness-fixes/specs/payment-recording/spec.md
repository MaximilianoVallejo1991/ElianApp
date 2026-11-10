# Delta for Payment Recording

## ADDED Requirements

### Requirement: Exclude Soft-Deleted Payments From Acceptance

The system MUST treat a soft-deleted payment (`deletedAt` set) as non-existent for `acceptPayment` and `rejectPayment`. Both operations MUST load the payment and, if `deletedAt` is set, reject with HTTP 404 `{ error: "Payment not found", code: "PAYMENT_NOT_FOUND" }` before evaluating receiver or status checks.

#### Scenario: Accept rejects a soft-deleted payment

- GIVEN payment 1 has `toUserId=user2` and `deletedAt` set (soft-deleted)
- WHEN user 2 submits `POST /payments/1/accept`
- THEN system returns HTTP 404 with `{ error: "Payment not found", code: "PAYMENT_NOT_FOUND" }`

#### Scenario: Reject rejects a soft-deleted payment

- GIVEN payment 1 has `toUserId=user2` and `deletedAt` set (soft-deleted)
- WHEN user 2 submits `POST /payments/1/reject`
- THEN system returns HTTP 404 with `{ error: "Payment not found", code: "PAYMENT_NOT_FOUND" }`

### Requirement: Exclude Soft-Deleted Payments From Closure Blocking

The system MUST NOT count a soft-deleted PENDING payment when evaluating whether a closure (`startClosure`, `completeClosure`, `partialClosure`, `finalClosure`) may proceed. Every payment query used for closure balance checks and pending-payment counts MUST filter `deletedAt: null`.

#### Scenario: Soft-deleted PENDING payment no longer blocks closure

- GIVEN a STATIC group period has one PENDING payment that has been soft-deleted (`deletedAt` set)
- WHEN the owner submits `POST /groups/:groupId/periods/current/start-closure`
- THEN the system does not count the soft-deleted payment as blocking, and closure proceeds based on remaining non-deleted payments
