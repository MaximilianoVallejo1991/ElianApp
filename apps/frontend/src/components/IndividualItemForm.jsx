import { useState } from 'react';
import { CurrencyDollarIcon } from '@heroicons/react/24/outline';
import { individualItemService } from '../services/api';

/**
 * IndividualItemForm — inline form to add or edit an individual item
 * within a collective expense.
 *
 * Each participant can report ONE item per collective expense. This form
 * handles both the "add" (new item) and "edit" (update existing) flows.
 *
 * Props:
 *   groupId              — the group ID (string)
 *   collectiveExpenseId  — the collective expense ID (string)
 *   existingItem         — the user's existing item (null = add, object = edit)
 *   currency             — group currency (e.g. "USD")
 *   onSuccess            — callback after successful add/update/delete
 *   onCancel             — callback to hide the form (only for add mode)
 *   onDelete             — callback after successful deletion (only for edit mode)
 */
export default function IndividualItemForm({
  groupId,
  collectiveExpenseId,
  existingItem,
  currency = 'USD',
  onSuccess,
  onCancel,
  onDelete,
}) {
  const isEditing = existingItem !== null && existingItem !== undefined;

  const [amount, setAmount] = useState(() =>
    existingItem?.amount !== undefined ? String(existingItem.amount) : ''
  );
  const [description, setDescription] = useState(
    () => existingItem?.description || ''
  );
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  // ------------------------------------------------------------------
  // Validation
  // ------------------------------------------------------------------

  const parsedAmount = parseFloat(amount) || 0;

  const validate = () => {
    if (!amount || parsedAmount <= 0)
      return 'Amount must be a positive number.';
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
        ...(description.trim() ? { description: description.trim() } : {}),
      };

      if (isEditing) {
        await individualItemService.update(
          groupId,
          collectiveExpenseId,
          existingItem.id,
          payload
        );
      } else {
        await individualItemService.add(
          groupId,
          collectiveExpenseId,
          payload
        );
      }

      setLoading(false);
      onSuccess?.();
    } catch (err) {
      setError(err.message || 'Failed to save item.');
      setLoading(false);
    }
  };

  // ------------------------------------------------------------------
  // Delete
  // ------------------------------------------------------------------

  const handleDelete = async () => {
    if (!isEditing || !existingItem) return;
    setDeleting(true);
    setError('');
    try {
      await individualItemService.delete(
        groupId,
        collectiveExpenseId,
        existingItem.id
      );
      setDeleting(false);
      onDelete?.();
    } catch (err) {
      setError(err.message || 'Failed to delete item.');
      setDeleting(false);
    }
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-border bg-background p-4 space-y-3"
      noValidate
    >
      {isEditing && (
        <p className="text-xs font-medium text-text-muted uppercase tracking-wider">
          Edit your item
        </p>
      )}

      {/* Error */}
      {error && (
        <div
          className="rounded-md border border-error/30 bg-error/5 px-3 py-2 text-xs text-error"
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="flex items-end gap-3">
        {/* Amount */}
        <div className="flex-1 min-w-0">
          <label
            htmlFor={`item-amount-${collectiveExpenseId}`}
            className="mb-1 block text-xs font-semibold text-text"
          >
            Amount
          </label>
          <div className="relative">
            <CurrencyDollarIcon
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
              aria-hidden="true"
            />
            <input
              id={`item-amount-${collectiveExpenseId}`}
              type="number"
              required
              min="0.01"
              step="0.01"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-lg border border-border bg-white py-2 pl-8 pr-12 text-sm text-text transition-colors duration-200 placeholder:text-text-muted/50 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-text-muted">
              {currency}
            </span>
          </div>
        </div>

        {/* Description */}
        <div className="flex-[2] min-w-0">
          <label
            htmlFor={`item-desc-${collectiveExpenseId}`}
            className="mb-1 block text-xs font-semibold text-text"
          >
            Description{' '}
            <span className="font-normal text-text-muted">(opt.)</span>
          </label>
          <input
            id={`item-desc-${collectiveExpenseId}`}
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What did you buy?"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text transition-colors duration-200 placeholder:text-text-muted/50 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
          />
        </div>
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={loading || deleting}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-secondary px-3.5 py-2 font-heading text-xs font-semibold text-white transition-all duration-200 hover:bg-secondary/90 focus:outline-none focus:ring-2 focus:ring-secondary focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Saving…
            </>
          ) : isEditing ? (
            'Update'
          ) : (
            'Report item'
          )}
        </button>

        {isEditing && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading || deleting}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-error/40 bg-white px-3.5 py-2 text-xs font-semibold text-error transition-all duration-200 hover:bg-error/5 focus:outline-none focus:ring-2 focus:ring-error/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-error border-t-transparent" />
                Deleting…
              </>
            ) : (
              'Delete'
            )}
          </button>
        )}

        {!isEditing && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="cursor-pointer rounded-lg px-3 py-2 text-xs font-medium text-text-muted transition-colors duration-200 hover:text-text focus:outline-none focus:ring-2 focus:ring-secondary/30"
          >
            Cancel
          </button>
        )}

        {isEditing && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={loading || deleting}
            className="cursor-pointer rounded-lg px-3 py-2 text-xs font-medium text-text-muted transition-colors duration-200 hover:text-text focus:outline-none focus:ring-2 focus:ring-secondary/30"
          >
            Cancel edit
          </button>
        )}
      </div>
    </form>
  );
}
