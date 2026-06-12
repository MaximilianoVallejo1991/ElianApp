import { useState } from 'react';
import {
  XMarkIcon,
  UserIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';

/**
 * MemberManagementPanel — settings panel for group owner to manage members.
 * Shows per-member details with a per-member "Remove" and "Freeze/Unfreeze" action.
 * Only the group owner can see or use this panel.
 *
 * Props:
 *   groupId        — the group ID
 *   members        — array of group members (each with userId + user object + isFrozen)
 *   ownerId        — the group owner's userId
 *   currentUserId  — the authenticated user's ID
 *   onRemoveMember — callback(userId) when remove is confirmed
 *   onFreezeMember — callback(userId) when freeze is triggered
 *   onUnfreezeMember — callback(userId) when unfreeze is triggered
 *   onClose        — callback to close panel
 */
export default function MemberManagementPanel({
  members,
  ownerId,
  currentUserId,
  onRemoveMember,
  onFreezeMember,
  onUnfreezeMember,
  onClose,
}) {
  const [confirmRemoveFor, setConfirmRemoveFor] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [freezingId, setFreezingId] = useState(null);
  const [error, setError] = useState('');

  const isOwner = currentUserId === ownerId;

  const handleRemoveConfirm = async (userId) => {
    setRemovingId(userId);
    setError('');
    try {
      await onRemoveMember(userId);
      setConfirmRemoveFor(null);
    } catch (err) {
      setError(err.message || 'Failed to remove member.');
    } finally {
      setRemovingId(null);
    }
  };

  const handleFreezeToggle = async (userId, isFrozen) => {
    setFreezingId(userId);
    setError('');
    try {
      if (isFrozen) {
        await onUnfreezeMember(userId);
      } else {
        await onFreezeMember(userId);
      }
    } catch (err) {
      setError(err.message || 'Failed to update member freeze status.');
    } finally {
      setFreezingId(null);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Unknown';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Member management"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-heading text-lg font-bold text-primary">
            Member management
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

        {/* Body */}
        <div className="px-6 py-5">
          {!isOwner ? (
            <p className="text-sm text-text-muted">
              Only the group owner can manage members.
            </p>
          ) : (
            <>
              {error && (
                <div
                  className="mb-4 rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error"
                  role="alert"
                >
                  {error}
                </div>
              )}

              <p className="mb-4 text-xs text-text-muted">
                {members.length} member{members.length !== 1 ? 's' : ''} in this group.
                Removing a member does not delete their historical expenses or payments.
              </p>

              <ul className="space-y-2">
                {members.map((member) => {
                  const isMemberOwner = member.userId === ownerId;
                  const isRemoving = removingId === member.userId;
                  const isConfirming = confirmRemoveFor === member.userId;

                  return (
                    <li
                      key={member.userId}
                      className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/5">
                          <UserIcon className="h-4 w-4 text-primary" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-text">
                            {member.user?.nickName || member.user?.email || 'Unknown'}
                            {isMemberOwner && (
                              <span className="ml-2 inline-block rounded-full bg-cta/10 px-2 py-0.5 font-heading text-[10px] font-semibold uppercase tracking-wider text-cta">
                                Owner
                              </span>
                            )}
                            {member.isFrozen && (
                              <span className="ml-2 inline-block rounded-full bg-blue-100 px-2 py-0.5 font-heading text-[10px] font-semibold uppercase tracking-wider text-blue-600">
                                ❄️ Frozen
                              </span>
                            )}
                          </p>
                          {member.user?.email && (
                            <p className="truncate text-xs text-text-muted">
                              {member.user.email}
                            </p>
                          )}
                          {member.joinedAt && (
                            <p className="text-xs text-text-muted">
                              Joined {formatDate(member.joinedAt)}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Remove and Freeze actions — owner only, cannot act on self or other owner */}
                      {!isMemberOwner && (
                        <div className="flex-shrink-0 ml-3 flex items-center gap-1">
                          {/* Freeze/Unfreeze button */}
                          <button
                            type="button"
                            onClick={() => handleFreezeToggle(member.userId, member.isFrozen)}
                            disabled={freezingId === member.userId}
                            className={`cursor-pointer rounded-lg p-1.5 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
                              member.isFrozen
                                ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                                : 'text-text-muted hover:bg-blue-50 hover:text-blue-500'
                            }`}
                            aria-label={member.isFrozen ? `Unfreeze ${member.user?.nickName || member.user?.email || 'member'}` : `Freeze ${member.user?.nickName || member.user?.email || 'member'}`}
                            title={member.isFrozen ? 'Unfreeze member' : 'Freeze member (prevents creating expenses)'}
                          >
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93L4.93 19.07" />
                              <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
                            </svg>
                          </button>

                          {isConfirming ? (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleRemoveConfirm(member.userId)}
                                disabled={isRemoving}
                                className="cursor-pointer rounded-lg bg-error px-3 py-1.5 text-xs font-semibold text-white transition-colors duration-200 hover:bg-error/90 disabled:opacity-60"
                              >
                                {isRemoving ? 'Removing…' : 'Confirm'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmRemoveFor(null)}
                                className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-muted transition-colors duration-200 hover:bg-border/30"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmRemoveFor(member.userId)}
                              className="cursor-pointer rounded-lg p-1.5 text-text-muted transition-colors duration-200 hover:bg-error/10 hover:text-error focus:outline-none focus:ring-2 focus:ring-error/30"
                              aria-label={`Remove ${member.user?.nickName || member.user?.email || 'member'}`}
                            >
                              <TrashIcon className="h-4 w-4" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-text-muted transition-colors duration-200 hover:bg-border/30 focus:outline-none focus:ring-2 focus:ring-secondary/30"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}