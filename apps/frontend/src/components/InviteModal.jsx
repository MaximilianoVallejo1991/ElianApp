import { useState, useEffect } from 'react';
import {
  LinkIcon,
  ClipboardDocumentIcon,
  ClipboardDocumentCheckIcon,
  XMarkIcon,
  UserPlusIcon,
} from '@heroicons/react/24/outline';
import { inviteService } from '../services/api';

export default function InviteModal({ groupId, onClose }) {
  const [inviteUrl, setInviteUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function loadInviteLink() {
      setLoading(true);
      setError('');
      try {
        const response = await inviteService.generateInviteLink(groupId);
        setInviteUrl(response.data.url);
      } catch (err) {
        setError(err.message || 'Failed to generate invite link.');
      } finally {
        setLoading(false);
      }
    }

    loadInviteLink();
  }, [groupId]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback for browsers without clipboard API
      const textarea = document.createElement('textarea');
      textarea.value = inviteUrl;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Invite members"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <UserPlusIcon className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="font-heading text-lg font-bold text-primary">Invite members</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 text-text-muted transition-colors duration-200 hover:bg-secondary/10 hover:text-text focus:outline-none focus:ring-2 focus:ring-secondary/30"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <div
                className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
                role="status"
                aria-label="Generating invite link"
              />
            </div>
          ) : error ? (
            <div
              className="rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error"
              role="alert"
            >
              {error}
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-text-muted">
                Share this link with friends. Anyone with the link can join the group
                — it expires in 7 days.
              </p>

              {/* Invite URL display */}
              <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/5 p-3">
                <LinkIcon className="h-4 w-4 flex-shrink-0 text-text-muted" aria-hidden="true" />
                <span className="min-w-0 flex-1 break-all text-sm font-medium text-text">
                  {inviteUrl}
                </span>
              </div>

              {/* Copy button */}
              <button
                type="button"
                onClick={handleCopy}
                className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-heading text-sm font-semibold text-white transition-all duration-200 hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              >
                {copied ? (
                  <>
                    <ClipboardDocumentCheckIcon className="h-5 w-5" aria-hidden="true" />
                    Copied!
                  </>
                ) : (
                  <>
                    <ClipboardDocumentIcon className="h-5 w-5" aria-hidden="true" />
                    Copy link
                  </>
                )}
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full cursor-pointer rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-muted transition-colors duration-200 hover:bg-secondary/5 hover:text-text focus:outline-none focus:ring-2 focus:ring-secondary/30"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
