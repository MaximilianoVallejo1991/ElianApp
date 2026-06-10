# Archive Report: unificar-expense-collective

**Status**: COMPLETED / ARCHIVED
**Archive Date**: 2026-06-10
**Change**: Unify CollectiveExpense and IndividualItem into Expense model with COLLECTIVE split type

---

## Summary

This change unified the separate **CollectiveExpense** and **IndividualItem** models into the main **Expense** model via a new `COLLECTIVE` split type and a dedicated **ExpenseItem** model. The legacy models were fully removed from the schema, backend, and frontend.

## What Was Done

### COLLECTIVE Split Type Unified into Expense Model
- Added `COLLECTIVE` value to `ExpenseSplitType` enum in Prisma schema
- Added `status` (`ExpenseStatus` enum: PENDING / MISMATCH / COMPLETED), `isLocked`, `sharedCosts`, and `participantIds` fields to the `Expense` model
- COLLECTIVE expenses follow a two-phase lifecycle: creation (PENDING, no splits) → item reporting → auto-completion (COMPLETED, splits generated)
- Non-COLLECTIVE expenses remain single-phase (created with splits, immediately COMPLETED, `isLocked=true`)

### ExpenseItem Model Created for Item Reporting
- New `ExpenseItem` model with `id`, `expenseId`, `userId`, `amount`, `description`, `createdAt`
- `@@unique([expenseId, userId])` constraint prevents duplicate reporting per participant
- Cascade delete on expense removal
- Item reporting endpoints nested under `/expenses/:id/items` (unified routing)

### Legacy CollectiveExpense / IndividualItem Removed
- All backend routes, controllers, and services for collective-expense and individual-item deleted
- Frontend `CollectiveExpenseForm` and `IndividualItemForm` deleted; merged into unified `ExpenseForm`
- Prisma schema cleanup: `CollectiveExpense` model, `IndividualItem` model, `CollectiveExpenseStatus` enum, and their relations removed
- Data migration: existing `CollectiveExpense` rows migrated to `Expense`; existing `IndividualItem` rows migrated to `ExpenseItem`

### Balance Integration
- Balance service filters on `isLocked=true` to exclude PENDING COLLECTIVE expenses
- COMPLETED COLLECTIVE expenses with `ExpenseSplit` records are included in balance calculations
- Split generation formula: each participant owes `their_item + (sharedCosts / participantCount)`, last participant absorbs rounding remainder

## Files Synced to Main Specs

| Domain | Action | Details |
|--------|--------|---------|
| expense-management | Created | Full spec with requirements for creation, item reporting, status validation, split generation, and lock behavior |
| balance-calculation | Created | Full spec with requirements for group/user balances, COLLECTIVE inclusion logic, zero shared costs, and rounding |

## Artifacts

| Artifact | Path | Status |
|----------|------|--------|
| proposal | `openspec/changes/archive/2026-06-10-unificar-expense-collective/proposal.md` | Complete |
| specs/expense-management | `openspec/changes/archive/2026-06-10-unificar-expense-collective/specs/expense-management/spec.md` | Complete |
| specs/balance-calculation | `openspec/changes/archive/2026-06-10-unificar-expense-collective/specs/balance-calculation/spec.md` | Complete |
| design | `openspec/changes/archive/2026-06-10-unificar-expense-collective/design.md` | Complete |
| tasks | `openspec/changes/archive/2026-06-10-unificar-expense-collective/tasks.md` | Complete |
| archive-report (this file) | `openspec/changes/archive/2026-06-10-unificar-expense-collective/archive-report.md` | Complete |

## Task Completion

Out of 30 implementation tasks (Phases 1-3, 5-7), all 30 are checked complete. Remaining unchecked tasks (4.2, 4.3, 5.6) are verification-only tasks, not implementation tasks. The orchestrator confirmed all implementation is complete and merged.

## Source of Truth Updated

The following main specs now reflect the change's behavior:
- `openspec/specs/expense-management/spec.md` — Created
- `openspec/specs/balance-calculation/spec.md` — Created

## Notes

- Hybrid persistence mode: archive report written to filesystem. Engram observation also persisted.
- No destructive merge warnings required — both main specs were new (no existing content to merge).
- Orchestrator confirmed: "All implementation is complete and merged."

---

*Archived by sdd-archive sub-agent on 2026-06-10*
