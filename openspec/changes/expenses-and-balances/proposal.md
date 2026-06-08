# Proposal: expenses-and-balances

## Intent

Add expense management and balance computation to groups. Users need to record shared expenses, split costs, track who owes whom, and settle debts — the core value of a Splitwise clone.

## Scope

### In Scope
- Create expense (amount, description, category, payer, split type, splits per user)
- List expenses by group
- Calculate net balances per user in a group
- Record payments between users
- Display expenses and balances in GroupDetail frontend page

### Out of Scope
- Settle-up / debt simplification (minimum transactions)
- Recurring expenses
- Receipt scanning / OCR
- Export to CSV
- Notifications (email/push)

## Capabilities

### New Capabilities
- `expense-management`: Create and list expenses, split types (EQUAL, EXACT, PERCENTAGE)
- `balance-calculation`: Net balance per user in a group, simplify button placeholder
- `payment-recording`: Record who paid whom to settle debts

### Modified Capabilities
- `group-management`: Extend `GET /groups/:id` to include expense list and balances
- `group-membership`: No changes

## Approach

**Backend** — Routes → Controllers → Services → Prisma (same pattern as auth-and-groups):
- `POST /groups/:groupId/expenses` — create expense with splits
- `GET /groups/:groupId/expenses` — list expenses for group
- `GET /groups/:groupId/balances` — compute net balances
- `POST /groups/:groupId/payments` — record payment
- `GET /groups/:groupId/payments` — list payments

Expense creation validates split amounts sum to total (EXACT) or 100% (PERCENTAGE). Balance algorithm: for each expense, add amount to payer's "is owed" and subtract split amount from each participant's "owes". Net = total paid - total owed.

**Frontend** — Extend GroupDetailPage to show:
- Expense list with description, amount, category, payer, date
- Balance summary per member (who owes whom)
- Add Expense modal/section
- Payment recording section

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/backend/src/routes/expense.routes.js` | New | Expense CRUD + balance routes |
| `apps/backend/src/controllers/expense.controller.js` | New | Request/response handlers |
| `apps/backend/src/services/expense.service.js` | New | Expense + balance + payment logic |
| `apps/backend/src/utils/schemas.js` | Modify | Add expense/payment Zod schemas |
| `apps/backend/src/index.js` | Modify | Register expense routes |
| `apps/frontend/src/pages/GroupDetailPage.jsx` | Modify | Replace placeholder with expenses + balances |
| `apps/frontend/src/api/groups.ts` | Modify | Add expense/balance API calls |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Decimal precision issues in balance calc | Low | Use Prisma Decimal; round to 2 decimal places |
| Split amounts don't sum to total | Low | Validate on create; reject with 400 |
| Race condition on balance read | Low | Compute from expenses each read (no cached balance) |

## Rollback Plan

1. Revert `apps/backend/src/routes/expense.routes.js`, controllers, services — delete files
2. Revert changes to `GroupDetailPage.jsx` and API layer
3. No new migrations (models already exist in schema)
4. Git revert or delete the commit

## Dependencies

- Prisma models already exist (Expense, ExpenseSplit, Payment, enum ExpenseCategory, ExpenseSplitType)
- No new npm packages required

## Success Criteria

- [ ] `POST /groups/:id/expenses` creates expense with splits, returns 201
- [ ] `GET /groups/:id/expenses` returns expense list for authenticated member
- [ ] `GET /groups/:id/balances` returns `{ userId, name, balance }` for each member
- [ ] `POST /groups/:id/payments` records payment, updates balance view
- [ ] GroupDetail page shows expenses and balances (not placeholder)
- [ ] ESLint passes on all new/changed frontend files
- [ ] Frontend build succeeds
