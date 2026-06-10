# Tasks: Static Group Closures

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~670 (10 files new/modified + migration + schema) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Delivery strategy | ask-on-risk |
| Suggested split | PR 1: Schema+migration+errors (~100 lines) → PR 2: Core services (~350 lines) → PR 3: Routes+controllers+wiring (~180 lines) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Schema, migration, error codes | PR 1 | Foundation — all later PRs depend on this |
| 2 | All service-layer logic (period, closure, expense, payment, balance, group) | PR 2 | Core business logic; depends on PR 1 |
| 3 | Routes, controllers, index.js wiring | PR 3 | API surface; depends on PR 2 |

## Phase 1: Schema + Migration `[migration]`

- [ ] 1.1 Add `PeriodStatus` (OPEN/CLOSING/CLOSED/FINAL), `PaymentStatus` (PENDING/ACCEPTED/REJECTED), `GroupStatus` (ACTIVE/CLOSED) enums to `apps/backend/prisma/schema.prisma`
- [ ] 1.2 Add `Period` model: id, groupId, status, startedAt, closedAt, createdAt, FK to Group, FK relations to Expense/Payment. Indexes: `[groupId]`, `[groupId, status]`
- [ ] 1.3 Add `status` (GroupStatus, default ACTIVE) and `currentPeriodId` (nullable FK to Period) to Group model
- [ ] 1.4 Add `periodId` (nullable FK to Period) to Expense and Payment models
- [ ] 1.5 Add `status` (PaymentStatus, default PENDING) and `rejectionReason` (optional String) to Payment model
- [ ] 1.6 Generate Prisma migration. Backfill: create synthetic "Period 1" (OPEN) for existing STATIC groups, set `currentPeriodId`, backfill `periodId` on their expenses/payments. Skip DYNAMIC groups (periodId stays null)
- [ ] 1.7 Add error codes `PERIOD_FROZEN`, `GROUP_CLOSED`, `CLOSURE_BLOCKED` to `apps/backend/src/utils/errors.js` doc comment

## Phase 2: Core Services — Period + Closure `[backend]`

- [ ] 2.1 Create `apps/backend/src/services/period.service.js`: `getCurrentPeriod(groupId)`, `listPeriods(groupId)`, `getPeriodDetails(periodId, groupId)`, `getPeriodBalances(periodId, groupId)` — read-only, member-gated
- [ ] 2.2 Create `apps/backend/src/services/closure.service.js`: `startClosure(groupId, userId)` — owner-only, blocks if PENDING payments exist, OPEN→CLOSING
- [ ] 2.3 `completeClosure(groupId, userId)` — owner-only, blocks if any PENDING/REJECTED payments, CLOSING→CLOSED
- [ ] 2.4 `partialClosure(groupId, userId)` — owner-only, CLOSING→CLOSED then creates new OPEN period, updates `currentPeriodId`
- [ ] 2.5 `finalClosure(groupId, userId)` — owner-only, CLOSING→CLOSED + group.status=CLOSED, irreversible lock
- [ ] 2.6 Add `isGroupLocked(groupId)` to `apps/backend/src/services/group.service.js` — returns true if group.status=CLOSED
- [ ] 2.7 Modify `createGroup` in group.service.js: auto-create OPEN period for STATIC groups, set `currentPeriodId`; DYNAMIC groups skip period creation

## Phase 3: Payment Acceptance Flow `[backend]`

- [ ] 3.1 Add `acceptPayment(paymentId, userId)` to `apps/backend/src/services/payment.service.js` — only `toUserId` can accept; PENDING→ACCEPTED
- [ ] 3.2 Add `rejectPayment(paymentId, userId, rejectionReason?)` to payment.service.js — only `toUserId` can reject; PENDING→REJECTED; store optional reason
- [ ] 3.3 Modify `createPayment` in payment.service.js: auto-set `periodId` for STATIC groups, default `status=PENDING` for all groups. Block creation if group.status=CLOSED
- [ ] 3.4 Add `POST /groups/:groupId/payments/:id/accept` and `/reject` routes to `apps/backend/src/routes/payment.routes.js` with authenticate middleware

## Phase 4: Modify Existing Services `[backend]`

- [ ] 4.1 Modify `apps/backend/src/services/expense.service.js`: remove STATIC rejection; auto-set `periodId` for STATIC; block creation if period CLOSING or group CLOSED; add period filter (`?periodId`, `?includeHistory`) to list endpoint
- [ ] 4.2 Modify `apps/backend/src/services/payment.service.js`: add period filter (`?periodId`, `?includeHistory`) to list endpoint for STATIC groups; DYNAMIC lists all payments unfiltered
- [ ] 4.3 Modify `apps/backend/src/services/balance.service.js`: accept optional `periodId`; for STATIC CLOSING: disable transitive simplification (direct-debt-only); for DYNAMIC and STATIC OPEN: transitive allowed
- [ ] 4.4 Verify all service-layer changes include `balanceMode` gating — DYNAMIC code paths untouched by period logic

## Phase 5: Routes + Controllers + Wiring `[backend]`

- [ ] 5.1 Create `apps/backend/src/controllers/closure.controller.js` — thin handlers calling closure.service functions, extract userId from `req.user.id`
- [ ] 5.2 Create `apps/backend/src/controllers/period.controller.js` — thin handlers for listPeriods, getPeriodDetails, getPeriodBalances
- [ ] 5.3 Create `apps/backend/src/routes/closure.routes.js` — `POST .../closure/{start,complete,partial,final}` (owner-only), mount under `/groups/:groupId` with `mergeParams: true`
- [ ] 5.4 Create `apps/backend/src/routes/period.routes.js` — `GET .../periods`, `GET .../periods/:periodId`, `GET .../periods/:periodId/balances` (member-gated), include `GET .../periods/:periodId/expenses` and `GET .../periods/:periodId/payments`
- [ ] 5.5 Wire new routes in `apps/backend/src/index.js`: mount closureRoutes and periodRoutes under `/groups/:groupId` (before error handler)

## Phase 6: Verification `[backend]`

- [ ] 6.1 Run ESLint on all new/modified files: `npx eslint apps/backend/src/services/{closure,period}.service.js apps/backend/src/routes/{closure,period}.routes.js apps/backend/src/controllers/{closure,period}.controller.js`
- [ ] 6.2 Manual checklist: (a) STATIC group creates expenses during OPEN; (b) startClosure blocks with PENDING payments; (c) creditors accept/reject; (d) completeClosure succeeds when all ACCEPTED; (e) partial closure creates new period; (f) final closure locks group irreversibly; (g) DYNAMIC groups completely unaffected
- [ ] 6.3 Verify migration runs clean against production-schema clone: no data loss, STATIC groups get Period 1 backfill, DYNAMIC groups unchanged
