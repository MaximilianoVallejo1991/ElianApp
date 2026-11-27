# Delta for Payment Recording

## MODIFIED Requirements

### Requirement: Period-Scoped Payments for STATIC Groups

The system MUST link every payment in a STATIC group to the group's current period via `periodId`. The system SHALL automatically set `periodId` to the group's `currentPeriodId` when a payment is recorded. ALL payments in STATIC groups MUST be created with `status=PENDING` and require creditor acceptance, regardless of period status. Only the payment receiver (`toUserId`) MAY accept or reject a payment.

(Previously: Payments during OPEN periods were auto-accepted with `status=ACCEPTED`; only CLOSING-period payments required acceptance)

#### Scenario: Payment recorded during CLOSING period

- GIVEN STATIC group with current period status CLOSING
- WHEN member (user 1) submits `POST /groups/:groupId/payments` with `{ fromUserId: 1, toUserId: 2, amount: 50 }`
- THEN system creates payment with `periodId=currentPeriodId`, `status=PENDING`, returns HTTP 201

#### Scenario: Payment recorded during OPEN period

- GIVEN STATIC group with current period status OPEN
- WHEN member (user 1) submits `POST /groups/:groupId/payments` with `{ fromUserId: 1, toUserId: 2, amount: 50 }`
- THEN system creates payment with `periodId=currentPeriodId`, `status=PENDING`, returns HTTP 201

#### Scenario: Only toUserId can accept payment in STATIC group

- GIVEN STATIC group with a PENDING payment (`toUserId=2`)
- WHEN user 3 attempts to accept the payment
- THEN system returns HTTP 403

### Requirement: DYNAMIC Group Payment Recording

The system MUST include a `status` field on ALL payment records, including DYNAMIC groups. ALL payments (both DYNAMIC and STATIC) MUST follow the flow: PENDING (recorded) → ACCEPTED (confirmed by creditor) → REJECTED (disputed). DYNAMIC payments differ from STATIC only in WHEN they can be recorded (any time, no period gating) and HOW they affect balances (recalculated immediately on acceptance). The system MUST NOT add `periodId` to DYNAMIC group payments.

(Previously: DYNAMIC payments were "auto-accepted" with implicit `status=ACCEPTED` and no status field; now they follow the same PENDING → ACCEPTED flow)

#### Scenario: DYNAMIC payment recorded with PENDING status

- GIVEN DYNAMIC group (no periods exist)
- WHEN member records a payment with `{ fromUserId: 1, toUserId: 2, amount: 50 }`
- THEN payment is created with `status=PENDING`, `periodId=null`

#### Scenario: DYNAMIC payment acceptance recalculates balance immediately

- GIVEN DYNAMIC group with a PENDING payment (fromUserId: 1, toUserId: 2, amount: 50)
- WHEN creditor (user 2) accepts the payment
- THEN payment status becomes ACCEPTED
- AND group balances are recalculated immediately including the accepted payment

### Requirement: Payment Status Field

The system MUST include a `status` field on ALL Payment records (both DYNAMIC and STATIC) with values PENDING, ACCEPTED, or REJECTED. The system SHALL default ALL payments to `status=PENDING` upon creation. Only the payment receiver (`toUserId`) SHALL accept or reject a payment. The `status` field is NOT optional — it MUST be present on every payment record.

(Previously: `status` was only on STATIC group payments; DYNAMIC payments had implicit `status=ACCEPTED`)

#### Scenario: Payment status defaults to PENDING for all groups

- GIVEN any group (STATIC or DYNAMIC)
- WHEN member records a payment
- THEN payment is created with `status=PENDING`

#### Scenario: Only toUserId can accept payment

- GIVEN a PENDING payment with `toUserId=2`
- WHEN user other than user 2 attempts to accept the payment
- THEN system returns HTTP 403

#### Scenario: toUserId accepts own payment

- GIVEN a PENDING payment with `toUserId=2`
- WHEN user 2 accepts the payment
- THEN payment status becomes ACCEPTED

## ADDED Requirements

### Requirement: List Group Payments with Period Filter

For STATIC groups, the system MUST filter payments to the current open period by default. The system MUST accept `?periodId=...` query parameter to list payments for a specific period. The system MUST accept `?includeHistory=true` to list payments across all periods. DYNAMIC groups MUST list all payments without period filtering.

#### Scenario: STATIC group lists current period payments by default

- GIVEN STATIC group with period 1 (CLOSED, 2 payments) and period 2 (OPEN, 1 payment)
- WHEN user requests `GET /groups/:groupId/payments`
- THEN system returns only the 1 payment from period 2

#### Scenario: STATIC group queries specific period payments

- GIVEN STATIC group with period 1 (CLOSED, 2 payments)
- WHEN user requests `GET /groups/:groupId/payments?periodId=1`
- THEN system returns the 2 payments from period 1

#### Scenario: DYNAMIC group lists all payments without filtering

- GIVEN DYNAMIC group with 5 payments (no periods)
- WHEN user requests `GET /groups/:groupId/payments`
- THEN system returns all 5 payments (existing behavior, no period filter)