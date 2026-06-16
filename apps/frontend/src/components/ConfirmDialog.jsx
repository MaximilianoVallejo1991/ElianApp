import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { XMarkIcon, ExclamationTriangleIcon, ShieldExclamationIcon } from '@heroicons/react/24/outline';

/**
 * ConfirmDialog — reusable confirmation modal for destructive actions.
 *
 * Props:
 *   title        — dialog title (already translated by caller)
 *   message      — main question/prompt (already translated)
 *   warning      — optional warning text shown below message
 *   confirmLabel — label for confirm button (default: "common.confirm" key)
 *   variant      — "danger" | "warning" (default: "danger")
 *   onConfirm    — callback when confirm is clicked
 *   onClose      — callback when cancel/backdrop is clicked
 */
export default function ConfirmDialog({
  title,
  message,
  warning,
  confirmLabel,
  variant = 'danger',
  onConfirm,
  onClose,
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  const isDanger = variant === 'danger';
  const confirmButtonClass = isDanger
    ? 'bg-error hover:bg-error/90 focus:ring-error'
    : 'bg-cta hover:bg-cta/90 focus:ring-cta';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            {isDanger ? (
              <ShieldExclamationIcon className="h-5 w-5 text-error" aria-hidden="true" />
            ) : (
              <ExclamationTriangleIcon className="h-5 w-5 text-cta" aria-hidden="true" />
            )}
            <h2 className="font-heading text-lg font-bold text-primary">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 text-text-muted transition-colors duration-200 hover:bg-border/50 hover:text-text focus:outline-none focus:ring-2 focus:ring-secondary/30"
            aria-label={t('common.close')}
          >
            <XMarkIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <p className="text-sm text-text">{message}</p>

          {warning && (
            <div className="mt-3 rounded-lg border border-cta/30 bg-cta/5 px-4 py-3">
              <p className="text-xs font-medium text-cta">{warning}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 cursor-pointer rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-muted transition-colors duration-200 hover:bg-border/30 focus:outline-none focus:ring-2 focus:ring-secondary/30"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-heading text-sm font-semibold text-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${confirmButtonClass}`}
          >
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                {t('common.processing')}
              </>
            ) : (
              confirmLabel || t('common.confirm')
            )}
          </button>
        </div>
      </div>
    </div>
  );
}