# Proposal: collective-expenses

## Intent

Introduce a **collective expense** model for scenarios where a group shares some costs equally and each participant also pays for individual items — think restaurant bills, group trips, or shared accommodations. Currently Splitwise only supports one person paying everything and splitting by equal shares or exact amounts. This change enables the restaurant ticket pattern: shared dishes divided among all + individual items per person, with automatic verification that parts sum to the total.

## Scope

### In Scope
- `CollectiveExpense` model (total, sharedCosts, creator, groupId, participants, status)
- `IndividualItem` model (belongs to collective expense, userId, amount, description)
- Collective expense creation workflow (creator step)
- Individual item reporting by participants
- Verification states (PENDING / MATCH / MISMATCH)
- Balance calculation: each participant owes `(their individual items) + (sharedCosts / participantCount)`; creator paid total
- Backend API endpoints for all CRUD
- Frontend UI for creator flow and participant item reporting

### Out of Scope
- Static closures workflow
- Historical reports per user
- Notifications (email/push/in-app)
- Settle-up flow (uses existing payment recording)
- Receipt scanning / OCR

## Capabilities

### New Capabilities
- `collective-expense-management`: Create/list collective expenses, report individual items, verify totals
- `collective-expense-balance`: Compute balances for collective expenses (distinct from regular expense balances)

### Modified Capabilities
- None — this is entirely new; does not modify existing `expense-management`

## Approach

**Backend** — new route/controller/service layer alongside existing expense patterns:
- `POST /groups/:groupId/collective-expenses` — create collective expense (total, sharedCosts, participantIds)
- `GET /groups/:groupId/collective-expenses` — list collective expenses for group
- `GET /groups/:groupId/collective-expenses/:id` — get single with items and verification status
- `POST /collective-expenses/:id/items` — add individual item (participant reports their consumption)
- `GET /collective-expenses/:id/balance` — compute what each participant owes

**Data model** — two new Prisma models:
```
CollectiveExpense { id, groupId, creatorId, total, sharedCosts, status: PENDING|MATCH|MISMATCH, createdAt }
IndividualItem   { id, collectiveExpenseId, userId, amount, description }
```

**Verification algorithm** — on every item add/update:
```
sumIndividualItems = SUM(IndividualItem.amount WHERE collectiveExpenseId = X)
totalParts = sumIndividualItems + collectiveExpense.sharedCosts
IF totalParts ~= collectiveExpense.total (within 0.01 tolerance) → MATCH
ELSE → MISMATCH
```

**Balance formula** for participant P:
```
owes = (SUM(IndividualItem.amount WHERE userId = P) + (sharedCosts / participantCount))
credit = 0 (creator settlement via existing payment flow)
```

**Frontend** — new pages/components:
- "Create Collective Expense" button on GroupDetailPage
- CreateCollectiveExpenseForm: total, sharedCosts, participant selector
- CollectiveExpenseCard: shows status (pending items / verification result)
- IndividualItemForm: participant reports their items
- CollectiveExpenseDetail page

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/backend/src/routes/collective-expense.routes.js` | New | All collective expense endpoints |
| `apps/backend/src/controllers/collective-expense.controller.js` | New | Request/response handlers |
| `apps/backend/src/services/collective-expense.service.js` | New | Business logic + verification |
| `apps/backend/src/utils/schemas.js` | Modify | Add Zod schemas for collective expense payloads |
| `apps/backend/src/index.js` | Modify | Register collective expense routes |
| `prisma/schema.prisma` | Modify | Add CollectiveExpense + IndividualItem models |
| `apps/frontend/src/pages/GroupDetailPage.jsx` | Modify | Add collective expense creation button |
| `apps/frontend/src/pages/CollectiveExpenseDetailPage.jsx` | New | Item reporting + verification UI |
| `apps/frontend/src/api/collective-expenses.ts` | New | API client for collective expenses |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Decimal precision in verification | Low | Use Prisma Decimal; tolerance of 0.01 on comparison |
| Concurrent item adds causing race on verification | Low | Optimistic UI; server is source of truth; re-verify on balance calc |
| New models diverge from existing Expense patterns | Low | Follow same route/service/controller structure already established |

## Rollback Plan

1. Revert `prisma/schema.prisma` — remove `CollectiveExpense` and `IndividualItem` models
2. Delete `apps/backend/src/routes/collective-expense.routes.js`, controller, service
3. Revert `apps/backend/src/index.js` to remove route registration
4. Delete `apps/frontend/src/pages/CollectiveExpenseDetailPage.jsx` and `api/collective-expenses.ts`
5. Revert `GroupDetailPage.jsx` to remove collective expense button
6. `npx prisma migrate dev` to revert DB schema
7. Git revert or delete the commit

## Dependencies

- Existing Prisma setup (Expense, ExpenseSplit models already exist — not used, but same stack)
- Existing auth middleware (same JWT pattern)
- No new npm packages required

## Success Criteria

- [ ] `POST /groups/:id/collective-expenses` creates expense, returns 201 with verification status PENDING
- [ ] Each participant can `POST /collective-expenses/:id/items` to add their individual items
- [ ] `GET /collective-expenses/:id` returns items + computed verification status (PENDING/MATCH/MISMATCH)
- [ ] `GET /collective-expenses/:id/balance` returns per-participant owes amount
- [ ] Creator UI shows "Create Collective Expense" button on group page
- [ ] Participant UI shows pending item reporting for collective expenses they're part of
- [ ] Verification UI clearly shows MATCH/MISMATCH with discrepancy amount when MISMATCH
- [ ] ESLint passes on all new/changed files
- [ ] Frontend build succeeds