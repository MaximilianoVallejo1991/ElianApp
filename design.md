# Design: Unified Expense Wizard

## Technical Approach

Refactor the ExpenseForm into a unified modal that handles EQUAL, PERCENTAGE, and COLLECTIVE split types, removing EXACT entirely. The COLLECTIVE wizard is compressed from 4 steps to 2: (1) shared costs + participant selection, (2) confirmation — never asking the creator for per-participant amounts. Backend removes EXACT from the PostgreSQL enum via raw SQL migration and updates split validation.

## Architecture Decisions

### Decision: EXACT enum removal from PostgreSQL

**Choice**: Raw SQL `ALTER TYPE` migration via `prisma.$executeRaw` to drop the `EXACT` value from `ExpenseSplitType`, followed by a Prisma schema update and regeneration.

**Alternatives considered**: Prisma's native enum update (not supported for dropping values), creating a new enum without EXACT and migrating data (overkill for test data).

**Rationale**: PostgreSQL enum values can only be removed via `ALTER TYPE ... DROP VALUE`. Prisma's `migrate dev` does not support this directly, so we run raw SQL in a migration file, then update the Prisma schema to match. Existing EXACT expenses are soft-deleted test data — no data migration needed.

### Decision: Frontend wizard state management

**Choice**: Keep the existing `splitType` state + `collectiveStep` state machine, but replace the 4-step COLLECTIVE wizard with a 2-step flow. Step 1 = shared costs + description/amount/date/category (reuse parent state), Step 2 = participant checkboxes + confirm. Remove step 4 entirely.

**Alternatives considered**: Full state machine refactor with separate render branches — adds complexity without benefit.

**Rationale**: The existing form already owns all the state (description, amount, date, category, payerId). The COLLECTIVE wizard only needs to add `sharedCosts` and `participantIds`. Step 2 renders the confirmation by reading the parent's form state directly — no duplication. This enforces the "no per-participant amounts from creator" constraint by simply not rendering any amount input fields in the wizard.

### Decision: COLLECTIVE creation with no creator items

**Choice**: COLLECTIVE wizard submits `{ amount, description, category, payerId, splitType: 'COLLECTIVE', sharedCosts, participantIds }` — no `items` field. Backend `createExpense` already handles this path: creates expense with `status=PENDING`, `isLocked=false`, no splits generated.

**Alternatives considered**: Adding a new endpoint for creator-submits-items — unnecessary, backend already supports atomic COLLECTIVE creation with items via a separate flow.

**Rationale**: The spec says the wizard MUST NOT ask creator for per-participant amounts. The backend's existing COLLECTIVE branch already handles the "no items at creation" case correctly (line 145-239 in expense.service.js). The frontend just needs to stop sending `items`.

## Data Flow

```
User selects split type
        │
        ├── EQUAL ──→ handleSubmit() ──→ { splitType: 'EQUAL', splits: [{}] }
        │                              Backend: computeEqualSplits() → COMPLETED
        │
        ├── PERCENTAGE ──→ handleSubmit() ──→ { splitType: 'PERCENTAGE', splits: [{percentage}] }
        │                                     Backend: validateSplits() → computePercentageSplits() → COMPLETED
        │
        └── COLLECTIVE ──→ 2-step wizard
               │
               ├── Step 1: shared costs input (reads parent state)
               │
               └── Step 2: participant checkboxes → handleCollectiveSubmit()
                          │
                          └── { splitType: 'COLLECTIVE', sharedCosts, participantIds }
                               Backend: creates with status=PENDING, isLocked=false
                               Participants report items via separate API calls
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/backend/prisma/migrations/xxx_remove_exact/migration.sql` | Create | Raw SQL: `ALTER TYPE "ExpenseSplitType" DROP VALUE 'EXACT'` |
| `apps/backend/prisma/schema.prisma` | Modify | Remove `EXACT` from `ExpenseSplitType` enum |
| `apps/backend/src/schemas/expense.schemas.js` | Modify | Remove `EXACT` from `splitType` zod enum; remove EXACT from `validateSplits()` |
| `apps/backend/src/services/expense.service.js` | Modify | Remove EXACT branch from `computeSplits()`; update JSDoc types |
| `apps/frontend/src/components/ExpenseForm.jsx` | Modify | Remove EXACT from SPLIT_TYPES; replace 4-step COLLECTIVE wizard with 2 steps; remove step 4 and all item-amount inputs; update handleCollectiveSubmit() to not send items |
| `apps/frontend/src/services/api.js` | Modify | Update TypeScript/prop types if needed |

## Interface Changes

**createExpense payload — COLLECTIVE (no items)**:
```json
{
  "amount": 1000,
  "description": "Team dinner",
  "category": "FOOD",
  "payerId": "user_123",
  "splitType": "COLLECTIVE",
  "sharedCosts": 150,
  "participantIds": ["user_123", "user_456", "user_789"]
}
```

**createExpense payload — EQUAL** (unchanged, dummy split):
```json
{
  "amount": 1000,
  "description": "Dinner",
  "category": "FOOD",
  "payerId": "user_123",
  "splitType": "EQUAL",
  "splits": [{"userId": ""}]
}
```

**createExpense payload — PERCENTAGE** (unchanged):
```json
{
  "amount": 1000,
  "description": "Dinner",
  "category": "FOOD",
  "payerId": "user_123",
  "splitType": "PERCENTAGE",
  "splits": [{"userId": "user_123", "percentage": 50}, {"userId": "user_456", "percentage": 50}]
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (backend splits.js) | `calculateEqualSplits`, `calculatePercentageSplits`, `calculateCollectiveSplits` | Direct function calls with known inputs |
| Unit (backend schemas) | `validateSplits` rejects EXACT, accepts valid EQUAL/PERCENTAGE/COLLECTIVE | Direct function calls |
| Integration (expense.service) | COLLECTIVE creation without items → status=PENDING, no splits | Mock Prisma, call `createExpense` |
| E2E | Wizard renders correct steps for each split type; EXACT not in dropdown | Playwright: open modal, check options |

## Migration

1. Create migration: `npx prisma migrate dev --name remove_exact_split_type` — edit generated SQL to include `ALTER TYPE "ExpenseSplitType" DROP VALUE 'EXACT'`
2. Run migration against DB
3. Regenerate Prisma client: `npx prisma generate`
4. Deploy backend with updated schema + service
5. Deploy frontend with updated ExpenseForm

No data migration needed — existing EXACT expenses are soft-deleted test data with `deletedAt != null`.

## Open Questions

- [ ] Confirm: COLLECTIVE wizard step 2 is "confirm only" — no further editing of amount/description after step 1?
- [ ] Should step 2 show a summary of selected participants + shared costs before submit?