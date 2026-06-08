import { useState } from 'react';
import {
  XMarkIcon,
  CurrencyDollarIcon,
} from '@heroicons/react/24/outline';
import { paymentService } from '../services/api';

/**
 * PaymentForm — modal form to record a payment between group members.
 *
 * Props:
 *   groupId       — the group ID (string)
 *   members       — array of ACTIVE group members
 *   currency      — group currency (e.g. "USD")
 *   currentUserId — authenticated user ID (the sender)
 *   onSuccess     — callback after successful creation
 *   onClose       — close the modal
 */
export default function PaymentForm({
  groupId,
  members,
  currency = 'USD',
  currentUserId,
  onSuccess,
  onClose,
}) {
  const [toUserId, setToUserId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Exclude current user from receiver options
  const receivers = members.filter((m) => m.userId !== currentUserId);

  const parsedAmount = parseFloat(amount) || 0;

  const memberName = (m) =>
    m.user?.nickName || m.user?.email || m.userId;

  // ------------------------------------------------------------------
  // Validation
  // ------------------------------------------------------------------

  const validate = () => {
    if (!toUserId) return 'Please select a recipient.';
    if (!amount || parsedAmount <= 0) return 'Amount must be a positive number.';
    return null;
  };

  // ------------------------------------------------------------------
  // Submit
  // ------------------------------------------------------------------

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      const payload = {
        fromUserId: currentUserId,
        toUserId,
        amount: parsedAmount,
        ...(method.trim() ? { method: method.trim() } : {}),
      };

      await paymentService.create(groupId, payload);
      setLoading(false);
      onSuccess?.();
      onClose?.();
    } catch (err) {
      setError(err.message || 'Failed to record payment.');
      setLoading(false);
    }
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-primary/40 p-4 pt-[10vh] backdrop-blur-sm sm:pt-[15vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Record payment"
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-heading text-xl font-bold text-primary">
            Record payment
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 text-text-muted transition-colors duration-200 hover:bg-border/50 hover:text-text focus:outline-none focus:ring-2 focus:ring-secondary/30"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5" noValidate>
          {/* Error */}
          {error && (
            <div
              className="rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error"
              role="alert"
            >
              {error}
            </div>
          )}

          <p className="text-sm text-text-muted">
            Record a payment you made to another group member. Balances will update
            automatically.
          </p>

          {/* To user */}
          <div>
            <label htmlFor="payment-to" className="mb-1.5 block text-sm font-semibold text-text">
              Paid to
            </label>
            {receivers.length === 0 ? (
              <p className="text-sm text-text-muted italic">
                No other members in this group.
              </p>
            ) : (
              <select
                id="payment-to"
                required
                autoFocus
                value={toUserId}
                onChange={(e) => setToUserId(e.target.value)}
                className="w-full cursor-pointer rounded-lg border border-border bg-white px-4 py-3 text-text transition-colors duration-200 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
              >
                <option value="" disabled>
                  Select a member…
                </option>
                {receivers.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {memberName(m)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Amount */}
          <div>
            <label htmlFor="payment-amount" className="mb-1.5 block text-sm font-semibold text-text">
              Amount
            </label>
            <div className="relative">
              <CurrencyDollarIcon
                className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted"
                aria-hidden="true"
              />
              <input
                id="payment-amount"
                type="number"
                required
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-border bg-white py-3 pl-10 pr-16 text-text transition-colors duration-200 placeholder:text-text-muted/50 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-text-muted">
                {currency}
              </span>
            </div>
          </div>

          {/* Method (optional) */}
          <div>
            <label htmlFor="payment-method" className="mb-1.5 block text-sm font-semibold text-text">
              Method{' '}
              <span className="font-normal text-text-muted">(optional)</span>
            </label>
            <input
              id="payment-method"
              type="text"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              placeholder="Cash, bank transfer, etc."
              className="w-full rounded-lg border border-border bg-white px-4 py-3 text-text transition-colors duration-200 placeholder:text-text-muted/50 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 cursor-pointer rounded-lg border border-border px-4 py-3 text-sm font-medium text-text-muted transition-colors duration-200 hover:bg-border/30 focus:outline-none focus:ring-2 focus:ring-secondary/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || receivers.length === 0}
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-cta px-4 py-3 font-heading text-sm font-semibold text-white transition-all duration-200 hover:bg-cta/90 focus:outline-none focus:ring-2 focus:ring-cta focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Recording…
                </>
              ) : (
                'Record payment'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
