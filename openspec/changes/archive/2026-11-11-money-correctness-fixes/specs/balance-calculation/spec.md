# Delta for Balance Calculation

## ADDED Requirements

### Requirement: Exclude Soft-Deleted Records From Balance, Period, and Closure Queries

The system MUST exclude soft-deleted payments and expenses (`deletedAt` set) from every balance, period, and closure computation. This applies to: `balance.service.js` ACCEPTED payment lookup used for net balances; `period.service.js` period summaries, expense/payment counts, and `getPeriodExpenses`; and `closure.service.js` ACCEPTED payment queries and PENDING payment/expense counts used to gate `startClosure`, `completeClosure`, `partialClosure`, and `finalClosure`. A soft-deleted record MUST NOT contribute to any returned balance, total, or count.

#### Scenario: Soft-deleted payment excluded from group balances

- GIVEN group 1 has an ACCEPTED payment from user A to user B that has been soft-deleted (`deletedAt` set)
- WHEN user requests `GET /groups/1/balances`
- THEN the soft-deleted payment's amount is not reflected in either user's net balance

#### Scenario: Soft-deleted expense excluded from period expenses

- GIVEN a period has an expense that has been soft-deleted (`deletedAt` set)
- WHEN the owner requests the period's expense list via `getPeriodExpenses`
- THEN the soft-deleted expense does not appear and its amount is excluded from the period total

#### Scenario: Soft-deleted payment excluded from period payment counts

- GIVEN a period has one PENDING payment that has been soft-deleted
- WHEN the system computes the period's pending-payment count
- THEN the soft-deleted payment is not counted
