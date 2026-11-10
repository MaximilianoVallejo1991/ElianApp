import { vi, describe, it, expect, beforeEach } from 'vitest';

// Vitest auto-mock convention: `src/lib/__mocks__/prisma.js` is substituted
// in for every import of `../../lib/prisma.js` below. See that file for the
// shared mock shape — this harness is reused by later service test files.
vi.mock('../../lib/prisma.js');

import prisma from '../../lib/prisma.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('soft-delete filters — Prisma mock harness', () => {
  it('provides a mocked prisma client with the expected model stubs', () => {
    expect(typeof prisma.payment.count).toBe('function');
    expect(typeof prisma.expense.findMany).toBe('function');
  });
});
