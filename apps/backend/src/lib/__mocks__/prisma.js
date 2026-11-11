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
 * `createExpense`/`updateExpense` coverage. `period.updateMany` /
 * `payment.updateMany` were added for the closure/payment concurrency
 * guards (`closure-concurrency-guards` change) — atomic conditional
 * updates replacing read-then-write state transitions.
 */
const prisma = {
  group: {
    findUnique: vi.fn(),
    update: vi.fn(),
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
