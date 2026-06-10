# Design: Static Group Closures

## Technical Approach

Period-based settlement system for STATIC groups. Adds `Period` model as the unit of settlement — expenses and payments accumulate in an OPEN period, closure freezes new expenses, creditors accept/reject payments during CLOSING, then the period closes. DYNAMIC groups remain completely untouched via explicit `balanceMode` checks at every entry point.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|-------------|-----------|
| Period as separate model vs embedded in Group | Separate `Period` model with FK from Group (`currentPeriodId`) | Embedded fields on Group (status, startedAt) | Supports history — multiple CLOSED periods per group; partial closure creates new row, not column gymnastics |
| Payment status for ALL groups vs STATIC-only | Add `status` field to ALL payments (PENDING default) | STATIC-only status field | Simpler schema; DYNAMIC payments auto-accepted on creation; no conditional column logic |
| Balance snapshot strategy | Compute on read from expense splits + accepted payments; disable transitive simplification during CLOSING | Snapshot table at closure start | Avoids stale data; same algorithm for both modes; CLOSING flag is the only behavioral toggle |
| Closure routes structure | `POST /groups/:id/closure/{start,complete,partial,final}` | Nested under `/periods/:periodId/` | Matches proposal; group-level operations; periodId derived from `currentPeriodId` |
| Payment accept/reject route mounting | `POST /groups/:groupId/payments/:id/accept`, `POST /groups/:groupId/payments/:id/reject` | Top-level `/payments/:id/accept` | Follows existing pattern where all group-related routes are mounted under `/groups/:groupId`. Consistent with expense, payment, and membership routes. |
| startClosure with PENDING payments | Block `startClosure` if any PENDING payments exist in current period | Allow PENDING during CLOSING, block only at `completeClosure` | User confirmed: "hasta que se paguen y acepten todas las deudas". Payments must be settled BEFORE closure starts — this is a precondition. |
| Historical balance endpoint | Include `GET /groups/:groupId/periods/:periodId/balances` | Omit (compute on demand only) | Useful for viewing debt snapshot of closed period. Returns direct-debt snapshot captured at closure start plus final settled state after completion. Defined in static-balance-calculation spec. |

## Data Flow

### Closure Lifecycle

```
    OPEN ──(startClosure)──→ CLOSING ──(completeClosure)──→ CLOSED ──(partialClosure)──→ [new OPEN]
         │                       │                              │
         │ PRECONDITION:         │                              └──(finalClosure)──→ FINAL
         │ • No PENDING          │
         │   payments in         │
         │   current period      │
         │                       │
         │ (if PENDING exist,    During CLOSING:
         │  startClosure FAILS)  • New expenses BLOCKED
         │                       • Payments PENDING → creditor accept/reject
         │                       • Balance = direct debts only (no transitive)
```

### Payment Acceptance Flow (CLOSING period)

```
    Debtor records payment (status=PENDING)
            │
            ▼
    Creditor (toUserId) sees PENDING payment
            │
            ├──→ POST /groups/:groupId/payments/:id/accept → status=ACCEPTED
            │         │
            │         └── Balance recalculates (direct debt reduced)
            │
            └──→ POST /groups/:groupId/payments/:id/reject → status=REJECTED
                      │
                      └── Blocks closure until resolved (delete + re-record)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/backend/prisma/schema.prisma` | Modify | Add `Period` model, `PeriodStatus` enum, `PaymentStatus` enum; add `periodId` to Expense/Payment; add `status` to Payment; add `status`/`currentPeriodId` to Group |
| `apps/backend/prisma/migrations/` | Create | Migration: new tables, new columns (nullable), backfill existing STATIC groups with synthetic "Period 1" |
| `apps/backend/src/services/closure.service.js` | Create | `startClosure`, `completeClosure`, `partialClosure`, `finalClosure` — all owner-only, mode-gated |
| `apps/backend/src/services/period.service.js` | Create | `getCurrentPeriod`, `listPeriods`, `getPeriodDetails` — read-only period queries |
| `apps/backend/src/services/expense.service.js` | Modify | Remove STATIC group rejection; auto-set `periodId` for STATIC groups; block creation during CLOSING; block if group CLOSED |
| `apps/backend/src/services/payment.service.js` | Modify | Add `periodId` linkage for STATIC; default `status=PENDING`; add `acceptPayment`/`rejectPayment` functions; modify balance trigger; block operations on CLOSED groups |
| `apps/backend/src/routes/payment.routes.js` | Modify | Add `POST /groups/:groupId/payments/:id/accept` and `POST /groups/:groupId/payments/:id/reject` routes |
| `apps/backend/src/services/balance.service.js` | Modify | Accept optional `periodId`; for STATIC CLOSING: skip transitive simplification (direct-debt-only mode); for DYNAMIC: unchanged |
| `apps/backend/src/services/group.service.js` | Modify | `createGroup` auto-creates Period for STATIC groups; block expense/payment on CLOSED groups |
| `apps/backend/src/controllers/closure.controller.js` | Create | Thin controller layer for closure operations |
| `apps/backend/src/controllers/period.controller.js` | Create | Thin controller layer for period queries |
| `apps/backend/src/routes/closure.routes.js` | Create | Routes: `POST .../closure/{start,complete,partial,final}`, `GET .../periods`, `GET .../periods/:periodId`, `GET .../periods/:periodId/balances` |
| `apps/backend/src/index.js` | Modify | Mount closure routes under `/groups/:groupId` |
| `apps/backend/src/utils/errors.js` | Modify | Add new error codes: `PERIOD_FROZEN`, `GROUP_CLOSED`, `CLOSURE_BLOCKED`, `PAYMENT_NOT_FOUND` |

## Interfaces / Contracts

### New Prisma Enums

```prisma
enum PeriodStatus {
  OPEN
  CLOSING
  CLOSED
  FINAL
}

enum PaymentStatus {
  PENDING
  ACCEPTED
  REJECTED
}
```

### New Prisma Model — Period

```prisma
model Period {
  id        String       @id @default(cuid())
  groupId   String
  status    PeriodStatus @default(OPEN)
  startedAt DateTime     @default(now())
  closedAt  DateTime?
  createdAt DateTime     @default(now())

  group   Group    @relation(fields: [groupId], references: [id])
  expenses Expense[]
  payments Payment[]

  @@index([groupId])
  @@index([groupId, status])
}
```

### Modified Models (delta only)

```prisma
// Group — add:
status           GroupStatus    @default(ACTIVE)
currentPeriodId  String?
periods          Period[]
currentPeriod    Period?        @relation("CurrentPeriod", fields: [currentPeriodId], references: [id])

// Expense — add:
periodId  String?
period    Period?  @relation(fields: [periodId], references: [id])

// Payment — add:
periodId  String?
period    Period?      @relation(fields: [periodId], references: [id])
status    PaymentStatus @default(PENDING)
```

### Service Signatures (new)

```js
// closure.service.js
export async function startClosure(groupId, userId)
export async function completeClosure(groupId, userId)
export async function partialClosure(groupId, userId)
export async function finalClosure(groupId, userId)

// period.service.js
export async function getCurrentPeriod(groupId)
export async function listPeriods(groupId, userId)
export async function getPeriodDetails(periodId, groupId, userId)
export async function getPeriodBalances(periodId, groupId, userId)

// payment.service.js (new functions)
export async function acceptPayment(paymentId, userId)
export async function rejectPayment(paymentId, userId, rejectionReason)
```

### API Endpoint Map

| Method | Path | Handler | Auth |
|--------|------|---------|------|
| `POST` | `/groups/:groupId/closure/start` | closure.start | owner only |
| `POST` | `/groups/:groupId/closure/complete` | closure.complete | owner only |
| `POST` | `/groups/:groupId/closure/partial` | closure.partial | owner only |
| `POST` | `/groups/:groupId/closure/final` | closure.final | owner only |
| `GET` | `/groups/:groupId/periods` | period.list | member |
| `GET` | `/groups/:groupId/periods/:periodId` | period.getOne | member |
| `GET` | `/groups/:groupId/periods/:periodId/balances` | period.getBalances | member |
| `POST` | `/groups/:groupId/payments/:id/accept` | payment.accept | toUserId only |
| `POST` | `/groups/:groupId/payments/:id/reject` | payment.reject | toUserId only |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Period state machine transitions (OPEN→CLOSING→CLOSED→FINAL); payment accept/reject authorization; balance calculation with/without transitive simplification | Service-level tests with mocked Prisma |
| Integration | Full closure cycle (create expenses → start closure → register payments → accept → complete); partial closure creates new period; final closure blocks everything; DYNAMIC groups completely unaffected | HTTP tests against running server with test DB |
| E2E | Frontend not in scope for this change | N/A |

## Migration / Rollout

1. **Schema migration**: Add new tables (`Period`), new nullable columns (`periodId`, `status`, `currentPeriodId`, `groupStatus`). All new columns are nullable/defaulted — zero downtime.
2. **Data backfill** (same migration transaction): For every existing STATIC group, create a synthetic "Period 1" with `status=OPEN`, set `currentPeriodId` on the group, and set `periodId` on all existing expenses and payments in that group.
3. **Existing DYNAMIC groups**: No changes. New columns remain `null`. No periods created.
4. **Rollback**: Drop `Period` table, drop new columns. Backfill data lost but original expense/payment records preserved.
