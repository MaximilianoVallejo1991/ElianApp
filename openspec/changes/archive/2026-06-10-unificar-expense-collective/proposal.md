# Proposal: unificar-expense-collective

## Intent

Unify the separate **Expense** and **CollectiveExpense** flows into a single model. Currently CollectiveExpense does not affect balances (functional bug), duplicates logic, and forces users through two different UIs. We will extend `Expense` to support the collective pattern (shared costs + individual items) via a new `COLLECTIVE` split type, then completely remove `CollectiveExpense` and `IndividualItem` from the codebase and database.

## Scope

### In Scope
- Add `COLLECTIVE` to `ExpenseSplitType` enum
- Add `status`, `isLocked`, `sharedCosts`, `participantIds` to `Expense` model
- Add item-reporting endpoints under existing expense routes
- Compute and persist `ExpenseSplit` records when a collective expense reaches `COMPLETED`
- Extend `ExpenseForm` with collective flow (step-by-step wizard)
- Delete `CollectiveExpenseForm`, `IndividualItemForm`, and all collective-expense backend code
- Migrate existing `CollectiveExpense` + `IndividualItem` data into `Expense`

### Out of Scope
- New notification system
- Receipt scanning / OCR
- Changes to Payment or Group models
- Static closure workflow

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `expense-management`: Add `COLLECTIVE` split type, status lifecycle (PENDING → COMPLETED), item reporting, and shared-costs handling
- `balance-calculation`: Include `COLLECTIVE` expenses once they are `COMPLETED` and have `ExpenseSplit` records
- `collective-expense-management`: **Deprecated / removed** — absorbed into `expense-management`
- `individual-item-reporting`: **Deprecated / removed** — absorbed into `expense-management`

## Approach

**Schema** — Extend `Expense` with fields formerly on `CollectiveExpense`. Add `COLLECTIVE` to `ExpenseSplitType`. Keep `CollectiveExpense` and `IndividualItem` temporarily for data migration only.

**Backend** — 
- `POST /groups/:id/expenses` accepts `splitType: COLLECTIVE`, creates expense with `status=PENDING`, `isLocked=false`, no `ExpenseSplit` records yet.
- `POST /expenses/:id/items` — participants report individual items (replaces individual-item routes).
- On every item mutation, recompute verification: `SUM(items) + sharedCosts` vs `total`. Within 0.01 tolerance → `COMPLETED`, `isLocked=true`.
- When `COMPLETED`, generate `ExpenseSplit` records: each participant owes `(their individual items) + (sharedCosts / participantCount)`. This makes the expense visible to `balance.service.js`.
- Delete all collective-expense routes, controllers, services, and schemas.

**Frontend** — Extend `ExpenseForm` with a step-by-step flow for `COLLECTIVE`: (1) basic info + total + shared costs + participants, (2) item reporting UI. Remove `CollectiveExpenseForm` and `IndividualItemForm`. Update `GroupDetailPage` to show unified expense list.

**Migration** — Prisma migration script moves `CollectiveExpense` rows into `Expense` (creator becomes payer), and `IndividualItem` rows are attached to the new expense structure. After migration, drop `CollectiveExpense` and `IndividualItem` tables.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `prisma/schema.prisma` | Modify | Add fields to `Expense`; add `COLLECTIVE` enum value; drop `CollectiveExpense` + `IndividualItem` after migration |
| `apps/backend/src/utils/splits.js` | Modify | Add `calculateCollectiveSplits(total, items, sharedCosts, participantIds)` |
| `apps/backend/src/services/expense.service.js` | Modify | Handle `COLLECTIVE` creation, item reporting, status transitions, split generation on completion |
| `apps/backend/src/services/balance.service.js` | Modify | Ensure `COLLECTIVE` expenses with splits are included (they will be via existing query) |
| `apps/backend/src/routes/expense.routes.js` | Modify | Add `POST /:id/items`, `PUT /:id/items/:itemId`, `DELETE /:id/items/:itemId` |
| `apps/backend/src/schemas/expense.schemas.js` | Modify | Add collective and item schemas |
| `apps/frontend/src/components/ExpenseForm.jsx` | Modify | Add `COLLECTIVE` split type UI with stepper |
| `apps/frontend/src/pages/GroupDetailPage.jsx` | Modify | Show unified expense list; remove collective-expense-specific buttons |
| `apps/frontend/src/services/api.js` | Modify | Remove collective-expense API functions; add item-reporting helpers to expense service |
| `apps/backend/src/routes/collective-expense.routes.js` | Remove | Entire file deleted |
| `apps/backend/src/controllers/collective-expense.controller.js` | Remove | Entire file deleted |
| `apps/backend/src/services/collective-expense.service.js` | Remove | Entire file deleted |
| `apps/backend/src/routes/individual-item.routes.js` | Remove | Entire file deleted |
| `apps/backend/src/controllers/individual-item.controller.js` | Remove | Entire file deleted |
| `apps/backend/src/services/individual-item.service.js` | Remove | Entire file deleted |
| `apps/frontend/src/components/CollectiveExpenseForm.jsx` | Remove | Entire file deleted |
| `apps/frontend/src/components/IndividualItemForm.jsx` | Remove | Entire file deleted |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Data loss during migration | Low | Backup database before migration; validate migrated data counts |
| Balance calculation error on collective completion | Medium | Unit-test `calculateCollectiveSplits` with edge cases (rounding, single participant, zero shared costs) |
| Frontend UI regression | Low | Manual test all three split types (EQUAL, EXACT, PERCENTAGE) after unification |
| Incomplete cleanup — hidden references | Medium | Global search for `CollectiveExpense`, `IndividualItem`, `collective-expense` after deletion |

## Rollback Plan

1. Restore database from pre-migration backup.
2. Revert Prisma schema to previous version and run `prisma migrate dev`.
3. Git revert the entire change commit (or branch).
4. Re-deploy previous frontend build.

## Dependencies

- Existing `Expense`, `ExpenseSplit`, `Payment`, `Group`, `User` models (no external dependencies).

## Success Criteria

- [ ] `POST /groups/:id/expenses` with `splitType: COLLECTIVE` creates expense with `status=PENDING` and no splits
- [ ] Participants can `POST /expenses/:id/items` to report individual items
- [ ] When items + sharedCosts match total (±0.01), status becomes `COMPLETED`, `isLocked=true`, and `ExpenseSplit` records are created
- [ ] `GET /groups/:id/balances` correctly includes completed collective expenses
- [ ] `CollectiveExpense` and `IndividualItem` tables are removed from Prisma schema and database
- [ ] No references to `collective-expense`, `CollectiveExpense`, or `IndividualItem` remain in backend or frontend code
- [ ] `ExpenseForm` supports all four split types including `COLLECTIVE`
- [ ] ESLint passes and frontend build succeeds

---

## Proposal Question Round

Before finalizing specs, please confirm or correct the following assumptions:

1. **Business problem**: Is the main driver the balance bug (CollectiveExpense not affecting balances), or is simplifying to one UI equally important?
2. **Payer for migrated collective expenses**: Should the `CollectiveExpense.creator` become the `Expense.payer`, or do you want a different mapping?
3. **Item editing after COMPLETED**: Once a collective expense is `COMPLETED` and `isLocked=true`, should the creator be able to unlock it (like the old system), or is locking permanent?
4. **Zero shared costs**: Should `COLLECTIVE` expenses allow `sharedCosts=0` (purely individual items), or must shared costs be >0?
5. **MISMATCH status**: The old system had `MATCH` and `MISMATCH`. Do you want to keep `MISMATCH` as a possible state, or simplify to only `PENDING` and `COMPLETED`?
