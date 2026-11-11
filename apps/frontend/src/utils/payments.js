/**
 * Payment acceptance gating utility — pure function used to decide whether
 * the payment status badge and the creditor's accept/reject controls should
 * render for a given group/period combination.
 */

/**
 * Payment acceptance (status badge + creditor accept/reject) is live:
 *   - for DYNAMIC groups: always — they have no periods and no closure
 *   - for STATIC groups: only while the current period is CLOSING
 *
 * A missing `balanceMode` is treated as DYNAMIC, matching this page's
 * existing `balanceMode !== 'STATIC'` idiom elsewhere.
 *
 * @param {'STATIC'|'DYNAMIC'|undefined} balanceMode
 * @param {'OPEN'|'CLOSING'|'CLOSED'|'FINAL'|undefined|null} periodStatus
 * @returns {boolean}
 */
export function isPaymentAcceptanceActive(balanceMode, periodStatus) {
  if (balanceMode === 'STATIC') {
    return periodStatus === 'CLOSING';
  }
  return true;
}
