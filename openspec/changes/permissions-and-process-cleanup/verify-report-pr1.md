# Verify Report - PR 1 (Phase 1: Frontend Permission Alignment)

**Change:** permissions-and-process-cleanup
**Scope:** PR 1 only (item 1) - branch fix/expense-permission-alignment, 3 commits, not pushed, not merged, branched off main (Cycle 1 + 2 already merged and archived)
**Verified against:** openspec/changes/permissions-and-process-cleanup/specs/expense-management/spec.md (frontend-relevant requirements), tasks.md Phase 1 + addendum, apply-progress observation #567
**Bar used:** ponytail discipline per the tasks.md Testing Philosophy note - one small test per real case, not a combinatorial matrix. PR1 intentionally has fewer tests than Cycle 1/2; this is NOT flagged as a coverage gap.

## Summary

- CRITICAL: 0
- WARNING: 0
- SUGGESTION: 2

PR1 is ready to push and open for human review.

## Scope containment

git diff main...fix/expense-permission-alignment --stat:

```
apps/frontend/src/pages/GroupDetailPage.jsx        |  15 +-
apps/frontend/src/utils/__tests__/expensePermissions.test.js |  35 +++
apps/frontend/src/utils/expensePermissions.js      |  32 +++
openspec/changes/permissions-and-process-cleanup/tasks.md |  268 +++
4 files changed, 341 insertions(+), 9 deletions(-)
```

Confirmed: only the 3 frontend files plus tasks.md. No backend file touched. Matches the stated PR1 scope exactly.

## Commits - attribution check

```
9487cdf docs(sdd): record PR 1 code-review addendum in tasks.md
abd9bca refactor(expense-permissions): drop unused param and redundant JSX check
5e44bed fix(frontend): align expense edit/delete/unlock buttons with backend rules
```

All 3 full commit messages were read - no Co-Authored-By or AI attribution in any of them. Clean conventional-commit style.

## Code-review follow-up (abd9bca) - confirmed present

A fresh-context review found 8 items; the addendum claims 4 were fixed in abd9bca. Verified directly against the diff:

| Finding | Fixed? | Evidence |
|---|---|---|
| Unused group param on canUnlockExpense | Yes | Current signature is canUnlockExpense(expense, currentUserId) - no group param; call site GroupDetailPage.jsx:1189 passes only 2 args |
| Redundant isCollective check in JSX unlock gate | Yes | Gate is now canUnlockExpense(expense, currentUserId) && isLocked - the separate isCollective conjunct is gone (checked internally by the helper instead) |
| Stale line-number references in JSDoc | Yes | Comments now say e.g. Backend: updateExpense - payer or creator or group owner. - no L546/L806 style pins remain in expensePermissions.js |
| CAPS-emphasis comment | Yes | No CAPS-emphasis strings found in the final file |

## Deferred items - scope-correctness check

The addendum lists 3 items deliberately not fixed. Checked each against actual code, not just the prose:

1. isGroupOwner / group?.ownerId === currentUserId duplication - grepped the frontend; found the pattern at 5 locations (expensePermissions.js x2, GroupDetailPage.jsx x3: lines 570, 734, 872) plus a related ownerId === member.userId comparison at line 948. The addendum figure of 7 call sites is slightly loose (actual count is 5-6 depending on how the member.userId variant is counted; see Suggestion 2 below) but the substance is correct: this is a real, pre-existing, multi-site duplication unrelated to the 2 call sites this PR touches. Genuinely out of scope.
2. canDeletePayment left inline (GroupDetailPage.jsx:571, const canDeletePayment = isSender || isGroupOwner;) - confirmed it exists, is a separate local variable for a different entity (payments, not expenses), and was not touched. Consistent with the stated rule of not touching what was not asked.
3. Backend never exposes canEdit/canDelete/canUnlock on the expense API response - grepped backend src/ for canEdit, canDelete, canUnlock: no matches. Confirmed; this is a real API-shape change, correctly out of scope.

None of the 3 deferred items are things that should have been in scope for this PR (aligning the 3 frontend actions to their existing backend rules). All are either cross-cutting refactors or API-shape changes.

## Backend-to-frontend rule parity (line-by-line, read from backend source, not from frontend comments)

| Frontend helper | Backend function | Backend rule (as read) | Match |
|---|---|---|---|
| canEditExpense | updateExpense (expense.service.js:546) | payerId === userId OR createdById === userId OR isGroupOwner | Exact match |
| canDeleteExpense | deleteExpense (expense.service.js:806-815) | createdById === userId OR isGroupOwner (no payer branch) | Exact match |
| canUnlockExpense | unlockExpense (expense.service.js:848-859) | splitType === COLLECTIVE AND createdById === userId (no owner override) AND status === COMPLETED | Exact match |

All three frontend rules are confirmed as exact transcriptions of the current backend authorization logic.

## Swallowed-403 fix

Before: catch block with silent ignore comment on the unlock handler.
After: catch (err) { alert(err.message || "Failed to unlock expense."); }

This is the same alert(err.message || fallback) pattern already used elsewhere in the same file for handleDeleteExpense (line 230), handleDeletePayment (line 244), handleLeaveGroup (line 274), handleDeleteGroup (line 367), handleAcceptPayment (line 318), handleRejectPayment (line 330) - not a new error-display mechanism.

## Spec scenario traceability (item 1, frontend-relevant scenarios only)

Per tasks.md 1.5, Phase 1 explicitly walks 3 scenarios (a short list, not exhaustive - correct under ponytail; the other Delete/Unlock scenarios are backend-execution scenarios unaffected by this frontend-only PR and already covered by Cycle 1/2):

| Scenario | Trace |
|---|---|
| Payer who is not creator does not see unlock control | canUnlockExpense has no payer branch at all - any non-creator (payer or otherwise) returns false; wired at GroupDetailPage.jsx:1189; positive case asserted by expensePermissions.test.js |
| Refused unlock surfaces a visible error | catch (err) with alert replaces the bare catch with silent ignore - confirmed in diff |
| Payer who is not creator or owner no longer sees delete control | canDeleteExpense test: payer-not-creator-not-owner returns false; wired at GroupDetailPage.jsx:1158 |

The test run confirms the only behavior-changing case (canDeleteExpense payer-not-creator) and the already-correct case (canEditExpense payer-not-creator) are both pinned by the 5 tests in expensePermissions.test.js.

## Test run (actual, not trusted from apply-progress)

```
pnpm --filter backend test   -> 7 test files, 73 tests passed
pnpm --filter frontend test  -> 4 test files, 50 tests passed
```

Matches the counts claimed in the apply report exactly.

## Suggestions (non-blocking)

1. The identity-mismatch branch of canUnlockExpense has no direct test. Both existing unlock tests use currentUserId equal to user-1 (the creator) - one varies status to get the false case, neither varies identity to get false via a non-creator caller. Low risk: the function has no payer-specific branch (createdById === currentUserId is the only identity check), so a non-creator and the already-tested PENDING-false case exercise the same short-circuit path in practice. Not required under the ponytail bar, but a reviewer could ask for it as a sixth one-liner case.
2. The addendum figure of 7 call sites for the ownerId === currentUserId duplication is approximate. Actual grep across apps/frontend/src finds 5 exact matches of group ownerId === currentUserId plus 1 related ownerId === member.userId comparison (6 total, depending on how the variant is counted). Does not change the deferred-scope decision - just tighten the number if this addendum is cited again.

## Verdict

No CRITICAL or WARNING findings. Scope is contained to the 3 stated files plus tasks.md, commits are clean, the 3 frontend rules are verified as exact matches of current backend logic, the swallowed-403 fix is in place and uses the existing pattern, the 4 code-review fixes are present, and the 3 deferred items are genuinely out of scope for this PR. PR1 is ready to push and open for human review.
