/**
 * Compute the optimal settlement path to resolve all debts with minimum transactions.
 *
 * Algorithm: Greedy matching
 * 1. Separate users into creditors (positive netBalance) and debtors (negative netBalance)
 * 2. Sort both by absolute amount descending
 * 3. Match largest debtor with largest creditor until all settled
 * 4. Returns an array of { from, to, amount } transactions
 *
 * @param {Array<{
 *   userId: string,
 *   user: { id: string, nickName: string, email: string },
 *   netBalance: number
 * }>} balances
 * @returns {Array<{
 *   from: { userId: string, nickName: string, email: string },
 *   to: { userId: string, nickName: string, email: string },
 *   amount: number
 * }>}
 */
export function computeSettlements(balances) {
  const settlements = [];

  // Clone balances to avoid mutation
  const users = balances.map((b) => ({
    ...b,
    remaining: Math.round(b.netBalance * 100) / 100,
  }));

  // Separate into creditors (positive) and debtors (negative)
  const creditors = users.filter((u) => u.remaining > 0.01);
  const debtors = users.filter((u) => u.remaining < -0.01);

  // Sort by absolute value descending
  creditors.sort((a, b) => b.remaining - a.remaining);
  debtors.sort((a, b) => a.remaining - b.remaining); // most negative first

  let creditorIdx = 0;
  let debtorIdx = 0;

  while (creditorIdx < creditors.length && debtorIdx < debtors.length) {
    const creditor = creditors[creditorIdx];
    const debtor = debtors[debtorIdx];

    // How much can debtor pay? (negative, so negate for positive amount)
    const debtAmount = Math.abs(debtor.remaining);
    // How much does creditor need?
    const creditNeeded = creditor.remaining;

    // Settlement amount is the smaller of the two
    const settleAmount = Math.min(debtAmount, creditNeeded);

    if (settleAmount > 0.01) {
      settlements.push({
        from: {
          userId: debtor.userId,
          nickName: debtor.user?.nickName || debtor.user?.email || debtor.userId,
          email: debtor.user?.email,
        },
        to: {
          userId: creditor.userId,
          nickName: creditor.user?.nickName || creditor.user?.email || creditor.userId,
          email: creditor.user?.email,
        },
        amount: Math.round(settleAmount * 100) / 100,
      });
    }

    // Update remaining amounts
    creditor.remaining -= settleAmount;
    debtor.remaining += settleAmount; // adding to negative makes it less negative

    // Move to next if settled
    if (Math.abs(creditor.remaining) < 0.01) creditorIdx++;
    if (Math.abs(debtor.remaining) < 0.01) debtorIdx++;
  }

  return settlements;
}