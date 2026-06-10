# Design: Unificar Expense & Collective Expense

## Technical Approach

Extend the existing `Expense` model with collective-expense fields (`status`, `isLocked`, `sharedCosts`, `participantIds`) and a new `COLLECTIVE` split type. Introduce `ExpenseItem` as the permanent replacement for `IndividualItem`. COLLECTIVE expenses follow a two-phase lifecycle: creation (PENDING, no splits) → item reporting → auto-completion (COMPLETED, splits generated). Non-COLLECTIVE expenses remain single-phase (created with splits, immediately COMPLETED). Balance service filters on `isLocked=true` to exclude incomplete collective expenses. After data migration, drop `CollectiveExpense` and `IndividualItem` tables entirely.

## Architecture Decisions

| Decision | Options | Tradeoff | Choice |
|----------|---------|----------|--------|
| Item storage model | (A) Reuse `IndividualItem` relinked to Expense (B) New `ExpenseItem` model (C) JSON column on Expense | (A) carries legacy naming confusion; (C) loses relational integrity and per-user constraints | **B — new `ExpenseItem` model** with `@@unique([expenseId, userId])`, clean naming, proper FK constraints |
| Status enum scope | (A) New `ExpenseStatus` enum (B) Reuse `CollectiveExpenseStatus` | (B) includes `MATCH` which the spec removes; coupling to deprecated model | **A — new `ExpenseStatus`** with values `PENDING`, `MISMATCH`, `COMPLETED` |
| Balance filtering | (A) Filter `isLocked=true` on all expenses (B) Filter `splitType != COLLECTIVE OR status == COMPLETED` | (A) simpler, uniform; requires setting `isLocked=true` on non-collective at creation | **A — filter `isLocked=true`** — single condition, all non-COLLECTIVE get `isLocked=true` at creation |
| Payer for COLLECTIVE | (A) Creator is payer (B) Separate payer field | (A) matches existing CollectiveExpense behavior where creator fronts the money | **A — `payerId = createdById`** for COLLECTIVE expenses |
| Item reporting endpoint path | (A) `/expenses/:id/items` (B) `/collective-expenses/:id/items` | (B) perpetuates the separate-model anti-pattern | **A — nested under `/expenses/:id/items`** — unified routing |
| Split generation timing | (A) Auto on item mutation when match (B) Explicit `POST /expenses/:id/complete` | (A) matches existing `recomputeAndPersist` pattern; (B) adds unnecessary manual step | **A — auto-generate** when `sum(items) + sharedCosts == total` within ±0.01 tolerance |

## Data Flow

### COLLECTIVE Expense Lifecycle

```
Creator                    Backend                        Database
  │                           │                              │
  │── POST /expenses ────────→│── create(status=PENDING) ───→│
  │   {splitType:COLLECTIVE,  │   isLocked=true              │
  │    sharedCosts, total,    │   (non-COLLECTIVE default)   │
  │    participantIds}        │                              │
  │←── 201 {expense} ────────│←─────────────────────────────│
  │                           │                              │
  │── POST /expenses/:id ────→│── upsert item ──────────────→│
  │   /items {amount, desc}   │── recomputeStatus() ────────→│
  │                           │   if match:                  │
  │                           │     status=COMPLETED         │
  │                           │     isLocked=true            │
  │                           │     generate ExpenseSplit[]  │
  │←── 201 {item, status} ───│←─────────────────────────────│
  │                           │                              │
  │── GET /balances ─────────→│── WHERE isLocked=true ──────→│
  │                           │   (PENDING excluded)         │
  │←── balances[] ───────────│←─────────────────────────────│
```

### Split Generation Formula (on COMPLETED)

```
For each participant:
  split.amount = their_item.amount + (sharedCosts / participantCount)

Rounding: last participant absorbs remainder to ensure sum(splits) == total
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/backend/prisma/schema.prisma` | Modify | Add `COLLECTIVE` to `ExpenseSplitType`; add `ExpenseStatus` enum; add `status`, `isLocked`, `sharedCosts`, `participantIds` to `Expense`; create `ExpenseItem` model; add `expenseItems` relation to `User` |
| `apps/backend/src/utils/splits.js` | Modify | Add `calculateCollectiveSplits(items, sharedCosts, participantIds)` |
| `apps/backend/src/services/expense.service.js` | Modify | Handle COLLECTIVE in `createExpense` (no splits, status=PENDING, isLocked=false); add `reportItem`, `updateItem`, `deleteItem`, `recomputeAndPersist`, `generateSplits` |
| `apps/backend/src/schemas/expense.schemas.js` | Modify | Add `COLLECTIVE` to splitType enum; make `splits` conditionally required; add `createItemSchema`, `updateItemSchema` |
| `apps/backend/src/controllers/expense.controller.js` | Modify | Add `reportItem`, `updateItem`, `removeItem`, `getItemStatus` handlers |
| `apps/backend/src/routes/expense.routes.js` | Modify | Add `POST /expenses/:id/items`, `PUT /expenses/:id/items/:itemId`, `DELETE /expenses/:id/items/:itemId`, `GET /expenses/:id/items/status` |
| `apps/backend/src/services/balance.service.js` | Modify | Add `isLocked: true` filter to expense query |
| `apps/frontend/src/components/ExpenseForm.jsx` | Modify | Add COLLECTIVE to SPLIT_TYPES; add step-by-step wizard for COLLECTIVE (basic info → participants → shared costs → item reporting) |
| `apps/frontend/src/pages/GroupDetailPage.jsx` | Modify | Remove separate "Collective expenses" section; unify into single expense list with status badges; remove `CollectiveExpenseForm` and `IndividualItemForm` imports |
| `apps/frontend/src/services/api.js` | Modify | Add `reportItem`, `updateItem`, `deleteItem`, `getItemStatus` to `expenseService`; remove `collectiveExpenseService` and `individualItemService` |
| `apps/backend/prisma/migrations/*` | Create | 3 sequential migrations (see Migration section) |
| `apps/backend/src/services/collective-expense.service.js` | Delete | Absorbed into expense.service.js |
| `apps/backend/src/services/individual-item.service.js` | Delete | Absorbed into expense.service.js |
| `apps/backend/src/controllers/collective-expense.controller.js` | Delete | Replaced by expense controller |
| `apps/backend/src/controllers/individual-item.controller.js` | Delete | Replaced by expense controller |
| `apps/backend/src/routes/collective-expense.routes.js` | Delete | Replaced by expense routes |
| `apps/backend/src/routes/individual-item.routes.js` | Delete | Replaced by expense routes |
| `apps/frontend/src/components/CollectiveExpenseForm.jsx` | Delete | Merged into ExpenseForm |
| `apps/frontend/src/components/IndividualItemForm.jsx` | Delete | Merged into ExpenseForm |

## Interfaces / Contracts

### Prisma Schema Additions

```prisma
enum ExpenseStatus {
  PENDING
  MISMATCH
  COMPLETED
}

// Added to ExpenseSplitType:
//   COLLECTIVE

// Added to Expense model:
//   status         ExpenseStatus @default(COMPLETED)
//   isLocked       Boolean       @default(true)
//   sharedCosts    Decimal?      @default(0)
//   participantIds String[]      @default([])
//   items          ExpenseItem[]

model ExpenseItem {
  id          String   @id @default(cuid())
  expenseId   String
  userId      String
  amount      Decimal
  description String?  @default("mi gasto")
  createdAt   DateTime @default(now())

  expense     Expense  @relation(fields: [expenseId], references: [id], onDelete: Cascade)
  user        User     @relation("ExpenseItemUser", fields: [userId], references: [id])

  @@unique([expenseId, userId])
  @@index([expenseId])
}
```

### New API Endpoints

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/groups/:groupId/expenses/:id/items` | `{ amount: number, description?: string }` | 201 `{ item, expenseStatus }` |
| PUT | `/groups/:groupId/expenses/:id/items/:itemId` | `{ amount?: number, description?: string }` | 200 `{ item, expenseStatus }` |
| DELETE | `/groups/:groupId/expenses/:id/items/:itemId` | — | 204 |
| GET | `/groups/:groupId/expenses/:id/items/status` | — | 200 `{ status, itemsSum, sharedCosts, total, discrepancy }` |

### `calculateCollectiveSplits` Contract

```js
/**
 * @param {Array<{ userId: string, amount: number }>} items
 * @param {number} sharedCosts
 * @param {string[]} participantIds
 * @returns {Array<{ userId: string, amount: number }>}
 */
export function calculateCollectiveSplits(items, sharedCosts, participantIds)
// Formula: each participant owes their item amount + (sharedCosts / participantCount)
// Last participant absorbs rounding remainder
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `calculateCollectiveSplits` — rounding, zero shared costs, single participant | Pure function tests in `splits.test.js` (manual, no runner) |
| Unit | `computeStatus` — match/mismatch/pending transitions | Extract as pure function, test edge cases |
| Integration | Item reporting → auto-completion → split generation | Manual API testing with Postman/curl |
| Integration | Balance excludes PENDING, includes COMPLETED | Manual API testing |
| E2E | Full COLLECTIVE flow in ExpenseForm | Manual browser testing |

## Migration / Rollout

### Migration 1: Schema Extension
- Add `ExpenseStatus` enum
- Add `COLLECTIVE` to `ExpenseSplitType`
- Add `status`, `isLocked`, `sharedCosts`, `participantIds` to `Expense` with defaults (`COMPLETED`, `true`, `0`, `[]`)
- Create `ExpenseItem` model
- Add `expenseItems` relation to `User`
- All existing expenses automatically get `status=COMPLETED`, `isLocked=true` via defaults

### Migration 2: Data Migration (raw SQL)
```sql
-- Copy CollectiveExpense → Expense
INSERT INTO "Expense" (id, "groupId", "payerId", "createdById", description,
  amount, date, category, "splitType", status, "isLocked", "sharedCosts",
  "participantIds", "createdAt", "updatedAt")
SELECT id, "groupId", "creatorId", "creatorId", description,
  total, "createdAt", 'OTHER', 'COLLECTIVE', status, "isLocked", "sharedCosts",
  "participantIds", "createdAt", "updatedAt"
FROM "CollectiveExpense";

-- Copy IndividualItem → ExpenseItem
INSERT INTO "ExpenseItem" (id, "expenseId", "userId", amount, description, "createdAt")
SELECT id, "collectiveExpenseId", "userId", amount, description, "createdAt"
FROM "IndividualItem";
```

### Migration 3: Cleanup
- Remove `CollectiveExpense` and `IndividualItem` models from schema
- Remove `CollectiveExpenseStatus` enum
- Drop tables via Prisma migration
- Remove `collectiveExpenses` relation from `Group`
- Remove `createdCollectiveExpenses` and `individualItems` relations from `User`

### Rollback
1. Restore database from pre-migration backup
2. `prisma migrate dev` to revert schema
3. Git revert the change branch

## Open Questions

- [ ] Should the creator be able to unlock a COMPLETED COLLECTIVE expense to allow item edits? (Current old system allowed this; spec implies locking is permanent on COMPLETED)
- [ ] For migrated CollectiveExpense rows with `status=MATCH`, should they be set to `COMPLETED` with splits generated, or left as `MISMATCH`?
