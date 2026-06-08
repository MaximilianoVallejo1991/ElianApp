import { useState, useMemo, useEffect } from 'react';
import {
  XMarkIcon,
  CurrencyDollarIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import { expenseService } from '../services/api';

const CATEGORIES = ['FOOD', 'TRANSPORT', 'HOUSING', 'ENTERTAINMENT', 'OTHER'];

const SPLIT_TYPES = [
  { value: 'EQUAL', label: 'Equal' },
  { value: 'EXACT', label: 'Exact amounts' },
  { value: 'PERCENTAGE', label: 'Percentages' },
];

const INITIAL_SPLIT = { userId: '', amount: '', percentage: '' };

/**
 * ExpenseForm — modal form to create a new expense in a group.
 *
 * Props:
 *   groupId      — the group ID (string)
 *   members      — array of ACTIVE group members (each with userId + user object)
 *   currency     — group currency (e.g. "USD")
 *   currentUserId — authenticated user ID, pre-selected as payer
 *   onSuccess    — callback after successful creation
 *   onClose      — close the modal
 */
export default function ExpenseForm({
  groupId,
  members,
  currency = 'USD',
  currentUserId,
  onSuccess,
  onClose,
}) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('FOOD');
  const [payerId, setPayerId] = useState(currentUserId || '');
  const [splitType, setSplitType] = useState('EQUAL');
  const [splits, setSplits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ------------------------------------------------------------------
  // Derived data
  // ------------------------------------------------------------------

  const parsedAmount = parseFloat(amount) || 0;

  const equalShare = useMemo(() => {
    if (members.length === 0) return 0;
    return Math.round((parsedAmount / members.length) * 100) / 100;
  }, [parsedAmount, members.length]);

  // Initialize / reset splits when splitType or members change
  useEffect(() => {
    if (splitType === 'EQUAL') {
      setSplits([]);
      return;
    }
    setSplits(
      members.map((m) => ({
        userId: m.userId,
        amount: '',
        percentage: '',
      })),
    );
  }, [splitType, members]);

  // ------------------------------------------------------------------
  // Split input handlers
  // ------------------------------------------------------------------

  const handleSplitChange = (index, field, value) => {
    setSplits((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  /** Sum of exact split amounts (client-side preview only). */
  const exactSum = useMemo(() => {
    return splits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
  }, [splits]);

  /** Sum of split percentages (client-side preview only). */
  const percentageSum = useMemo(() => {
    return splits.reduce((sum, s) => sum + (parseFloat(s.percentage) || 0), 0);
  }, [splits]);

  // ------------------------------------------------------------------
  // Validation
  // ------------------------------------------------------------------

  const validate = () => {
    if (!description.trim()) return 'Description is required.';
    if (!amount || parsedAmount <= 0) return 'Amount must be a positive number.';
    if (!payerId) return 'Please select a payer.';

    if (splitType === 'EXACT') {
      if (Math.abs(exactSum - parsedAmount) > 0.009) {
        return 'Split amounts must sum to the expense total.';
      }
      if (splits.some((s) => !s.amount || parseFloat(s.amount) <= 0)) {
        return 'Each member must have a positive amount.';
      }
    }

    if (splitType === 'PERCENTAGE') {
      if (Math.abs(percentageSum - 100) > 0.009) {
        return 'Split percentages must sum to 100%.';
      }
      if (splits.some((s) => !s.percentage || parseFloat(s.percentage) <= 0)) {
        return 'Each member must have a positive percentage.';
      }
    }

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
        amount: parsedAmount,
        description: description.trim(),
        category,
        payerId,
        splitType,
        splits:
          splitType === 'EQUAL'
            ? [{ userId: members[0]?.userId || '' }] // dummy — backend computes equal split from members
            : splits.map((s) => ({
                userId: s.userId,
                ...(splitType === 'EXACT'
                  ? { amount: parseFloat(s.amount) }
                  : { percentage: parseFloat(s.percentage) }),
              })),
      };

      await expenseService.create(groupId, payload);
      setLoading(false);
      onSuccess?.();
      onClose?.();
    } catch (err) {
      setError(err.message || 'Failed to create expense.');
      setLoading(false);
    }
  };

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  const memberName = (m) =>
    m.user?.nickName || m.user?.email || m.userId;

  const formatCurrency = (value) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(value);

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
      aria-label="Add expense"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-heading text-xl font-bold text-primary">
            Add expense
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

          {/* Description */}
          <div>
            <label htmlFor="expense-description" className="mb-1.5 block text-sm font-semibold text-text">
              Description
            </label>
            <input
              id="expense-description"
              type="text"
              required
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Dinner at Mario's"
              className="w-full rounded-lg border border-border bg-white px-4 py-3 text-text transition-colors duration-200 placeholder:text-text-muted/50 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
            />
          </div>

          {/* Amount + Currency */}
          <div>
            <label htmlFor="expense-amount" className="mb-1.5 block text-sm font-semibold text-text">
              Amount
            </label>
            <div className="relative">
              <CurrencyDollarIcon
                className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted"
                aria-hidden="true"
              />
              <input
                id="expense-amount"
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

          {/* Category */}
          <div>
            <label htmlFor="expense-category" className="mb-1.5 block text-sm font-semibold text-text">
              Category
            </label>
            <select
              id="expense-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full cursor-pointer rounded-lg border border-border bg-white px-4 py-3 text-text transition-colors duration-200 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.charAt(0) + cat.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>

          {/* Payer */}
          <div>
            <label htmlFor="expense-payer" className="mb-1.5 block text-sm font-semibold text-text">
              Paid by
            </label>
            <select
              id="expense-payer"
              value={payerId}
              onChange={(e) => setPayerId(e.target.value)}
              className="w-full cursor-pointer rounded-lg border border-border bg-white px-4 py-3 text-text transition-colors duration-200 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
            >
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {memberName(m)}
                  {m.userId === currentUserId ? ' (you)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Split type */}
          <div>
            <label htmlFor="expense-split-type" className="mb-1.5 block text-sm font-semibold text-text">
              Split type
            </label>
            <select
              id="expense-split-type"
              value={splitType}
              onChange={(e) => {
                setSplitType(e.target.value);
                // Reset splits on next render via the initialiseSplits effect
              }}
              className="w-full cursor-pointer rounded-lg border border-border bg-white px-4 py-3 text-text transition-colors duration-200 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
            >
              {SPLIT_TYPES.map((st) => (
                <option key={st.value} value={st.value}>
                  {st.label}
                </option>
              ))}
            </select>
          </div>

          {/* --- Splits UI --- */}

          {splitType === 'EQUAL' && parsedAmount > 0 && (
            <div className="rounded-lg bg-secondary/5 px-4 py-3">
              <p className="text-sm text-text">
                Split equally among{' '}
                <span className="font-semibold text-secondary">{members.length}</span>{' '}
                member{members.length !== 1 ? 's' : ''}
              </p>
              <p className="mt-1 text-sm font-semibold text-primary">
                {formatCurrency(equalShare)} each
              </p>
            </div>
          )}

          {splitType === 'EXACT' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-text">Amount per member</p>
                <p
                  className={`text-xs font-medium ${
                    Math.abs(exactSum - parsedAmount) <= 0.009
                      ? 'text-success'
                      : 'text-error'
                  }`}
                >
                  Sum: {formatCurrency(exactSum)} / {formatCurrency(parsedAmount)}
                </p>
              </div>
              {members.map((m, i) => (
                <div key={m.userId} className="flex items-center gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <UserIcon className="h-4 w-4 flex-shrink-0 text-text-muted" aria-hidden="true" />
                    <span className="truncate text-sm text-text">
                      {memberName(m)}
                    </span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={splits[i]?.amount || ''}
                    onChange={(e) => handleSplitChange(i, 'amount', e.target.value)}
                    className="w-28 flex-shrink-0 rounded-lg border border-border bg-white px-3 py-2 text-right text-sm text-text transition-colors duration-200 placeholder:text-text-muted/50 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
                  />
                </div>
              ))}
            </div>
          )}

          {splitType === 'PERCENTAGE' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-text">Percentage per member</p>
                <p
                  className={`text-xs font-medium ${
                    Math.abs(percentageSum - 100) <= 0.009
                      ? 'text-success'
                      : 'text-error'
                  }`}
                >
                  Total: {percentageSum}%
                </p>
              </div>
              {members.map((m, i) => (
                <div key={m.userId} className="flex items-center gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <UserIcon className="h-4 w-4 flex-shrink-0 text-text-muted" aria-hidden="true" />
                    <span className="truncate text-sm text-text">
                      {memberName(m)}
                    </span>
                  </div>
                  <div className="relative w-28 flex-shrink-0">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      placeholder="0"
                      value={splits[i]?.percentage || ''}
                      onChange={(e) => handleSplitChange(i, 'percentage', e.target.value)}
                      className="w-full rounded-lg border border-border bg-white py-2 pl-3 pr-8 text-right text-sm text-text transition-colors duration-200 placeholder:text-text-muted/50 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
                    />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-text-muted">
                      %
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

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
              disabled={loading}
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-heading text-sm font-semibold text-white transition-all duration-200 hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Saving…
                </>
              ) : (
                'Add expense'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
