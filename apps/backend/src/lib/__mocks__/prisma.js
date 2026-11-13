import { vi } from 'vitest';

/**
 * Shared Prisma client mock (Vitest `__mocks__` auto-mock convention).
 *
 * Any test file that calls `vi.mock('../../lib/prisma.js')` (no factory
 * argument) gets this object substituted in automatically — Vitest
 * resolves manual mocks from a `__mocks__` folder placed next to the
 * real module. Import the real `prisma` default export in the test file
 * afterwards to get a handle on these same `vi.fn()` stubs for
 * `mockResolvedValue(...)` / `toHaveBeenCalledWith(...)` assertions.
 *
 * This is the shared seam for every service-level unit test
 * (`soft-delete-filters.test.js`, `expense.service.test.js`,
 * `item-reporting.service.test.js`). Extend this object — add a model
 * or a method — rather than redefining a bespoke mock inline in a test
 * file. That is what keeps it reusable. `expense.create`/`expense.update`
 * and the `expenseSplit` model were added in PR 3 for
 * `createExpense`/`updateExpense` coverage. `period.updateMany` and
 * `payment.updateMany` were both stubbed here in PR 1 of the
 * `closure-concurrency-guards` change for the later closure/payment
 * atomic-guard PRs to reuse without touching this file again — as of
 * PR 1, only `partialClosure` actually calls `period.updateMany`.
 * `payment.service.js` still calls the unguarded `payment.update`
 * until PR 3 lands; do not assume `payment.updateMany` being stubbed
 * here means payments are already guarded.
 * `expenseItem.findUnique`/`update`/`delete` were added in PR 2 of
 * `permissions-and-process-cleanup` for `updateItem`/`deleteItem` guard
 * coverage. `expenseItem.createMany` was added in PR 3 for
 * `createExpense`'s COLLECTIVE inline item-creation path. `group.delete` and
 * `period.deleteMany` were added in PR 4 for `deleteGroup`'s new
 * `$transaction` (ADR-30).
 */
const prisma = {
  group: {
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  groupMember: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  period: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    create: vi.fn(),
  },
  expense: {
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  expenseSplit: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  expenseItem: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    createMany: vi.fn(),
  },
  payment: {
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
};

// `closure.service.js` uses `prisma.$transaction(async (tx) => ...)`.
// Running the callback against this same mock object as `tx` lets tests
// assert `tx.period.update` / `tx.group.update` calls exactly like the
// real (non-transactional) calls, without a separate transactional mock.
prisma.$transaction = vi.fn(async (callback) => callback(prisma));

export default prisma;
