# Tasks: Collective Expenses

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~800-1000 (backend ~500, frontend ~300-400, schema + migration ~100) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (backend foundation + API) → PR 2 (frontend UI) |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Schema + migration + backend API (services, controllers, routes) | PR 1 | Base = feature/collective-expenses; all backend files |
| 2 | Frontend UI (components, page integration, API client) | PR 2 | Base = PR 1 branch; frontend only |

## Phase 1: Schema + Migration

- [x] 1.1 Update `apps/backend/prisma/schema.prisma`: Add `CollectiveExpenseStatus` enum (PENDING, MATCH, MISMATCH, COMPLETED), `CollectiveExpense` model (id, groupId, creatorId, description?, total, sharedCosts, status, isLocked, participantIds, createdAt, updatedAt), `IndividualItem` model (id, collectiveExpenseId, userId, amount, description?, createdAt), relations to Group and User
- [x] 1.2 Run `npx prisma migrate dev --name add_collective_expenses` from `apps/backend/` — used `prisma db push` due to dev DB drift (inviteToken/inviteExpires); schema synced, client regenerated

## Phase 2: Foundation (errors, schemas)

- [x] 2.1 Add error codes to `apps/backend/src/utils/errors.js`: COLLECTIVE_NOT_FOUND, ITEM_NOT_FOUND, NOT_PARTICIPANT, CANNOT_UPDATE_AFTER_ITEMS, CANNOT_DELETE_WITH_ITEMS, NOT_CREATOR, ITEMS_LOCKED, ALREADY_REPORTED
- [x] 2.2 Create `apps/backend/src/schemas/collective-expense.schemas.js`: createCollectiveExpenseSchema, updateCollectiveExpenseSchema, createItemSchema, updateItemSchema, unlockSchema (empty object)

## Phase 3: Service Layer

- [x] 3.1 Create `apps/backend/src/services/collective-expense.service.js`: create(groupId, creatorId, data), list(groupId), getOne(id), update(id, creatorId, data), delete(id, creatorId) [as remove], unlock(id, creatorId), lock(id, creatorId), computeStatus(expense, items, participantIds), recomputeAndPersist(id)
- [x] 3.2 Create `apps/backend/src/services/individual-item.service.js`: add(collectiveExpenseId, userId, data), update(itemId, userId, data), delete(itemId, userId) [as remove] — each recompute status after mutation

## Phase 4: Controllers + Routes

- [x] 4.1 Create `apps/backend/src/controllers/collective-expense.controller.js`: create, list, getOne, update, remove, unlock — auth middleware, validation, error handling following existing patterns
- [x] 4.2 Create `apps/backend/src/routes/collective-expense.routes.js`: POST/GET/GET/:id/PUT/:id/DELETE/:id/POST/:id/unlock under `/groups/:groupId/collective-expenses`
- [x] 4.3 Create `apps/backend/src/controllers/individual-item.controller.js`: add, update, remove — auth middleware, validation, error handling
- [x] 4.4 Create `apps/backend/src/routes/individual-item.routes.js`: POST/PUT/:itemId/DELETE/:itemId under `/groups/:groupId/collective-expenses/:id/items`
- [x] 4.5 Wire routes in `apps/backend/src/index.js`: mount collective-expense routes at `/groups/:groupId/collective-expenses` and individual-item routes at `/groups/:groupId/collective-expenses/:id/items`

## Phase 5: Verification Logic

- [x] 5.1 Implement computeStatus in collective-expense.service.js: if items.length < participantIds.length → PENDING; else sum items + sharedCosts vs total (±0.01 tolerance) → COMPLETED or MISMATCH
- [x] 5.2 When computeStatus returns MATCH (discrepancy ≤ 0.01): auto-set status to COMPLETED and isLocked to true (via recomputeAndPersist)
- [x] 5.3 Unlock endpoint: set isLocked = false, reset status to PENDING (allows new items/edits)

## Phase 6: Frontend Components + Integration

- [x] 6.1 Create `apps/frontend/src/components/CollectiveExpenseForm.jsx` — modal form: total, sharedCosts, description, participant multi-select
- [x] 6.2 Create `apps/frontend/src/components/IndividualItemForm.jsx` — inline/modal form: amount, description for reporting own item
- [x] 6.3 Add collective expense list + status badges to `apps/frontend/src/pages/GroupDetailPage.jsx`
- [x] 6.4 Add item reporting UI to `apps/frontend/src/pages/GroupDetailPage.jsx` — show pending items, MATCH/MISMATCH indicators
- [x] 6.5 Add API methods to `apps/frontend/src/services/api.js`: createCollectiveExpense, listCollectiveExpenses, getCollectiveExpense, updateCollectiveExpense, deleteCollectiveExpense, unlockCollectiveExpense, addItem, updateItem, deleteItem
