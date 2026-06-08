# Design: Collective Expenses

## Technical Approach

Implement collective expenses as two new Prisma models (`CollectiveExpense`, `IndividualItem`) with a service/controller/route layer mirroring the existing expense pattern. The core innovation is the verification algorithm that computes PENDING/MATCH/MISMATCH by comparing `sum(items) + sharedCosts` against `total` within a 0.01 tolerance. Creator is treated as the payer who fronted `total`; participants owe their individual items plus a proportional share of shared costs.

## Architecture Decisions

### Decision: Store participantIds as a JSON array on CollectiveExpense

**Choice**: `participantIds String[]` stored as Prisma `String[]` (PostgreSQL JSON array)
**Alternatives considered**: Separate `CollectiveExpenseParticipant` join table
**Rationale**: The participant list is immutable after creation (cannot add/remove once items exist). JSON array avoids extra joins for simple membership checks and matches how the verification algorithm consumes participants — as a count and membership set.

### Decision: Status computed on read, stored on write

**Choice**: Recompute `status` on every item add/update/delete and persist it to `CollectiveExpense.status`
**Alternatives considered**: Compute status dynamically on every GET
**Rationale**: GET /collective-expenses/:id is called frequently (polling UI). Persisting avoids recalculation overhead. The status is cheap to compute (one SUM query) and essential for indexing/filtering.

### Decision: Creator is implicitly the payer

**Choice**: No separate `payerId` field; `creatorId` is the person who fronted the money
**Alternatives considered**: Explicit `payerId` like Expense model
**Rationale**: In the collective expense model, the creator always fronted the total amount. Settlement uses existing Payment flow. Simpler model.

## Data Flow

```
User → POST /groups/:groupId/collective-expenses
         → CollectiveExpenseController.create()
         → CollectiveExpenseService.create() 
         → Prisma: create CollectiveExpense (status=PENDING)
         → Response: 201 + expense with status

User → POST /groups/:groupId/collective-expenses/:id/items
         → IndividualItemController.add()
         → IndividualItemService.add()
         → Prisma: create IndividualItem
         → CollectiveExpenseService.recomputeStatus()
         → Response: 201 + item

User → GET /groups/:groupId/collective-expenses/:id
         → CollectiveExpenseService.getOne()
         → Prisma: CollectiveExpense + IndividualItem (include user)
         → Response: expense + items + computed verification
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/backend/prisma/schema.prisma` | Modify | Add `CollectiveExpense` model, `IndividualItem` model, `CollectiveExpenseStatus` enum |
| `apps/backend/src/services/collective-expense.service.js` | Create | CRUD + status computation + balance calculation |
| `apps/backend/src/services/individual-item.service.js` | Create | Item add/update/delete with ownership check |
| `apps/backend/src/controllers/collective-expense.controller.js` | Create | Request/response handlers |
| `apps/backend/src/controllers/individual-item.controller.js` | Create | Request/response handlers |
| `apps/backend/src/routes/collective-expense.routes.js` | Create | 5 routes for collective expense CRUD |
| `apps/backend/src/routes/individual-item.routes.js` | Create | 3 routes for item management |
| `apps/backend/src/schemas/collective-expense.schemas.js` | Create | Zod schemas for all request bodies |
| `apps/backend/src/index.js` | Modify | Import and mount collective expense routes |
| `apps/backend/src/utils/errors.js` | Modify | Add new error codes |

## Interfaces / Contracts

### Prisma Models

```prisma
model CollectiveExpense {
  id            String                    @id @default(cuid())
  groupId       String
  creatorId     String
  description   String?
  total         Decimal
  sharedCosts   Decimal
  status        CollectiveExpenseStatus  @default(PENDING)
  isLocked      Boolean                  @default(false)  // Creator can lock/unlock for editing
  participantIds String[]                // JSON array of user IDs
  createdAt     DateTime                 @default(now())
  updatedAt     DateTime                 @updatedAt
  group         Group                    @relation(...)
  creator       User                     @relation(...)
  items         IndividualItem[]
}

model IndividualItem {
  id                  String          @id @default(cuid())
  collectiveExpenseId String
  userId              String
  amount              Decimal
  description         String?
  createdAt           DateTime        @default(now())
  collectiveExpense   CollectiveExpense @relation(...)
  user                User            @relation(...)
}

enum CollectiveExpenseStatus {
  PENDING     // Not all participants reported yet
  MATCH       // All reported and verified — sum matches total (±0.01). AUTO sets COMPLETED.
  MISMATCH    // All reported but sum ≠ total
  COMPLETED   // Settled — creator confirmed or automatic after MATCH
}
```

### Verification Algorithm

```javascript
function computeStatus(collectiveExpense, items, participantIds) {
  const allReported = items.length === participantIds.length;
  if (!allReported) return 'PENDING';

  const sumItems = items.reduce((sum, item) => sum + Number(item.amount), 0);
  const totalParts = sumItems + Number(collectiveExpense.sharedCosts);
  const discrepancy = Math.abs(totalParts - Number(collectiveExpense.total));

  const status = discrepancy <= 0.01 ? 'MATCH' : 'MISMATCH';
  
  // If MATCH, set status to COMPLETED immediately (auto-settlement)
  return status;
}
```

### Balance Formula (per participant P)

```javascript
function computeBalance(collectiveExpense, items, participantIds) {
  const sharedCostPerPerson = Number(collectiveExpense.sharedCosts) / participantIds.length;
  
  // Creator (who fronted total) is owed by each participant
  // Participant P owes: (their items sum) + (sharedCostPerPerson)
  // Creator owes: 0 (they already paid)
  
  const participantOwes = items
    .filter(i => i.userId !== collectiveExpense.creatorId)
    .map(item => ({
      userId: item.userId,
      owes: Number(item.amount) + sharedCostPerPerson
    }));
    
  return participantOwes;
}
```

### Zod Schemas

```javascript
// POST /groups/:groupId/collective-expenses
export const createCollectiveExpenseSchema = z.object({
  description: z.string().optional(),
  total: z.number().positive(),
  sharedCosts: z.number().min(0),
  participantIds: z.array(z.string().cuid()).min(1)
});

// PUT /groups/:groupId/collective-expenses/:id
export const updateCollectiveExpenseSchema = z.object({
  description: z.string().optional(),
  total: z.number().positive().optional(),
  sharedCosts: z.number().min(0).optional(),
  participantIds: z.array(z.string().cuid()).optional()
}).refine(data => 
  data.total !== undefined || data.sharedCosts !== undefined || data.participantIds !== undefined,
  { message: 'At least one field required' }
);

// POST /groups/:groupId/collective-expenses/:id/items
export const createItemSchema = z.object({
  amount: z.number().positive(),
  description: z.string().optional()
});

// PUT /groups/:groupId/collective-expenses/:id/items/:itemId
export const updateItemSchema = z.object({
  amount: z.number().positive().optional(),
  description: z.string().optional()
}).refine(data => 
  data.amount !== undefined || data.description !== undefined,
  { message: 'At least one field required' }
);
```

### Error Codes

| Code | Status | Condition |
|------|--------|-----------|
| `COLLECTIVE_NOT_FOUND` | 404 | CollectiveExpense does not exist |
| `ITEM_NOT_FOUND` | 404 | IndividualItem does not exist |
| `NOT_PARTICIPANT` | 403 | User is not in participantIds |
| `CANNOT_UPDATE_AFTER_ITEMS` | 400 | Items exist, update not allowed |
| `CANNOT_DELETE_WITH_ITEMS` | 400 | Items exist, delete not allowed |
| `NOT_CREATOR` | 403 | User is not the expense creator |
| `ALREADY_REPORTED` | 400 | Participant already has an item |
| `ITEMS_LOCKED` | 403 | Collective expense is locked (MATCH reached); creator must unlock first |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | computeStatus(), computeBalance() | Direct function calls with mock data |
| Service | Service methods with Prisma mock | Test auth checks, ownership, status transitions |
| Integration | Full route with test DB | Use existing supertest pattern from codebase |

## Migration / Rollout

No migration required — new models only. `npx prisma migrate dev` creates tables. No data transformation needed since this is entirely additive.

## Open Questions

- [x] Should `COMPLETED` status be set automatically when MATCH is achieved, or require explicit creator action?
  → **RESOLVED**: Automatically when MATCH — no manual confirmation needed.

- [x] Do we need to prevent adding items after status becomes MATCH (i.e., lock the expense)?
  → **RESOLVED**: Items are locked after MATCH. Creator can unlock for editing via explicit action. Added `isLocked Boolean @default(false)` field to CollectiveExpense model.