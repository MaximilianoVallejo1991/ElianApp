# Archive Report: collective-expenses

## Status

**SUPERSEDED** — This change is obsolete and has been replaced by a subsequent SDD change.

## Summary

`collective-expenses` introduced two new Prisma models (`CollectiveExpense`, `IndividualItem`) with a separate API layer and frontend UI for group expense scenarios where shared costs + individual items needed verification. All implementation tasks were completed successfully.

### Superseded By

**Change**: `unificar-expense-collective`
**Date**: ~2026-06 (proposed after collective-expenses was completed)

The `unificar-expense-collective` change re-architected the entire approach:

1. **Schema Unification**: Instead of separate `CollectiveExpense` and `IndividualItem` models, the `Expense` model was extended with a new `COLLECTIVE` split type and fields (`status`, `isLocked`, `sharedCosts`, `participantIds`). A new `ExpenseItem` model was created as the clean replacement for `IndividualItem`.

2. **Data Migration**: All existing `CollectiveExpense` rows were migrated into `Expense`, and `IndividualItem` rows into `ExpenseItem`, preserving data.

3. **Legacy Code Removed**:
   - `CollectiveExpense` model and `CollectiveExpenseStatus` enum — **deleted** from Prisma schema
   - `IndividualItem` model — **deleted** from Prisma schema
   - All collective-expense backend files (routes, controllers, services, schemas) — **deleted**
   - `CollectiveExpenseForm.jsx` and `IndividualItemForm.jsx` — **deleted**
   - Separate collective-expense API client functions — **removed**

4. **Functionality Preserved**: The collective expense pattern (shared costs + individual items with auto-verification) was preserved but now lives inside the unified `Expense` model with `splitType: COLLECTIVE`.

## Archive Details

| Field | Value |
|-------|-------|
| **Change Name** | `collective-expenses` |
| **Archive Date** | 2026-06-10 |
| **Status** | SUPERSEDED |
| **Superseded By** | `unificar-expense-collective` |
| **Archive Path** | `openspec/changes/archive/2026-06-10-collective-expenses/` |

## Specs Merge Decision

**Delta specs were NOT merged into main specs.** Rationale:

- The specs in `collective-expenses/specs/` (`collective-expense-management`, `individual-item-reporting`) describe functionality that was implemented via separate `CollectiveExpense` and `IndividualItem` models.
- These models have been **removed** from the codebase and database by the superseding change `unificar-expense-collective`.
- Merging these delta specs into main specs would add requirements for models that no longer exist, contradicting the current architecture.
- The replacement functionality lives in the `expense-management` spec from `unificar-expense-collective`, which is already in the active changes directory.

## Artifact Inventory

| Artifact | Status | Notes |
|----------|--------|-------|
| `proposal.md` | Archived | Intent, scope, approach for separate collective-expense model |
| `design.md` | Archived | Two-model architecture (CollectiveExpense + IndividualItem) |
| `tasks.md` | Archived | 6 phases, all 15 tasks completed ✅ |
| `specs/collective-expense-management/spec.md` | Archived | Delta spec for collective expense CRUD |
| `specs/individual-item-reporting/spec.md` | Archived | Delta spec for item reporting and verification |
| `archive-report.md` | ✅ This file | Current report |

## Key Learnings

- Introducing separate models for a specialized expense flow duplicated logic and created a maintenance burden (balance bug where CollectiveExpense didn't affect balances).
- The unification approach (`unificar-expense-collective`) was the correct architectural decision — extending the existing `Expense` model with a `COLLECTIVE` split type preserved all functionality while eliminating code duplication.
- Data migration from legacy to unified models was feasible because the business logic (verification algorithm, balance formula) was identical.
