import { describe, it, expect, vi } from 'vitest';
import { assertAtomicTransition } from '../transitions.js';
import { AppError } from '../errors.js';

describe('assertAtomicTransition', () => {
  it('resolves without throwing when count is 1', async () => {
    const delegate = { updateMany: vi.fn().mockResolvedValue({ count: 1 }) };

    await expect(
      assertAtomicTransition(delegate, {
        where: { id: 'period-1', status: 'OPEN' },
        data: { status: 'CLOSING' },
        errorCode: 'CLOSURE_BLOCKED',
        errorMessage: 'Period is no longer in OPEN status',
      }),
    ).resolves.toBeUndefined();
  });

  it('throws the caller-provided errorCode/message at 409 for count 0 and count 2', async () => {
    const delegateLost = { updateMany: vi.fn().mockResolvedValue({ count: 0 }) };
    const delegateDouble = { updateMany: vi.fn().mockResolvedValue({ count: 2 }) };
    const opts = {
      where: { id: 'payment-1', status: 'PENDING', deletedAt: null },
      data: { status: 'ACCEPTED' },
      errorCode: 'NOT_PENDING',
      errorMessage: 'Payment is not in PENDING status',
    };

    await expect(assertAtomicTransition(delegateLost, opts)).rejects.toMatchObject({
      code: 'NOT_PENDING',
      status: 409,
      message: 'Payment is not in PENDING status',
    });
    await expect(assertAtomicTransition(delegateLost, opts)).rejects.toBeInstanceOf(AppError);
    await expect(assertAtomicTransition(delegateDouble, opts)).rejects.toMatchObject({
      code: 'NOT_PENDING',
      status: 409,
      message: 'Payment is not in PENDING status',
    });
  });

  it('forwards where/data verbatim to the delegate, including deletedAt: null', async () => {
    const delegate = { updateMany: vi.fn().mockResolvedValue({ count: 1 }) };
    const where = { id: 'payment-1', status: 'PENDING', deletedAt: null };
    const data = { status: 'REJECTED', rejectionReason: 'wrong amount' };

    await assertAtomicTransition(delegate, {
      where,
      data,
      errorCode: 'NOT_PENDING',
      errorMessage: 'Payment is not in PENDING status',
    });

    expect(delegate.updateMany).toHaveBeenCalledWith({ where, data });
  });
});
