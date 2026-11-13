/**
 * Expense action permissions — pure 1:1 transcriptions of the backend rules in
 * `apps/backend/src/services/expense.service.js`. If a rule changes there, it
 * MUST change here in the same commit: a button that renders for a user the
 * backend will refuse is the drift this module exists to prevent.
 */

/** Backend: updateExpense L546 — payer OR creator OR group owner. */
export function canEditExpense(expense, group, currentUserId) {
  if (!expense || !currentUserId) return false;
  return (
    expense.payerId === currentUserId ||
    expense.createdById === currentUserId ||
    group?.ownerId === currentUserId
  );
}

/** Backend: deleteExpense L806-815 — creator OR group owner. NO payer. */
export function canDeleteExpense(expense, group, currentUserId) {
  if (!expense || !currentUserId) return false;
  return expense.createdById === currentUserId || group?.ownerId === currentUserId;
}

/**
 * Backend: unlockExpense L848-859 — COLLECTIVE *and* creator-only *and*
 * COMPLETED. All three gates, not just the authorization one.
 * `group` is unused; kept for uniform arity across this module.
 */
export function canUnlockExpense(expense, group, currentUserId) {
  if (!expense || !currentUserId) return false;
  return (
    expense.splitType === 'COLLECTIVE' &&
    expense.createdById === currentUserId &&
    expense.status === 'COMPLETED'
  );
}
