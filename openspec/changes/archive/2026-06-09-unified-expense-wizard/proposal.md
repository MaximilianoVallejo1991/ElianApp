# Proposal: unified-expense-wizard

## Intent

Unify the expense creation UX by replacing multiple form variants with a single adaptive wizard modal. Currently EQUAL and PERCENTAGE use simple forms, COLLECTIVE uses a 4-step wizard with a redundant Step 1, and EXACT is a deprecated primitive. This change collapses all split types into one wizard: EQUAL and PERCENTAGE complete in 1 step, COLLECTIVE in 2 steps, and EXACT is eliminated (absorbed into COLLECTIVE with `sharedCosts=0`).

## Scope

### In Scope
- Remove EXACT from `ExpenseSplitType` enum (schema, backend, frontend)
- Simplify COLLECTIVE wizard from 4 steps to 2: (1) Configure — shared costs + participants, (2) Report items (participant-side, not creator)
- Unified wizard for all split types: EQUAL (1 step), PERCENTAGE (1 step), COLLECTIVE (2 steps)
- Backend: update `expense.service.js`, `splits.js`, `expense.schemas.js`
- Frontend: redesign `ExpenseForm.jsx` as adaptive wizard modal
- Existing EXACT expenses remain as-is (test data, soft-deleted, no migration)

### Out of Scope
- Migration of existing EXACT expense data
- Changes to balance calculation logic
- Changes to payment recording flow
- Pagination (already done)

## Capabilities

### New Capabilities
- `unified-expense-wizard`: Single modal for creating any expense type. Adapts fields based on splitType. EQUAL and PERCENTAGE are single-step. COLLECTIVE is two-step.

### Modified Capabilities
- `expense-creation`: Currently different forms for different split types. Will become a unified wizard that dynamically reconfigures based on splitType selection.

## Approach

**Backend:**
- Remove `EXACT` from `ExpenseSplitType` enum in `schema.prisma`
- `createExpense` in `expense.service.js`: COLLECTIVE branch handles all non-EQUAL/PERCENTAGE cases
- When `splitType='COLLECTIVE'` with `sharedCosts=0` and no items → status PENDING, isLocked=false
- Wizard sends: `{ amount, description, category, payerId, splitType, sharedCosts, participantIds }` — NO items from creator

**Frontend:**
- ExpenseForm becomes a unified wizard with conditional steps:
  - **Step 1 (all types)**: Description, Amount, Date, Category, Payer, Split Type selector
  - **Step 2 (type-specific)**:
    - EQUAL: computed shares display, confirm button
    - PERCENTAGE: % input per participant
    - COLLECTIVE: shared costs + participant checkboxes (NO per-person amount entry)
- splitType change triggers wizard reconfiguration
- "Create" button only visible after step 2 completes

**Critical rule:** For COLLECTIVE, wizard NEVER asks creator to enter individual participant amounts — each participant reports their own via their own interface.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/backend/prisma/schema.prisma` | Modified | Remove EXACT from ExpenseSplitType enum |
| `apps/backend/src/utils/splits.js` | Modified | Remove calculateExactSplits (unused) |
| `apps/backend/src/services/expense.service.js` | Modified | COLLECTIVE branch; createExpense accepts items |
| `apps/backend/src/schemas/expense.schemas.js` | Modified | Remove EXACT; update validation |
| `apps/frontend/src/components/ExpenseForm.jsx` | Modified | Redesign as unified 2-step wizard |
| `apps/frontend/src/pages/GroupDetailPage.jsx` | Modified | COLLECTIVE shows per-participant item reporting |
| `apps/frontend/src/utils/splits.js` | Modified | Mirror backend changes |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Enum removal in PostgreSQL requires careful migration | High | Use raw SQL migration; test in dev first |
| COLLECTIVE wizard UX regression if not simplified properly | Medium | Focus on eliminating Step 1 redundancy |
| Backend split calculation breaks for existing expenses | Low | Keep existing split logic untouched |

## Rollback Plan

- Feature flag approach: keep EXACT in schema but mark deprecated
- If issues arise, revert git commit and restore schema enum + split functions
- Soft-deleted EXACT expenses remain soft-deleted (no data loss)

## Dependencies

- None (no external dependencies)

## Success Criteria

- [ ] Only 3 split types exist: EQUAL, PERCENTAGE, COLLECTIVE
- [ ] Single ExpenseForm modal works for all split types
- [ ] COLLECTIVE wizard does NOT ask creator to enter per-participant amounts
- [ ] COLLECTIVE expenses require participants to report their own items
- [ ] All existing tests pass (or updated accordingly)
- [ ] Backend starts without errors