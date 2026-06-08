import { useState, useMemo } from 'react';
import {
  XMarkIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import { collectiveExpenseService } from '../services/api';

/**
 * CollectiveExpenseForm — modal form to create a new collective expense.
 *
 * A collective expense has a total amount and shared costs. The creator
 * (current user) fronts the full amount up front, and each participant
 * later reports their individual items. Shared costs are split evenly
 * among all participants.
 *
 * Props:
 *   groupId      — the group ID (string)
 *   members      — array of ACTIVE group members (each with userId + user object)
 *   currency     — group currency (e.g. "USD")
 *   onSuccess    — callback after successful creation
 *   onClose      — close the modal
 */
export default function CollectiveExpenseForm({
  groupId,
  members,
  currency = 'USD',
  onSuccess,
  onClose,
}) {
  const [description, setDescription] = useState('');
  const [total, setTotal] = useState('');
  const [sharedCosts, setSharedCosts] = useState('');
  const [selectedIds, setSelectedIds] = useState(
    members.map((m) => m.userId)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ------------------------------------------------------------------
  // Derived data
  // ------------------------------------------------------------------

  const parsedTotal = parseFloat(total) || 0;
  const parsedShared = parseFloat(sharedCosts) || 0;

  const sharedPerPerson = useMemo(() => {
    if (selectedIds.length === 0) return 0;
    return Math.round((parsedShared / selectedIds.length) * 100) / 100;
  }, [parsedShared, selectedIds.length]);

  // ------------------------------------------------------------------
  // Participant toggle
  // ------------------------------------------------------------------

  const toggleParticipant = (userId) => {
    setSelectedIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const toggleAll = () => {
    if (selectedIds.length === members.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(members.map((m) => m.userId));
    }
  };

  // ------------------------------------------------------------------
  // Validation
  // ------------------------------------------------------------------

  const validate = () => {
    if (!total || parsedTotal <= 0) return 'Total amount must be a positive number.';
    if (sharedCosts === '' || parsedShared < 0) return 'Shared costs must be zero or greater.';
    if (parsedShared > parsedTotal) return 'Shared costs cannot exceed the total amount.';
    if (selectedIds.length === 0) return 'Select at least one participant.';
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
        total: parsedTotal,
        sharedCosts: parsedShared,
        participantIds: selectedIds,
        ...(description.trim() ? { description: description.trim() } : {}),
      };

      await collectiveExpenseService.create(groupId, payload);
      setLoading(false);
      onSuccess?.();
      onClose?.();
    } catch (err) {
      setError(err.message || 'Failed to create collective expense.');
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
      aria-label="Create collective expense"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-heading text-xl font-bold text-primary">
            Create collective expense
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
            <label
              htmlFor="collective-description"
              className="mb-1.5 block text-sm font-semibold text-text"
            >
              Description{' '}
              <span className="font-normal text-text-muted">(optional)</span>
            </label>
            <input
              id="collective-description"
              type="text"
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Office supplies, team dinner, etc."
              className="w-full rounded-lg border border-border bg-white px-4 py-3 text-text transition-colors duration-200 placeholder:text-text-muted/50 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
            />
          </div>

          {/* Total amount */}
          <div>
            <label
              htmlFor="collective-total"
              className="mb-1.5 block text-sm font-semibold text-text"
            >
              Total amount
            </label>
            <div className="relative">
              <CurrencyDollarIcon
                className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted"
                aria-hidden="true"
              />
              <input
                id="collective-total"
                type="number"
                required
                min="0.01"
                step="0.01"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-border bg-white py-3 pl-10 pr-16 text-text transition-colors duration-200 placeholder:text-text-muted/50 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-text-muted">
                {currency}
              </span>
            </div>
          </div>

          {/* Shared costs */}
          <div>
            <label
              htmlFor="collective-shared"
              className="mb-1.5 block text-sm font-semibold text-text"
            >
              Shared costs
            </label>
            <p className="mb-1.5 text-xs text-text-muted">
              Costs shared equally among all participants (delivery, taxes, tips, etc.)
            </p>
            <div className="relative">
              <CurrencyDollarIcon
                className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted"
                aria-hidden="true"
              />
              <input
                id="collective-shared"
                type="number"
                required
                min="0"
                step="0.01"
                value={sharedCosts}
                onChange={(e) => setSharedCosts(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-border bg-white py-3 pl-10 pr-16 text-text transition-colors duration-200 placeholder:text-text-muted/50 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-text-muted">
                {currency}
              </span>
            </div>

            {/* Shared cost preview */}
            {parsedShared > 0 && selectedIds.length > 0 && (
              <div className="mt-2 rounded-lg bg-secondary/5 px-4 py-2.5">
                <p className="text-sm text-text">
                  <span className="font-semibold text-secondary">
                    {formatCurrency(sharedPerPerson)}
                  </span>{' '}
                  shared cost per person
                  {' · '}
                  <span className="text-text-muted">
                    {selectedIds.length} participant
                    {selectedIds.length !== 1 ? 's' : ''}
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* Participants */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-semibold text-text">
                Participants
              </label>
              <button
                type="button"
                onClick={toggleAll}
                className="cursor-pointer text-xs font-medium text-secondary transition-colors duration-200 hover:text-secondary/80 focus:outline-none focus:ring-2 focus:ring-secondary/30 rounded px-1.5 py-0.5"
              >
                {selectedIds.length === members.length
                  ? 'Deselect all'
                  : 'Select all'}
              </button>
            </div>

            {members.length === 0 ? (
              <p className="text-sm text-text-muted italic">
                No members in this group.
              </p>
            ) : (
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-border bg-white p-2">
                {members.map((m) => {
                  const checked = selectedIds.includes(m.userId);
                  return (
                    <label
                      key={m.userId}
                      className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 transition-colors duration-150 ${
                        checked
                          ? 'bg-secondary/5'
                          : 'hover:bg-border/30'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleParticipant(m.userId)}
                        className="h-4 w-4 cursor-pointer rounded border-border text-secondary focus:ring-2 focus:ring-secondary/20"
                      />
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/5">
                          <UserGroupIcon
                            className="h-3.5 w-3.5 text-primary"
                            aria-hidden="true"
                          />
                        </div>
                        <span className="truncate text-sm font-medium text-text">
                          {memberName(m)}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            {selectedIds.length > 0 && (
              <p className="mt-1.5 text-xs text-text-muted">
                {selectedIds.length} member{selectedIds.length !== 1 ? 's' : ''}{' '}
                selected
              </p>
            )}
          </div>

          {/* Summary box */}
          {parsedTotal > 0 && selectedIds.length > 0 && (
            <div className="rounded-lg border border-border bg-background px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-muted">Individual share</span>
                <span className="font-semibold text-text">
                  {formatCurrency(
                    Math.round(
                      ((parsedTotal - parsedShared) / selectedIds.length) * 100
                    ) / 100
                  )}{' '}
                  / person (approx.)
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-muted">Shared cost per person</span>
                <span className="font-semibold text-text">
                  {formatCurrency(sharedPerPerson)}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1.5 border-t border-border text-sm">
                <span className="font-semibold text-text">Estimated total per person</span>
                <span className="font-heading text-base font-bold text-primary">
                  {formatCurrency(
                    Math.round(
                      (sharedPerPerson +
                        (parsedTotal - parsedShared) / selectedIds.length) *
                        100
                    ) / 100
                  )}
                </span>
              </div>
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
                  Creating…
                </>
              ) : (
                'Create expense'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
