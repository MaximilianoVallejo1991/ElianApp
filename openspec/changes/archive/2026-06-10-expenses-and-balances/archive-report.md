# Archive Report: expenses-and-balances

**Date**: 2026-06-10
**Status**: COMPLETED / ARCHIVED (with testing note)

## Overview

This change implemented the core expense management, balance calculation, and payment recording features for the ElianApp group expense tracker. All implementation phases (backend services, controllers, routes, and frontend components) were completed successfully.

## Reconciliation Note

The orchestrator explicitly instructed archiving this change as complete with the understanding that Phase 6 (testing) is a separate concern. The following unchecked tasks in `tasks.md` are acknowledged as intentional exclusions:

- `[ ]` 6.1 Test expense CRUD
- `[ ]` 6.2 Test balance calculation
- `[ ]` 6.3 Test payment CRUD
- `[ ]` 6.4 ESLint on backend files

No CRITICAL verification issues exist — Phase 6 was never executed. The orchestrator confirmed: "The change should be archived as complete (testing is a separate concern)."

## Artifacts

| Artifact | Path | Status |
|----------|------|--------|
| Proposal | `openspec/changes/expenses-and-balances/proposal.md` | ✅ Complete |
| Spec — Expense Management | `openspec/specs/expense-management/spec.md` | ✅ Synced (added EXACT split, expense details, edit, delete) |
| Spec — Balance Calculation | `openspec/specs/balance-calculation/spec.md` | ✅ Synced (added payment effects, balance mode compatibility) |
| Spec — Payment Recording | `openspec/specs/payment-recording/spec.md` | ✅ Created (new main spec) |
| Design | `openspec/changes/expenses-and-balances/design.md` | ✅ Complete |
| Tasks | `openspec/changes/expenses-and-balances/tasks.md` | ✅ Phases 1-5, 7 complete; Phase 6 excluded per orchestrator |
| Archive Report | `openspec/changes/expenses-and-balances/archive-report.md` | ✅ This file |

## What Was Implemented

### Backend: Expense CRUD

- `apps/backend/src/utils/splits.js` — Pure functions: `calculateEqualSplit`, `calculateExactSplit`, `calculatePercentageSplit` (2-decimal rounding)
- `apps/backend/src/schemas/expense.schemas.js` — Zod schemas: `createExpenseSchema`, `updateExpenseSchema`, `createPaymentSchema`, split validation helper
- `apps/backend/src/services/expense.service.js` — `createExpense`, `listExpenses`, `getExpense`, `updateExpense`, `deleteExpense` with ownership checks, active member validation, transactional creation
- `apps/backend/src/controllers/expense.controller.js` — Async handlers for expense CRUD
- `apps/backend/src/routes/expense.routes.js` — `POST/GET/GET/:id/PUT/:id/DELETE/:id` at `/groups/:groupId/expenses`

### Backend: Balance Calculation

- `apps/backend/src/services/balance.service.js` — `calculateGroupBalances`: raw SQL aggregation computing net balance per member (credits from paid expenses + received payments, debits from splits + sent payments), sorted DESC, supports DYNAMIC/STATIC modes
- `apps/backend/src/controllers/balance.controller.js` — `getBalances` handler

### Backend: Payment Recording

- `apps/backend/src/services/payment.service.js` — `createPayment`, `listPayments`, `deletePayment` with sender-only ownership, active member validation
- `apps/backend/src/controllers/payment.controller.js` — Async handlers for payment CRUD
- `apps/backend/src/routes/payment.routes.js` — `POST/GET/DELETE/:id` at `/groups/:groupId/payments`

### Backend: Wiring

- `apps/backend/src/index.js` — Mounted expense + payment routes under `/groups/:groupId`
- `apps/backend/src/utils/errors.js` — Added error codes: `INVALID_SPLITS`, `EXPENSE_NOT_FOUND`, `PAYMENT_NOT_FOUND`, `STATIC_GROUP_BALANCE`

### Frontend

- `apps/frontend/src/components/ExpenseForm.jsx` — Form with amount, description, category, payer, split type, split input per member
- `apps/frontend/src/pages/GroupDetailPage.jsx` — Expense list, balance display (green/red), payment recording form + list
- `apps/frontend/src/api/groups.ts` — Added expense/balance/payment API calls

### Split Types Supported

- **EQUAL**: Amount split equally among all group members
- **EXACT**: Custom amounts per member (must sum to total)
- **PERCENTAGE**: Custom percentages per member (must sum to 100%)

### Balance Algorithm

```
netBalance = (expenses_paid) - (splits_owed) + (payments_received) - (payments_sent)
```

- Positive balance = others owe this user
- Negative balance = this user owes others
- Computed on every read (no caching)
- 2-decimal rounding

## Spec Sync Summary

| Domain | Action | Details |
|--------|--------|---------|
| expense-management | Updated | Added EXACT split type support, Get Expense Details, Edit Expense, Delete Expense requirements + scenarios |
| balance-calculation | Updated | Added payment effects to balance calculation, "Calculate balances with payments" scenario, Balance Mode Compatibility requirement |
| payment-recording | Created | New main spec copied from delta (no prior main spec existed) |

## Verification

No verification run was executed (Phase 6 testing was excluded per orchestrator instruction). The implementation was verified through the code review and apply process during development.

## Next Steps for Future Work

- Write unit tests for `utils/splits.js` (EQUAL/EXACT/PERCENTAGE edge cases, rounding)
- Write integration tests for expense CRUD via Supertest
- Write integration tests for balance calculation with multi-user scenarios
- Write integration tests for payment CRUD
- Add ESLint verification for backend files
- Debt simplification / minimum-transaction settlement (out of scope for this change)
