# Tasks: unified-expense-wizard

## Review Workload Forecast

| Metric | Estimate |
|--------|----------|
| Files changed | ~8 |
| Lines changed | ~450-500 |
| PR strategy | Single PR (under 600-line threshold) |
| Chained PRs? | No — cohesive single-domain change |

---

## Phase 1: Backend Schema & Enum

### [x] Task 1.1 — Remove EXACT from ExpenseSplitType enum

**File:** `apps/backend/prisma/schema.prisma`

Remove `EXACT` from the enum (keep `EQUAL`, `PERCENTAGE`, `COLLECTIVE`). Create raw SQL migration `apps/backend/prisma/migrations/remove_exact_from_enum/migration.sql` that soft-deletes existing EXACT expenses, then drops/recreates the enum type. Run `npx prisma generate`.

### [x] Task 1.2 — Remove EXACT from Zod schema

**File:** `apps/backend/src/schemas/expense.schemas.js`

In `createExpenseSchema.splitType`, change enum to `['EQUAL', 'PERCENTAGE', 'COLLECTIVE']`. Update errorMap message. In `validateSplits()`, remove the `if (splitType === 'EXACT')` block entirely.

### [x] Task 1.3 — Remove EXACT branch from expense.service.js

**File:** `apps/backend/src/services/expense.service.js`

In `computeSplits()`, remove the `if (splitType === 'EXACT')` branch. Remove `calculateExactSplits` from imports.

### [x] Task 1.4 — Remove calculateExactSplits from backend splits.js

**File:** `apps/backend/src/utils/splits.js`

Delete the `calculateExactSplits` function. Keep all others.

---

## Phase 2: Frontend Wizard Redesign

### [x] Task 2.1 — Remove EXACT from frontend

**Files:** `apps/frontend/src/components/ExpenseForm.jsx`, `apps/frontend/src/utils/splits.js`

Remove `{ value: 'EXACT', label: 'Exact amounts' }` from `SPLIT_TYPES`. Delete `calculateExactSplits` from frontend `splits.js`.

### [x] Task 2.2 — Refactor ExpenseForm as unified wizard

**File:** `apps/frontend/src/components/ExpenseForm.jsx`

Replace the current structure with:

**Step 1 (all types):** Base fields — description, amount, date, category, payer, split type selector (reuse existing fields from lines ~392-520).

**Step 2 (type-specific):**
- **EQUAL:** Show computed equal shares (read-only via `equalShare`), "Create expense" button.
- **PERCENTAGE:** Input `%` per participant with live validation (sum=100%). Create button disabled until valid.
- **COLLECTIVE:**
  - **2a Configure:** shared costs input + participant checkboxes. **CRITICAL: NO per-participant amount input fields.**
  - **2b Confirm:** Summary (total, shared costs, participant count), "Create expense" button.

Remove the old 4-step COLLECTIVE wizard (lines ~616-916). COLLECTIVE submit payload: `{ amount, description, category, payerId, splitType: 'COLLECTIVE', sharedCosts, participantIds, date }` — NO `items` array.

### [x] Task 2.3 — Remove obsolete COLLECTIVE state/handlers

**File:** `apps/frontend/src/components/ExpenseForm.jsx`

Delete: `collectiveStep` (4-step), `collectiveItems`, `handleCollectiveNext/Back/Submit`, `validateCollectiveStep`, `toggleCollectiveParticipant`, `updateCollectiveItem`, `collectiveStatus` useMemo, `exactSum` useMemo, EXACT validation in `validate()`.

Keep: `sharedCosts`, `selectedParticipantIds` (needed for COLLECTIVE Step 2a).

### [x] Task 2.4 — Verify GroupDetailPage item reporting

**File:** `apps/frontend/src/pages/GroupDetailPage.jsx`

Verify the existing `isPending && !isLocked` condition (line ~583) correctly shows "Report my item" button for newly created COLLECTIVE expenses (status=PENDING, isLocked=false, no items). No code changes expected.

---

## Phase 3: Integration & Cleanup

### [x] Task 3.1 — Update frontend splits.test.js

**File:** `apps/frontend/src/utils/__tests__/splits.test.js`

Remove `describe('calculateExactSplits', ...)` block and its import.

### [x] Task 3.2 — Update backend splits.test.js

**File:** `apps/backend/src/utils/__tests__/splits.test.js`

Remove `describe('calculateExactSplits', ...)` block and its import.

### [x] Task 3.3 — Run tests and commit

Run `npm test` in both apps. All tests must pass. Commit: `feat: unify expense wizard, remove EXACT split type`.

✅ Backend: 11 tests passed | ✅ Frontend: 21 tests passed
