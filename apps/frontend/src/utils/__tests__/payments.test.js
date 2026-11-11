import { describe, it, expect } from 'vitest';
import { isPaymentAcceptanceActive } from '../payments.js';

describe('isPaymentAcceptanceActive', () => {
  describe('DYNAMIC groups — always active, regardless of periodStatus', () => {
    it('returns true when periodStatus is undefined (no period at all)', () => {
      expect(isPaymentAcceptanceActive('DYNAMIC', undefined)).toBe(true);
    });

    it('returns true when periodStatus is OPEN', () => {
      expect(isPaymentAcceptanceActive('DYNAMIC', 'OPEN')).toBe(true);
    });

    it('returns true when periodStatus is CLOSING', () => {
      expect(isPaymentAcceptanceActive('DYNAMIC', 'CLOSING')).toBe(true);
    });

    it('returns true when periodStatus is CLOSED', () => {
      expect(isPaymentAcceptanceActive('DYNAMIC', 'CLOSED')).toBe(true);
    });

    it('returns true when periodStatus is FINAL', () => {
      expect(isPaymentAcceptanceActive('DYNAMIC', 'FINAL')).toBe(true);
    });
  });

  describe('STATIC groups — active only while the period is CLOSING', () => {
    it('returns true when periodStatus is CLOSING', () => {
      expect(isPaymentAcceptanceActive('STATIC', 'CLOSING')).toBe(true);
    });

    it('returns false when periodStatus is OPEN', () => {
      expect(isPaymentAcceptanceActive('STATIC', 'OPEN')).toBe(false);
    });

    it('returns false when periodStatus is CLOSED', () => {
      expect(isPaymentAcceptanceActive('STATIC', 'CLOSED')).toBe(false);
    });

    it('returns false when periodStatus is FINAL', () => {
      expect(isPaymentAcceptanceActive('STATIC', 'FINAL')).toBe(false);
    });

    it('returns false when periodStatus is undefined (no period yet)', () => {
      expect(isPaymentAcceptanceActive('STATIC', undefined)).toBe(false);
    });

    it('returns false when periodStatus is null', () => {
      expect(isPaymentAcceptanceActive('STATIC', null)).toBe(false);
    });
  });

  describe('missing balanceMode — treated as DYNAMIC (matches the page\'s existing !== "STATIC" idiom)', () => {
    it('returns true when balanceMode is undefined, regardless of periodStatus', () => {
      expect(isPaymentAcceptanceActive(undefined, undefined)).toBe(true);
      expect(isPaymentAcceptanceActive(undefined, 'OPEN')).toBe(true);
      expect(isPaymentAcceptanceActive(undefined, 'CLOSING')).toBe(true);
    });
  });
});
