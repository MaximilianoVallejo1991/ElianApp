# Period Management Specification

## Purpose

Manages the settlement period lifecycle for STATIC groups: creation, closure initiation, payment acceptance, completion, partial reopening, and final closure. Periods are the unit of settlement — expenses accumulate in an OPEN period, closure freezes new expenses, and completion settles balances.

## Requirements

### Requirement: Create Period

The system MUST create an OPEN period automatically when a STATIC group is created. The system MUST set `status=OPEN` and link it as the group's `currentPeriodId`. On partial closure, the system MUST create a new OPEN period and set it as the group's `currentPeriodId`.

#### Scenario: Automatic period on group creation

- GIVEN authenticated user creates a STATIC group
- WHEN group is created
- THEN system creates an OPEN period linked to the group and sets `currentPeriodId` on the group

#### Scenario: Period created on partial closure

- GIVEN STATIC group with current CLOSING period and all payments accepted
- WHEN owner completes a partial closure
- THEN system creates a new OPEN period and updates `currentPeriodId`

#### Scenario: DYNAMIC group has no periods

- GIVEN authenticated user creates a DYNAMIC group
- WHEN group is created
- THEN system does NOT create any period record

### Requirement: Start Closure

The system MUST allow only the group owner to start a closure. The system SHALL transition the current period status from OPEN to CLOSING. Starting closure MUST fail if any payment in the period has status PENDING (payments must first be resolved). The system MUST return HTTP 200 with updated period.

#### Scenario: Owner starts closure successfully

- GIVEN STATIC group with owner user 1 and current OPEN period
- WHEN owner submits `POST /groups/:groupId/periods/current/start-closure`
- THEN period status changes to CLOSING and expense creation is blocked

#### Scenario: Non-owner cannot start closure

- GIVEN STATIC group with owner user 1 and member user 2
- WHEN user 2 submits `POST /groups/:groupId/periods/current/start-closure`
- THEN system returns HTTP 403 with `{ error: "Only owner can start closure", code: "FORBIDDEN" }`

#### Scenario: Start closure with PENDING payments fails

- GIVEN STATIC group with current OPEN period and a PENDING payment
- WHEN owner submits `POST /groups/:groupId/periods/current/start-closure`
- THEN system returns HTTP 409 with `{ error: "Cannot start closure with PENDING payments", code: "CLOSURE_BLOCKED" }`

### Requirement: Complete Closure

The system MUST allow only the group owner to complete a closure. The system SHALL transition period status from CLOSING to CLOSED. Completion MUST fail if any payment in the period has status PENDING or REJECTED (all must be ACCEPTED). The system MUST return HTTP 200 with updated period.

#### Scenario: Owner completes closure with all accepted

- GIVEN STATIC group with CLOSING period and all payments ACCEPTED
- WHEN owner submits `POST /groups/:groupId/periods/current/complete-closure`
- THEN period status changes to CLOSED and balances are frozen

#### Scenario: Complete closure with PENDING payments fails

- GIVEN STATIC group with CLOSING period and a PENDING payment
- WHEN owner submits `POST /groups/:groupId/periods/current/complete-closure`
- THEN system returns HTTP 409 with `{ error: "All payments must be ACCEPTED", code: "CLOSURE_BLOCKED" }`

### Requirement: Partial Closure

The system MUST allow the owner to perform a partial closure, which closes the current period and opens a new one. The owner MAY choose partial closure after completing the current closure. The system MUST create a new OPEN period and set it as `currentPeriodId`.

#### Scenario: Owner performs partial closure

- GIVEN STATIC group with owner user 1 and current CLOSING period (all payments accepted)
- WHEN owner submits `POST /groups/:groupId/periods/current/partial-closure`
- THEN current period transitions to CLOSED, new OPEN period created, group `currentPeriodId` updated

### Requirement: Final Closure

The system MUST allow the owner to permanently close the group. The system SHALL set the group `status=CLOSED` and transition the current period to FINAL (or CLOSED with group CLOSED). No further expenses, payments, or periods MAY be created. The system MUST return HTTP 200.

#### Scenario: Owner performs final closure

- GIVEN STATIC group with owner user 1 and current CLOSING period (all payments accepted)
- WHEN owner submits `POST /groups/:groupId/periods/current/final-closure`
- THEN current period transitions to CLOSED, group `status=CLOSED`, no further expenses or periods allowed

#### Scenario: Final closure is irreversible

- GIVEN STATIC group with status CLOSED
- WHEN any user attempts `POST /groups/:groupId/expenses` or `POST /groups/:groupId/periods`
- THEN system returns HTTP 403 with `{ error: "Group is permanently closed", code: "GROUP_CLOSED" }`

#### Scenario: Non-owner cannot perform final closure

- GIVEN STATIC group with owner user 1 and member user 2
- WHEN user 2 submits `POST /groups/:groupId/periods/current/final-closure`
- THEN system returns HTTP 403 with `{ error: "Only owner can close group permanently", code: "FORBIDDEN" }`