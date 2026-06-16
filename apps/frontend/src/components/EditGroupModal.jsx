import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { groupService } from '../services/api';

/**
 * EditGroupModal — modal for editing group name and currency.
 *
 * NOTE: balanceMode is NOT editable — it is immutable after group creation.
 *
 * Props:
 *   group      — { id, name, currency }
 *   onSuccess  — callback after successful update
 *   onClose    — callback to close modal
 */

const CURRENCIES = ['USD', 'EUR', 'GBP', 'MXN', 'COP', 'ARS', 'CLP'];

export default function EditGroupModal({ group, onSuccess, onClose }) {
  const { t } = useTranslation();
  const [name, setName] = useState(group.name || '');
  const [currency, setCurrency] = useState(group.currency || 'USD');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError(t('editGroup.groupNameRequired'));
      return;
    }

    setLoading(true);
    try {
      await groupService.update(group.id, {
        name: name.trim(),
        currency,
      });
      onSuccess?.();
      onClose?.();
    } catch (err) {
      setError(err.message || t('editGroup.failedUpdate'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('editGroup.title')}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-heading text-lg font-bold text-primary">
            {t('editGroup.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 text-text-muted transition-colors duration-200 hover:bg-border/50 hover:text-text focus:outline-none focus:ring-2 focus:ring-secondary/30"
            aria-label={t('common.close')}
          >
            <XMarkIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5" noValidate>
          {error && (
            <div
              className="rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error"
              role="alert"
            >
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label htmlFor="edit-group-name" className="mb-1.5 block text-sm font-semibold text-text">
              {t('group.groupName')}
            </label>
            <input
              id="edit-group-name"
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('group.groupNamePlaceholder')}
              className="w-full rounded-lg border border-border bg-white px-4 py-3 text-text transition-colors duration-200 placeholder:text-text-muted/50 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
            />
          </div>

          {/* Currency */}
          <div>
            <label htmlFor="edit-group-currency" className="mb-1.5 block text-sm font-semibold text-text">
              {t('group.currency')}
            </label>
            <select
              id="edit-group-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full cursor-pointer rounded-lg border border-border bg-white px-4 py-3 text-text transition-colors duration-200 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
            >
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code} — {t(`currency.${code}`)}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 cursor-pointer rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-muted transition-colors duration-200 hover:bg-border/30 focus:outline-none focus:ring-2 focus:ring-secondary/30"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-heading text-sm font-semibold text-white transition-all duration-200 hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  {t('editGroup.saving')}
                </>
              ) : (
                t('editGroup.saveChanges')
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}