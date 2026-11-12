# Period Management Specification

## Purpose

Manages the STATIC-group closure state machine for periods (`OPEN → CLOSING → CLOSED`/`FINAL`, with partial reopen into a new `OPEN` period) and its concurrency guarantees. This is the first live spec for this capability; naming follows the convention established by the (void, unmerged) `static-group-closures` change rather than the current proposal's internal label (`period-closure`).

Scope boundary: these requirements guarantee that concurrent calls to the same transition cannot both succeed and cannot corrupt the `isCurrent` invariant. They do NOT guarantee that every precondition read (e.g. zero-balance check, PENDING-payment count) is itself race-free against a concurrent mutation — that is a separate, pre-existing staleness class, explicitly out of scope.

## Requirements

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
