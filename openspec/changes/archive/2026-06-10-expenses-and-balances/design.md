# Design: expenses-and-balances

## Technical Approach

Backend-only implementation following the existing Routes → Controllers → Services → Prisma pattern. Split calculation logic lives in `utils/splits.js` as pure functions. Balance is computed on every read (no caching). Payment recording affects balance but creates no expense.

## Architecture Decisions

### Decision: Split calculation as pure utility functions

**Choice**: `utils/splits.js` with `calculateEqualSplit`, `calculateExactSplit`, `calculatePercentageSplit`
**Alternatives considered**: Putting logic in expense service, using a class
**Rationale**: Pure functions are unit-testable without DB mocks; follows the existing utility pattern (`password.js`, `jwt.js`)

### Decision: Balance computed on read

**Choice**: No `balance` field on User/Group; compute from `ExpenseSplit` + `Payment` on every `GET /balances` request
**Alternatives considered**: Cached balance field with invalidation
**Rationale**: Avoids stale data, race conditions on concurrent expense/payment edits; low read volume expected

### Decision: Route grouping

**Choice**: `expense.routes.js` at `/groups/:groupId/expenses` and `balances`; `payment.routes.js` at `/groups/:groupId/payments`
**Alternatives considered**: Single combined routes file
**Rationale**: Aligns with separation of concerns; mirrors `membership.routes.js` structure

### Decision: Ownership checks in service layer

**Choice**: Payer/creator check in `expense.service.js`; sender check in `payment.service.js`
**Alternatives considered**: Middleware-based ownership validation
**Rationale**: Matches existing pattern (`group.service.js` checks ownerId); avoids middleware complexity for one-off checks

## Data Flow

```
Expense Creation:
  POST /groups/:groupId/expenses
    → validate (Zod) → authenticate (JWT) → expenseController.create
      → expenseService.createExpense (calculates splits, validates sum)
        → prisma.expense.create + prisma.expenseSplit.createMany

Balance Query:
  GET /groups/:groupId/balances
    → authenticate → balanceController.getBalances
      → balanceService.calculateBalances (raw SQL aggregation)
        → returns [{ userId, user, netBalance }]

Payment Creation:
  POST /groups/:groupId/payments
    → validate → authenticate → paymentController.create
      → paymentService.createPayment
        → prisma.payment.create
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/backend/src/routes/expense.routes.js` | Create | Expense CRUD + balance routes |
| `apps/backend/src/routes/payment.routes.js` | Create | Payment CRUD routes |
| `apps/backend/src/controllers/expense.controller.js` | Create | Request/response handlers for expenses |
| `apps/backend/src/controllers/payment.controller.js` | Create | Request/response handlers for payments |
| `apps/backend/src/services/expense.service.js` | Create | Create/list/get/update/delete expenses + split calc |
| `apps/backend/src/services/balance.service.js` | Create | Balance calculation from expenses + payments |
| `apps/backend/src/services/payment.service.js` | Create | Create/list/delete payments |
| `apps/backend/src/utils/splits.js` | Create | Pure split calculation functions |
| `apps/backend/src/schemas/expense.schemas.js` | Create | Zod schemas for expense/payment validation |
| `apps/backend/src/index.js` | Modify | Mount expense + payment routes |
| `apps/backend/src/utils/errors.js` | Modify | Add error codes |

## Interfaces / Contracts

### API Endpoints

```
POST   /groups/:groupId/expenses          → 201 + expense with splits
GET    /groups/:groupId/expenses           → 200 + expense[]
GET    /groups/:groupId/expenses/:id       → 200 + expense with splits
PUT    /groups/:groupId/expenses/:id       → 200 + updated expense
DELETE /groups/:groupId/expenses/:id       → 204
GET    /groups/:groupId/balances           → 200 + balance[]
POST   /groups/:groupId/payments           → 201 + payment
GET    /groups/:groupId/payments           → 200 + payment[]
DELETE /groups/:groupId/payments/:id      → 204
```

### Request/Response Shapes

```js
// POST /groups/:groupId/expenses
Request: {
  amount: number,           // positive
  description: string,      // non-empty
  category: "FOOD" | "TRANSPORT" | "HOUSING" | "ENTERTAINMENT" | "OTHER",
  payerId: string,          // must be group member
  splitType: "EQUAL" | "EXACT" | "PERCENTAGE",
  splits: [
    { userId: string, amount?: number, percentage?: number }
  ]
}

Response 201: {
  id, amount, description, category, payerId, splitType, date, createdAt,
  splits: [{ id, userId, amount, percentage }]
}

// GET /groups/:groupId/balances
Response 200: [
  { userId, user: { id, nickName, email }, netBalance }
]
// sorted by netBalance descending (most owed first)

// POST /groups/:groupId/payments
Request: {
  fromUserId: string,       // must equal authenticated user
  toUserId: string,         // must be group member
  amount: number,          // positive
  method?: string,
  paidAt?: string          // ISO date
}

Response 201: { id, fromUserId, toUserId, amount, method, paidAt }
```

### Zod Schemas Required

```js
// expense.schemas.js
export const createExpenseSchema = z.object({
  amount: z.number().positive(),
  description: z.string().min(1),
  category: z.enum(['FOOD', 'TRANSPORT', 'HOUSING', 'ENTERTAINMENT', 'OTHER']),
  payerId: z.string().cuid(),
  splitType: z.enum(['EQUAL', 'EXACT', 'PERCENTAGE']),
  splits: z.array(z.object({
    userId: z.string().cuid(),
    amount: z.number().optional(),   // required for EXACT
    percentage: z.number().optional() // required for PERCENTAGE
  }))
});

export const updateExpenseSchema = createExpenseSchema.partial();

export const createPaymentSchema = z.object({
  fromUserId: z.string().cuid(),
  toUserId: z.string().cuid(),
  amount: z.number().positive(),
  method: z.string().optional(),
  paidAt: z.string().datetime().optional()
});
```

### Error Codes

| Code | HTTP | Message |
|------|------|---------|
| VALIDATION_ERROR | 400 | Split amounts don't sum / percentages don't sum / etc |
| NOT_FOUND | 404 | Group/expense/payment not found |
| FORBIDDEN | 403 | Only payer/creator can edit/delete |
| NOT_MEMBER | 403 | User is not a group member |
| UNAUTHORIZED | 401 | Authentication required |

## Split Calculation Algorithm

```js
// utils/splits.js

/**
 * EQUAL: each member gets (totalAmount / memberCount), rounded to 2 decimals
 */
export function calculateEqualSplit(totalAmount, memberIds) {
  const share = Math.round((totalAmount / memberIds.length) * 100) / 100;
  return memberIds.map(userId => ({ userId, amount: share }));
}

/**
 * EXACT: amounts provided must sum exactly to totalAmount
 * Returns splits as-is (caller validates sum)
 */
export function calculateExactSplit(totalAmount, splits) {
  // Caller must validate: splits.reduce((s, x) => s + x.amount, 0) === totalAmount
  return splits;
}

/**
 * PERCENTAGE: percentages must sum to 100
 * Each member gets (totalAmount * percentage / 100), rounded to 2 decimals
 */
export function calculatePercentageSplit(totalAmount, splits) {
  return splits.map(split => ({
    userId: split.userId,
    amount: Math.round((totalAmount * split.percentage / 100) * 100) / 100
  }));
}
```

## Balance Calculation Algorithm

```sql
-- For group :groupId, for each user:
--
-- debits  = SUM(es.amount)                          -- expense splits where user owes
-- credits = SUM(p.amount) WHERE p.toUserId = user   -- payments received
--              + SUM(e.amount) WHERE e.payerId = user -- expenses they paid (they are owed)
--
-- netBalance = credits - debits
--   positive = others owe this user
--   negative = this user owes others

SELECT
  u.id AS "userId",
  u."nickName",
  u.email,
  COALESCE(SUM(e.amount), 0)                          -- they are owed this much
  + COALESCE(SUM(p_recd.amount), 0)                   -- payments they received
  - COALESCE(SUM(es.amount), 0)                       -- their expense splits (what they owe)
  - COALESCE(SUM(p_sent.amount), 0)                   -- payments they made (reduces what they're owed)
AS "netBalance"
FROM "User" u
JOIN "GroupMember" gm ON gm."userId" = u.id AND gm."groupId" = :groupId
LEFT JOIN "Expense" e ON e."payerId" = u.id AND e."groupId" = :groupId
LEFT JOIN "ExpenseSplit" es ON es."userId" = u.id AND es."expenseId" IN (
  SELECT id FROM "Expense" WHERE "groupId" = :groupId
)
LEFT JOIN "Payment" p_recd ON p_recd."toUserId" = u.id AND p_recd."groupId" = :groupId
LEFT JOIN "Payment" p_sent ON p_sent."fromUserId" = u.id AND p_sent."groupId" = :groupId
GROUP BY u.id
ORDER BY "netBalance" DESC;
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `utils/splits.js` (EQUAL/EXACT/PERCENTAGE math) | Jest, edge cases: 3-way split, rounding |
| Unit | `balance.service.js` (aggregation logic) | Mock Prisma, test multi-user scenarios |
| Integration | Full expense CRUD + balance | Supertest against test DB with transactions |
| Integration | Payment CRUD + balance effect | Same test DB approach |

## Migration / Rollout

No migration required. Prisma models (`Expense`, `ExpenseSplit`, `Payment`, enums) already exist in schema. Feature is additive.

## Open Questions

- [ ] Should `paidAt` default to `now()` or be required?
- [ ] Do we need to validate `payerId` is an ACTIVE member (not PENDING)?
- [ ] Should deleted expenses/payments soft-delete or hard-delete?