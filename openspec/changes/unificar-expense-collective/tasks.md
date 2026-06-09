# Tasks: Unificar Expense & Collective Expense

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~900-1100 (additions + deletions) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (schema + backend core) → PR 2 (frontend + cleanup) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Schema + backend: COLLECTIVE expense lifecycle, item reporting, splits, balance filter | PR 1 | base: main; ~450 lines; verifiable via API calls |
| 2 | Frontend unification + delete legacy code | PR 2 | base: main (after PR 1 merge); ~500 lines; depends on PR 1 |

## Phase 1: Schema & Database

- [x] 1.1 In `apps/backend/prisma/schema.prisma`: add `ExpenseStatus` enum (`PENDING`, `MISMATCH`, `COMPLETED`), add `COLLECTIVE` to `ExpenseSplitType`
- [x] 1.2 In `schema.prisma`: add fields to `Expense` — `status ExpenseStatus @default(COMPLETED)`, `isLocked Boolean @default(true)`, `sharedCosts Decimal? @default(0)`, `participantIds String[] @default([])`, `items ExpenseItem[]`
- [x] 1.3 In `schema.prisma`: create `ExpenseItem` model with `id`, `expenseId`, `userId`, `amount Decimal`, `description String? @default("mi gasto")`, `createdAt`, relations to `Expense` (cascade) and `User` (`"ExpenseItemUser"`), `@@unique([expenseId, userId])`, `@@index([expenseId])`
- [x] 1.4 In `schema.prisma`: add `expenseItems User[]` relation to `User` model
- [x] 1.5 Run `npx prisma migrate dev --name add-collective-expense-fields` — verify migration applies cleanly
- [x] 1.6 Verify: existing expenses have `status=COMPLETED`, `isLocked=true` via defaults

## Phase 2: Backend Core — Splits & Item Reporting

- [x] 2.1 In `apps/backend/src/utils/splits.js`: add `calculateCollectiveSplits(items, sharedCosts, participantIds)` — formula: each participant owes `their_item + (sharedCosts / count)`, last participant absorbs rounding remainder
- [x] 2.2 In `apps/backend/src/utils/splits.js`: add `computeCollectiveStatus(items, sharedCosts, total)` — returns `COMPLETED` if `|sum(items) + sharedCosts - total| <= 0.01`, else `MISMATCH`
- [x] 2.3 Create `apps/backend/src/services/item-reporting.service.js`: `reportItem(expenseId, userId, amount, description)` — upsert `ExpenseItem`, call `recomputeAndPersist`, return `{ item, expenseStatus }`
- [x] 2.4 In `item-reporting.service.js`: add `updateItem(itemId, userId, amount, description)` — verify ownership (403 if not), update, recompute
- [x] 2.5 In `item-reporting.service.js`: add `deleteItem(itemId, userId)` — verify ownership, delete, recompute
- [x] 2.6 In `item-reporting.service.js`: add `recomputeAndPersist(expenseId)` — fetch items, call `computeCollectiveStatus`, update `status`/`isLocked`; if `COMPLETED`, call `generateSplits`
- [x] 2.7 In `item-reporting.service.js`: add `generateSplits(expenseId)` — delete existing splits, call `calculateCollectiveSplits`, create `ExpenseSplit` records via Prisma
- [x] 2.8 In `item-reporting.service.js`: add `getItemStatus(expenseId)` — return `{ status, itemsSum, sharedCosts, total, discrepancy }`

## Phase 3: Backend — Expense Service & Routes

- [x] 3.1 In `apps/backend/src/services/expense.service.js` `createExpense`: if `splitType === 'COLLECTIVE'`, set `status=PENDING`, `isLocked=false`, `sharedCosts`, `participantIds`; skip split generation; set `payerId = createdById`
- [x] 3.2 In `expense.service.js` `createExpense`: for non-COLLECTIVE, keep existing behavior (generate splits immediately, `isLocked=true`, `status=COMPLETED`)
- [x] 3.3 In `apps/backend/src/schemas/expense.schemas.js`: add `COLLECTIVE` to splitType enum; make `splits` conditionally required (not needed for COLLECTIVE); add `sharedCosts` and `participantIds` fields
- [x] 3.4 In `expense.schemas.js`: add `createItemSchema` (`amount` required, `description` optional), `updateItemSchema` (both optional)
- [x] 3.5 In `apps/backend/src/controllers/expense.controller.js`: add `reportItem`, `updateItem`, `removeItem`, `getItemStatus` handlers — extract params, call `item-reporting.service`, handle errors (403 ownership, 409 locked)
- [x] 3.6 In `apps/backend/src/routes/expense.routes.js`: add `POST /groups/:groupId/expenses/:id/items`, `PUT /.../items/:itemId`, `DELETE /.../items/:itemId`, `GET /.../items/status`
- [x] 3.7 Add unlock endpoint: `POST /groups/:groupId/expenses/:id/unlock` — creator-only, sets `isLocked=false`, `status=PENDING`, deletes existing splits (for COMPLETED COLLECTIVE re-editing)
- [x] 3.8 Verify: create COLLECTIVE expense via API → status PENDING, no splits

## Phase 4: Balance Integration

- [x] 4.1 In `apps/backend/src/services/balance.service.js`: add `isLocked: true` filter to expense query so PENDING COLLECTIVE expenses are excluded
- [ ] 4.2 Verify: `GET /groups/:id/balances` excludes PENDING COLLECTIVE, includes COMPLETED COLLECTIVE with splits
- [ ] 4.3 Verify: rounding — create EQUAL expense total=100, 3 participants → splits 33.33, 33.33, 33.34

## Phase 5: Frontend Unification

- [x] 5.1 In `apps/frontend/src/services/api.js`: add `reportItem(expenseId, data)`, `updateItem(expenseId, itemId, data)`, `deleteItem(expenseId, itemId)`, `getItemStatus(expenseId)`, `unlockExpense(expenseId)` to `expenseService`
- [x] 5.2 In `apps/frontend/src/components/ExpenseForm.jsx`: add `COLLECTIVE` to split type selector; add step-by-step wizard for COLLECTIVE: Step 1 (basic info + total + sharedCosts + participantIds), Step 2 (item reporting UI per participant with running sum vs total)
- [x] 5.3 In `ExpenseForm.jsx`: add real-time validation display — show `itemsSum + sharedCosts` vs `total`, green/red indicator, ±0.01 tolerance
- [x] 5.4 In `apps/frontend/src/pages/GroupDetailPage.jsx`: remove separate "Collective expenses" section; show unified expense list with status badges (PENDING/MISMATCH/COMPLETED); remove `CollectiveExpenseForm` and `IndividualItemForm` imports
- [x] 5.5 In `GroupDetailPage.jsx`: add item reporting modal/section for COLLECTIVE expenses (participants can add/edit/delete their items)
- [ ] 5.6 Verify: full COLLECTIVE flow in browser — create → report items → auto-complete → check balances

## Phase 6: Cleanup — Delete Legacy Code

- [x] 6.1 Delete `apps/backend/src/routes/collective-expense.routes.js`
- [x] 6.2 Delete `apps/backend/src/controllers/collective-expense.controller.js`
- [x] 6.3 Delete `apps/backend/src/services/collective-expense.service.js`
- [x] 6.4 Delete `apps/backend/src/routes/individual-item.routes.js`
- [x] 6.5 Delete `apps/backend/src/controllers/individual-item.controller.js`
- [x] 6.6 Delete `apps/backend/src/services/individual-item.service.js`
- [x] 6.7 Delete `apps/frontend/src/components/CollectiveExpenseForm.jsx`
- [x] 6.8 Delete `apps/frontend/src/components/IndividualItemForm.jsx`
- [x] 6.9 In `apps/frontend/src/services/api.js`: remove `collectiveExpenseService` and `individualItemService` exports
- [x] 6.10 Remove collective/individual-item route registrations from backend `app.js` or `index.js`
- [x] 6.11 Global search for `CollectiveExpense`, `IndividualItem`, `collective-expense`, `individual-item` — fix any remaining references
- [x] 6.12 Verify: `npm run build` (frontend) succeeds, no import errors

## Phase 7: Schema Cleanup — Drop Legacy Tables

- [x] 7.1 In `schema.prisma`: delete `CollectiveExpense` model, `IndividualItem` model, `CollectiveExpenseStatus` enum
- [x] 7.2 In `schema.prisma`: remove `collectiveExpenses` relation from `Group`, remove `createdCollectiveExpenses` and `individualItems` relations from `User`
- [x] 7.3 Run `npx prisma migrate dev --name drop-collective-tables` — verify tables dropped
- [x] 7.4 Verify: backend starts without errors, all expense CRUD works for EQUAL, PERCENTAGE, COLLECTIVE
