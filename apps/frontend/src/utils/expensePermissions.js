/**
 * Expense action permissions — pure 1:1 transcriptions of the backend rules in
 * `apps/backend/src/services/expense.service.js`. If a rule changes there, it
 * must change here in the same commit: a button that renders for a user the
 * backend will refuse is the drift this module exists to prevent.
 */

/** Backend: updateExpense — payer or creator or group owner. */
export function canEditExpense(expense, group, currentUserId) {
  if (!expense || !currentUserId) return false;
  return (
    expense.payerId === currentUserId ||
    expense.createdById === currentUserId ||
    group?.ownerId === currentUserId
  );
}

/** Backend: deleteExpense — creator or group owner, not the payer. */
export function canDeleteExpense(expense, group, currentUserId) {
  if (!expense || !currentUserId) return false;
  return expense.createdById === currentUserId || group?.ownerId === currentUserId;
}

/** Backend: unlockExpense — creator only (no group-owner override), COLLECTIVE, COMPLETED. */
export function canUnlockExpense(expense, currentUserId) {
  if (!expense || !currentUserId) return false;
  return (
    expense.splitType === 'COLLECTIVE' &&
    expense.createdById === currentUserId &&
    expense.status === 'COMPLETED'
  );
}
