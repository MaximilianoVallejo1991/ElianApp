# Period Management Specification

## Purpose

Manages the STATIC-group closure state machine for periods (`OPEN → CLOSING → CLOSED`/`FINAL`, with partial reopen into a new `OPEN` period) and its concurrency guarantees. This is the first live spec for this capability; naming follows the convention established by the (void, unmerged) `static-group-closures` change rather than the current proposal's internal label (`period-closure`).

Scope boundary: these requirements guarantee that concurrent calls to the same transition cannot both succeed and cannot corrupt the `isCurrent` invariant. They do NOT guarantee that every precondition read (e.g. zero-balance check, PENDING-payment count) is itself race-free against a concurrent mutation — that is a separate, pre-existing staleness class, explicitly out of scope.

## Requirements

### Requirement: Create Period

The system MUST automatically create an OPEN period for every newly created STATIC group and mark it as the group's current period via `Period.isCurrent = true` (there is no `Group.currentPeriodId` column — `Period.isCurrent`, enforced by the partial unique index described in "Current Period Database Invariant", is the sole current-period mechanism). DYNAMIC groups MUST NOT have any period records created.

#### Scenario: Automatic period on STATIC group creation

- GIVEN authenticated user creates a STATIC group
- WHEN the group is created
- THEN system creates one `Period` row with `status=OPEN` and `isCurrent=true` for that group

#### Scenario: DYNAMIC group has no periods

- GIVEN authenticated user creates a DYNAMIC group
- WHEN the group is created
- THEN system does NOT create any period record

### Requirement: Start Closure

The system MUST allow only the group owner to start a closure. The system SHALL transition the current period's status from OPEN to CLOSING. Starting closure MUST fail with HTTP 409 `CLOSURE_BLOCKED` if any non-deleted payment in the current period has status PENDING. Starting closure MUST also fail with HTTP 409 `CLOSURE_BLOCKED` if the current period has no non-deleted expenses recorded. The system MUST return HTTP 200 with the updated period.

#### Scenario: Owner starts closure successfully

- GIVEN STATIC group with owner user 1, a current OPEN period, and at least one expense recorded in that period
- WHEN owner submits `POST /groups/:groupId/periods/current/start-closure`
- THEN period status changes to CLOSING and expense creation is blocked

#### Scenario: Non-owner cannot start closure

- GIVEN STATIC group with owner user 1 and member user 2
- WHEN user 2 submits `POST /groups/:groupId/periods/current/start-closure`
- THEN system returns HTTP 403 with `{ error: "Only owner can perform this action", code: "FORBIDDEN" }`

#### Scenario: Start closure with PENDING payments fails

- GIVEN STATIC group with current OPEN period and a PENDING payment
- WHEN owner submits `POST /groups/:groupId/periods/current/start-closure`
- THEN system returns HTTP 409 with `{ error: "Cannot start closure with PENDING payments", code: "CLOSURE_BLOCKED" }`

### Requirement: Complete Closure

The system MUST allow only the group owner to complete a closure. The system SHALL transition the current period's status from CLOSING to CLOSED and set `isCurrent=false`. Completion MUST fail with HTTP 409 `CLOSURE_BLOCKED` if any non-deleted payment in the period has status PENDING — a REJECTED payment does NOT by itself block completion (REJECTED payments are historical; see `payment-acceptance`'s "REJECTED Payments Do Not Block STATIC Closure"). Completion MUST also fail with HTTP 409 `CLOSURE_BLOCKED` if the period's active-member balances are not all zero (within a 0.01 tolerance). The system MUST return HTTP 200 with the updated period.

#### Scenario: Owner completes closure with all balances settled

- GIVEN STATIC group with CLOSING period, no PENDING payments, and all active-member balances net to zero
- WHEN owner submits `POST /groups/:groupId/periods/current/complete-closure`
- THEN period status changes to CLOSED and `isCurrent` becomes false

#### Scenario: Complete closure with PENDING payments fails

- GIVEN STATIC group with CLOSING period and a PENDING payment
- WHEN owner submits `POST /groups/:groupId/periods/current/complete-closure`
- THEN system returns HTTP 409 with `{ error: "Cannot complete closure with PENDING payments", code: "CLOSURE_BLOCKED" }`

#### Scenario: REJECTED payment alone does not block completion

- GIVEN STATIC group with CLOSING period, a REJECTED payment, no PENDING payments, and all balances net to zero
- WHEN owner submits `POST /groups/:groupId/periods/current/complete-closure`
- THEN the system does not block on the REJECTED payment; closure proceeds

#### Scenario: Complete closure with unsettled balances fails

- GIVEN STATIC group with CLOSING period, no PENDING payments, but a non-zero member balance
- WHEN owner submits `POST /groups/:groupId/periods/current/complete-closure`
- THEN system returns HTTP 409 with `{ code: "CLOSURE_BLOCKED" }`

### Requirement: Partial Closure

The system MUST allow only the group owner to perform a partial closure of a CLOSING period. The system SHALL transition the current period from CLOSING to CLOSED (`isCurrent=false`) and then create a new period with `status=OPEN`, `isCurrent=true` for the same group. Partial closure MUST fail with HTTP 409 `CLOSURE_BLOCKED` if any non-deleted payment in the period has status PENDING, or if the period's active-member balances are not all zero. The close-then-create sequence MUST be atomic: the new period MUST only be created if the closing write succeeds.

#### Scenario: Owner performs partial closure

- GIVEN STATIC group with owner user 1, current CLOSING period, no PENDING payments, and all balances net to zero
- WHEN owner submits `POST /groups/:groupId/periods/current/partial-closure`
- THEN the current period transitions to CLOSED with `isCurrent=false`, and a new period is created with `status=OPEN`, `isCurrent=true`

#### Scenario: Partial closure with unsettled balances fails

- GIVEN STATIC group with CLOSING period and a non-zero member balance
- WHEN owner submits `POST /groups/:groupId/periods/current/partial-closure`
- THEN system returns HTTP 409 with `{ code: "CLOSURE_BLOCKED" }`; no new period is created

### Requirement: Final Closure

The system MUST allow only the group owner to perform a final closure of a CLOSING period. The system SHALL transition the current period from CLOSING to FINAL (`isCurrent=false`) and set the group's `status=CLOSED`, in that lock order (Period before Group). Final closure MUST fail with HTTP 409 `CLOSURE_BLOCKED` if any non-deleted payment in the period has status PENDING, or if the period's active-member balances are not all zero. Final closure is irreversible: once `group.status=CLOSED`, no further expenses, payments, or periods MAY be created for that group.

#### Scenario: Owner performs final closure

- GIVEN STATIC group with owner user 1, current CLOSING period, no PENDING payments, and all balances net to zero
- WHEN owner submits `POST /groups/:groupId/periods/current/final-closure`
- THEN the current period transitions to FINAL with `isCurrent=false`, and `group.status` becomes CLOSED

#### Scenario: Final closure is irreversible

- GIVEN STATIC group with `status=CLOSED`
- WHEN any user attempts `POST /groups/:groupId/expenses`
- THEN system returns HTTP 403 with `{ error: "Group is permanently closed", code: "GROUP_CLOSED" }`

#### Scenario: Non-owner cannot perform final closure

- GIVEN STATIC group with owner user 1 and member user 2
- WHEN user 2 submits `POST /groups/:groupId/periods/current/final-closure`
- THEN system returns HTTP 403 with `{ error: "Only owner can perform this action", code: "FORBIDDEN" }`

### Requirement: Start Closure State Transition

The system MUST transition a period from `OPEN` to `CLOSING` via an atomic conditional update that re-asserts `status = 'OPEN'` inside the write (`updateMany` + count), never via a separate read-then-write. If two concurrent requests target the same period, exactly one MUST succeed; the other MUST receive HTTP 409 `CLOSURE_BLOCKED` instead of silently proceeding.

#### Scenario: Concurrent start-closure requests on the same OPEN period

- GIVEN a STATIC group's current period has `status = OPEN`
- WHEN two concurrent `start-closure` requests arrive for that period
- THEN exactly one request transitions the period to `CLOSING`
- AND the other request receives HTTP 409 `CLOSURE_BLOCKED`

### Requirement: Complete Closure State Transition

The system MUST transition a period from `CLOSING` to `CLOSED` via an atomic conditional update that re-asserts `status = 'CLOSING'` inside the write. Concurrent requests on the same period MUST yield exactly one success and one HTTP 409 `CLOSURE_BLOCKED`.

#### Scenario: Concurrent complete-closure requests on the same CLOSING period

- GIVEN a STATIC group's current period has `status = CLOSING`
- WHEN two concurrent `complete-closure` requests arrive for that period
- THEN exactly one request transitions the period to `CLOSED`
- AND the other request receives HTTP 409 `CLOSURE_BLOCKED`

### Requirement: Partial Closure State Transition

The system MUST close the current period (`CLOSING → CLOSED`, `isCurrent: false`) via an atomic conditional update as the first statement of its transaction, before creating the new `OPEN` period. The new period MUST only be created when the guard write succeeds. After two concurrent `partial-closure` requests on the same period, the group MUST have exactly ONE period with `isCurrent: true`; the losing request MUST receive HTTP 409 `CLOSURE_BLOCKED` and create no period record.

#### Scenario: Concurrent partial-closure requests never produce two current periods

- GIVEN a STATIC group's current period has `status = CLOSING` and all payments accepted
- WHEN two concurrent `partial-closure` requests arrive for that period
- THEN exactly one new `OPEN` period is created with `isCurrent: true`
- AND the group has exactly one period with `isCurrent: true` afterward
- AND the other request receives HTTP 409 `CLOSURE_BLOCKED` with no period created

### Requirement: Final Closure State Transition

The system MUST transition a period from `CLOSING` to `FINAL` via an atomic conditional update, and this guarded write MUST be the first statement of the transaction, followed by the `Group.status = CLOSED` update (Period-before-Group lock ordering, to avoid lock-upgrade deadlock between concurrent transactions). Concurrent requests on the same period MUST yield exactly one success and one HTTP 409 `CLOSURE_BLOCKED`.

#### Scenario: Concurrent final-closure requests on the same CLOSING period

- GIVEN a STATIC group's current period has `status = CLOSING` and all payments accepted
- WHEN two concurrent `final-closure` requests arrive for that period
- THEN exactly one request transitions the period to `FINAL` and the group to `status = CLOSED`
- AND the other request receives HTTP 409 `CLOSURE_BLOCKED` with the group's status unchanged by the loser

### Requirement: Current Period Database Invariant

The database schema MUST enforce, independent of application code, that a group has at most one `Period` row with `isCurrent = true`. This MUST be a partial unique index scoped per `groupId` (`WHERE "isCurrent" = true`), applied as defense-in-depth so the invariant holds even if a future code path omits the application-level guard.

#### Scenario: Database rejects a second current period at the storage layer

- GIVEN a group already has one `Period` row with `isCurrent = true`
- WHEN any code path attempts to insert or update a second `Period` row for that group with `isCurrent = true`
- THEN the database rejects the write with a unique-constraint violation
