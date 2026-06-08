# Tasks: Expenses and Balances

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 500–650 |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (backend foundation + expense CRUD) → PR 2 (balances + payments + wiring) → PR 3 (frontend) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Splits utility, schemas, error codes, expense service/controller/routes | PR 1 | Backend foundation + full expense CRUD; testable independently |
| 2 | Balance service/route, payment service/controller/routes, wire in index.js | PR 2 | Depends on PR 1 (shared error codes, route mounting pattern); adds balances + payments |
| 3 | ExpenseForm, GroupDetailPage extensions, API layer | PR 3 | Depends on PR 1+2 (backend endpoints must exist); frontend only |

## Phase 1: Foundation / Infrastructure

- [x] 1.1 Create `apps/backend/src/utils/splits.js` — pure functions: `calculateEqualSplit(total, memberIds)`, `calculateExactSplit(total, splits)`, `calculatePercentageSplit(total, splits)`; all amounts rounded to 2 decimals
- [x] 1.2 Create `apps/backend/src/schemas/expense.schemas.js` — Zod schemas: `createExpenseSchema`, `updateExpenseSchema` (partial), `createPaymentSchema`; include split validation helper `validateSplits(totalAmount, splitType, splits)`
- [x] 1.3 Add error codes to `apps/backend/src/utils/errors.js` — `INVALID_SPLITS`, `EXPENSE_NOT_FOUND`, `PAYMENT_NOT_FOUND`, `STATIC_GROUP_BALANCE` (update comment block)

## Phase 2: Core Implementation — Expenses

- [x] 2.1 Create `apps/backend/src/services/expense.service.js` — `createExpense(groupId, data, userId)`: validate payer is ACTIVE member, compute splits via `utils/splits.js`, create Expense + ExpenseSplits in transaction; `listExpenses(groupId)`, `getExpense(expenseId)`, `updateExpense(expenseId, data, userId)` (payer/creator only, recalc splits), `deleteExpense(expenseId, userId)` (payer/creator only, hard delete)
- [x] 2.2 Create `apps/backend/src/controllers/expense.controller.js` — `create` (validate body, call service, 201), `list` (200), `getOne` (200), `update` (validate, 200), `remove` (204); no try/catch (Express 5 async forwarding)

## Phase 3: Core Implementation — Balances

- [x] 3.1 Create `apps/backend/src/services/balance.service.js` — `calculateGroupBalances(groupId)`: verify group exists + requester is member, aggregate via raw SQL (credits from paid expenses + received payments, debits from splits + sent payments), return `[{ userId, user: { id, nickName, email }, netBalance }]` sorted DESC; support both DYNAMIC and STATIC modes per spec
- [x] 3.2 Create `apps/backend/src/controllers/balance.controller.js` — `getBalances(req, res)`: call service, return 200 with balance array

## Phase 4: Core Implementation — Payments

- [x] 4.1 Create `apps/backend/src/services/payment.service.js` — `createPayment(groupId, fromUserId, toUserId, amount, method)`: validate both users are ACTIVE members, fromUserId === requester, create Payment; `listPayments(groupId)`, `deletePayment(paymentId, userId)` (sender only, hard delete)
- [x] 4.2 Create `apps/backend/src/controllers/payment.controller.js` — `create` (validate, 201), `list` (200), `remove` (204)

## Phase 5: Integration / Wiring

- [x] 5.1 Create `apps/backend/src/routes/expense.routes.js` — `Router({ mergeParams: true })`: POST/GET/GET/:id/PUT/:id/DELETE/:id for `/groups/:groupId/expenses`, GET `/groups/:groupId/balances`; all protected via `authenticate`; use `validate()` middleware on POST/PUT
- [x] 5.2 Create `apps/backend/src/routes/payment.routes.js` — `Router({ mergeParams: true })`: POST/GET for `/groups/:groupId/payments`, DELETE `/:id`; all protected; validate POST body
- [x] 5.3 Modify `apps/backend/src/index.js` — import and mount `expenseRoutes` and `paymentRoutes` under `/groups/:groupId` (after membershipRoutes)

## Phase 6: Testing / Verification

- [ ] 6.1 Test expense CRUD: create EQUAL/EXACT/PERCENTAGE splits, verify split validation errors (sum mismatch, percentage != 100), verify payer/creator ownership on update/delete, verify non-member rejection
- [ ] 6.2 Test balance calculation: group with 2+ members, multiple expenses with different payers, record payment and verify balance adjusts, verify empty group returns zero balances
- [ ] 6.3 Test payment CRUD: create payment between members, verify fromUserId must match requester, verify sender-only delete, verify non-member rejection
- [ ] 6.4 Run ESLint on all new/changed backend files; verify no lint errors

## Phase 7: Frontend (secondary — after backend verified)

- [x] 7.1 Create `apps/frontend/src/components/ExpenseForm.jsx` — form with amount, description, category dropdown, payer selector, split type selector, split input per member; submit to `POST /groups/:id/expenses`
- [x] 7.2 Add expense list section to `apps/frontend/src/pages/GroupDetailPage.jsx` — fetch `GET /groups/:id/expenses`, display description/amount/payer/date; include ExpenseForm modal/section
- [x] 7.3 Add balance display to `apps/frontend/src/pages/GroupDetailPage.jsx` — fetch `GET /groups/:id/balances`, show net balance per member (green for positive, red for negative)
- [x] 7.4 Add payment recording to `apps/frontend/src/pages/GroupDetailPage.jsx` — form with toUserId, amount, method; submit to `POST /groups/:id/payments`; list recent payments
- [x] 7.5 Run ESLint and frontend build; verify no errors
