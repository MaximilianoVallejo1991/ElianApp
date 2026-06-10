# Static Balance Calculation Specification

## Purpose

Defines balance and closure behavior for STATIC groups. Balance calculation uses the SAME base algorithm for both DYNAMIC and STATIC modes — both recalculate on every expense and every accepted payment. The key difference: STATIC groups in CLOSING state MUST disable transitive debt simplification, operating only on direct debts. DYNAMIC groups apply transitive settlement where any member's payment can affect any other member's balance. STATIC groups in OPEN state may use transitive simplification; once CLOSING begins, only direct debts are shown and settled.

## Requirements

### Requirement: Balance Calculation Identical Across Modes

The system MUST calculate balances using the same base algorithm for both DYNAMIC and STATIC groups. Every accepted payment MUST trigger a balance recalculation. Every new expense MUST trigger a balance recalculation. The system MUST NOT apply different balance logic based on group mode, EXCEPT that STATIC groups in CLOSING state MUST disable transitive debt simplification (see "No Transitive Debt Simplification During Closure").

#### Scenario: STATIC group recalculates balance on accepted payment

- GIVEN STATIC group in a CLOSING period where user1 owes user2 $50
- WHEN user1 registers a payment and user2 (creditor) accepts it
- THEN system recalculates balance, reducing user1's direct debt to user2

#### Scenario: DYNAMIC group recalculates balance identically

- GIVEN DYNAMIC group with existing expenses
- WHEN a payment is accepted
- THEN system recalculates balance using the same base algorithm as STATIC mode, including transitive settlement effects

### Requirement: No Transitive Debt Simplification During Closure

When a STATIC group period is in CLOSING state, the system MUST NOT apply transitive debt simplification. Each member's debt MUST reflect only direct obligations — who owes whom, as recorded by expense splits, without any transitive cancellation or reassignment. Payments during CLOSING MUST reduce only the direct debt between payer and creditor, and MUST NOT alter any other member's debts. This prevents confusing side effects where a member's balance changes without their action.

#### Scenario: Direct debt unchanged by payment between other members

- GIVEN STATIC group in CLOSING period where userA owes userB $100 and userB owes userC $100
- WHEN userB pays userC $100 and userC accepts the payment
- THEN userB's debt to userC is settled
- AND userA's debt to userB remains $100 unchanged
- AND the system MUST NOT show userA owing userC

#### Scenario: Transitive simplification disabled during CLOSING

- GIVEN STATIC group with OPEN period where transitive simplification is active (userA owes userB $100, userB owes userC $100 may simplify to userA owes userC $100)
- WHEN closure starts and period transitions to CLOSING
- THEN system MUST switch to direct-debt-only mode
- AND all balances revert to raw direct debts from expense splits
- AND transitive simplification MUST NOT be applied until a new OPEN period begins

#### Scenario: Payment reduces direct debt only during CLOSING

- GIVEN STATIC group in CLOSING period where user1 owes user2 $100 directly
- WHEN user1 pays user2 $60 and user2 accepts
- THEN user1's debt to user2 becomes $40
- AND no other member's debts change as a side effect

### Requirement: STATIC Closure Period Freezes Expense Creation

The system MUST block new expense creation for STATIC groups when the current period status is CLOSING. The closure snapshot MUST capture direct debts only — who owes whom directly, as recorded by expense splits. During closure, only payment registration and acceptance are permitted — no new expenses can alter the snapshot.

#### Scenario: Expense creation blocked during CLOSING

- GIVEN STATIC group with current period in CLOSING status
- WHEN a member attempts to create a new expense
- THEN system rejects the expense creation with an error indicating the period is locked

#### Scenario: Balance snapshot captures direct debts at closure start

- GIVEN STATIC group with current period OPEN, where user1 owes user2 $100 (direct) and user3 owes user2 $50 (direct)
- WHEN closure is started and period transitions to CLOSING
- THEN balance snapshot records direct debts only (user1 owes $100 to user2, user3 owes $50 to user2)
- AND no transitive simplification is applied to the snapshot
- AND no new expenses can alter this snapshot

#### Scenario: Accepted payments reduce direct debt in snapshot

- GIVEN STATIC group in CLOSING period, user1 directly owes user2 $100
- WHEN user1 pays $60 and user2 accepts the payment
- THEN balance recalculates to show user1 directly owes user2 $40
- AND no other member's debt changes as a side effect

### Requirement: Post-Closure Balance Reset

After closure completes (all debts settled and all payments accepted), the system MUST zero balances for that period. For partial closure, a new OPEN period starts with fresh zero balances. For final closure, the group is permanently closed — no further expenses or periods allowed.

#### Scenario: Partial closure opens new period with zero balances

- GIVEN STATIC group in CLOSING period where all debts are settled and all payments accepted
- WHEN closure completes as partial closure
- THEN period transitions to CLOSED with zero net balances
- AND a new OPEN period is created with zero balances
- AND members can create new expenses in the new period

#### Scenario: Final closure permanently locks group

- GIVEN STATIC group in CLOSING period where all debts are settled
- WHEN closure completes as final closure
- THEN period transitions to FINAL
- AND group status is set to CLOSED
- AND no further expenses or periods can be created

#### Scenario: Closure blocked when unsettled debts remain

- GIVEN STATIC group in CLOSING period where user1 still owes user2 $30
- WHEN attempt is made to complete closure
- THEN system rejects the closure with an error indicating unsettled debts remain

### Requirement: DYNAMIC Continuous Balance Behavior

DYNAMIC groups MUST operate with continuous balance calculation and no closure periods. Transitive debt simplification is a DYNAMIC-only feature — any member's payment or expense CAN affect any other member's balance through transitive settlement. The system MUST NOT impose period boundaries or closures on DYNAMIC groups. Transitive settlement is appropriate for DYNAMIC groups because balances change continuously and there is no closure snapshot to protect.

#### Scenario: DYNAMIC balance changes from unrelated payment

- GIVEN DYNAMIC group where userA, userB, and userC are members, and userA owes userB $100 while userB owes userC $100
- WHEN transitive simplification applies and userB pays userC
- THEN userA's debt MAY be redirected to userC as a side effect
- AND no closure or period boundary applies

#### Scenario: STATIC CLOSING does not allow transitive side effects

- GIVEN STATIC group in CLOSING period where userA owes userB $100 and userB owes userC $100
- WHEN userB pays userC and userC accepts
- THEN userA's debt to userB MUST remain unchanged
- AND the system MUST NOT redirect userA's debt to userC

### Requirement: Historical Balance Query

The system MUST allow querying balances for a specific past period via `GET /groups/:groupId/periods/:periodId/balances`. The system MUST return the balances as they were at the time the period closed (frozen snapshot).

#### Scenario: Query closed period balances

- GIVEN STATIC group with period 1 (CLOSED) and period 2 (OPEN)
- WHEN user requests `GET /groups/:groupId/periods/1/balances`
- THEN system returns the frozen balances from period 1 as they were at closure time

#### Scenario: Query open period balances

- GIVEN STATIC group with period 2 (OPEN)
- WHEN user requests `GET /groups/:groupId/periods/2/balances`
- THEN system returns live-calculated balances for period 2