# Proposal: Static Group Closures

## Intent

Enable STATIC groups to operate in settlement periods. Currently STATIC groups reject all expenses and balances. This change introduces periods: open → freeze → register payments → creditor acceptance → close. Supports partial closure (new period opens) and final closure (group permanently closed). Closed periods remain visible as historical history.

## Scope

### In Scope
- `Period` model and lifecycle (OPEN → CLOSING → CLOSED → FINAL)
- Expense creation scoped to the current open period
- Payment registration during CLOSING with creditor acceptance/rejection
- Per-period balance calculation for STATIC groups
- Partial closure: close current period, open new period
- Final closure: permanently close group, no new expenses
- Historical period visibility in API responses

### Out of Scope
- Frontend UI for closure flow (backend API only)
- DYNAMIC mode behavior changes
- New expense split types or payment methods
- Notifications or reminders for pending acceptances
- Auto-closure after timeout

## Capabilities

### New Capabilities
- `period-management`: Create, close, reopen, and finalize periods for STATIC groups
- `payment-acceptance`: Creditor accepts or rejects a registered payment
- `static-balance-calculation`: Calculate balances scoped to a specific period
- `historical-period-visibility`: List closed periods and their expenses/payments

### Modified Capabilities
- `expense-management`: Allow expense creation in STATIC groups when current period is OPEN; require `periodId`
- `payment-recording`: Payments created during CLOSING status require `periodId`; add `status` field (PENDING, ACCEPTED, REJECTED)
- `balance-calculation`: For STATIC groups, calculate balances per period instead of globally; for DYNAMIC groups, behavior unchanged
- `group-management`: Add `status` (ACTIVE, CLOSED) to Group; prevent edits to closed groups

## Approach

1. **Data model**: Add `Period` model with `status` enum (OPEN, CLOSING, CLOSED, FINAL). Add `periodId` to `Expense` and `Payment`. Add `status` and `currentPeriodId` to `Group`. Add `status` to `Payment`.
2. **Migration**: Create a default OPEN period for every existing group and backfill `periodId` on existing expenses and payments.
3. **Services**: Create `closure.service.js` for lifecycle transitions. Modify `expense.service.js` to check `group.status` and `period.status`. Modify `payment.service.js` to support acceptance and link to periods. Modify `balance.service.js` to accept optional `periodId` and filter by it for STATIC groups.
4. **API**: Add routes under `/groups/:groupId/periods` for closure operations. Add `POST /payments/:id/accept` and `POST /payments/:id/reject`.
5. **Query defaults**: List expenses and payments default to the current open period for STATIC groups; all periods visible via `?periodId=...` or `?includeHistory=true`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/backend/prisma/schema.prisma` | Modified | New `Period` model; new fields on `Group`, `Expense`, `Payment` |
| `apps/backend/src/services/closure.service.js` | New | Period lifecycle logic: start, accept, complete, reopen, finalize |
| `apps/backend/src/services/expense.service.js` | Modified | Allow STATIC expenses; enforce period status; add `periodId` |
| `apps/backend/src/services/payment.service.js` | Modified | Add `periodId`, `status`; acceptance/rejection flow |
| `apps/backend/src/services/balance.service.js` | Modified | Per-period balance calculation for STATIC groups |
| `apps/backend/src/routes/` | New/Modified | `closure.routes.js`; new endpoints on `payment.routes.js` |
| `apps/backend/prisma/migrations/` | New | Migration to add tables and backfill existing data |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Existing data migration fails | Med | Backfill in a single transaction; keep old columns nullable; test migration on staging |
| Balance calculation regression for DYNAMIC | Low | Add explicit mode check; keep DYNAMIC code path unchanged |
| Partial closure edge cases (payments in flight) | Med | Reject start-closure if any payments are PENDING; require all accepted/rejected |
| Final closure irreversibility | Low | Require group owner confirmation; store `closedAt` timestamp; soft-delete semantics for group |

## Rollback Plan

1. Revert Prisma migration to drop `Period` table and remove new columns.
2. Restore previous versions of `expense.service.js`, `balance.service.js`, and `payment.service.js` that reject STATIC groups.
3. If data was backfilled, the rollback removes period associations but preserves original expense/payment records.

## Dependencies

- Prisma migration support for adding tables and backfilling existing rows
- Existing `balanceMode` enum values (DYNAMIC, STATIC) remain unchanged

## Success Criteria

- [ ] STATIC groups can create expenses when a period is OPEN
- [ ] Starting closure changes period status to CLOSING and blocks new expenses
- [ ] Users can register payments during CLOSING; creditors can accept or reject
- [ ] When all payments are ACCEPTED, the period can be closed with zero net balances
- [ ] Partial closure creates a new OPEN period; expenses resume
- [ ] Final closure sets group status to CLOSED; no further expenses or periods allowed
- [ ] Historical periods and their expenses/payments are accessible via API
- [ ] DYNAMIC groups remain completely unaffected
