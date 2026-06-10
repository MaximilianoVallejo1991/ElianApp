# Proposal: UI Lifecycle Gaps

## Intent

Add the missing frontend UI for eight backend-complete lifecycle features (group edit/delete, expense edit/delete, payment delete, member remove/leave, forgot password) and fix the `updateItem` HTTP-method bug.

## Scope

### In Scope
- Edit group (name, currency, balanceMode) — modal in `GroupDetailPage`
- Delete group — confirmation dialog, owner-only
- Edit expense — reuse `ExpenseForm` wizard in edit mode
- Delete expense — confirmation dialog, payer/creator-only
- Delete payment — confirmation dialog, sender-only
- Remove member — owner-only action in members list
- Leave group — non-owner action with confirmation
- Forgot password — form on `LoginPage` calling `POST /auth/forgot-password`
- Bug fix: `expenseService.updateItem` → `api.patch()` (backend route is `PATCH`)

### Out of Scope
- Ownership transfer
- Email delivery / password-reset token consumption page
- Backend route changes (all endpoints already exist)

## Capabilities

### New Capabilities
None

### Modified Capabilities
None

## Approach

Follow existing frontend patterns: Tailwind modals, inline confirmation dialogs, `api.js` service methods, and page-level state management. Wire new actions into `GroupsPage`, `GroupDetailPage`, and `LoginPage` with permission-based visibility.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/frontend/src/services/api.js` | Modified | Add `groupService.update/delete`, `membershipService.remove/leave`, fix `updateItem` method |
| `apps/frontend/src/pages/GroupDetailPage.jsx` | Modified | Add edit/delete group, edit/delete expense, delete payment, remove member, leave group UI |
| `apps/frontend/src/pages/GroupsPage.jsx` | Modified | Add delete group option (if owner) |
| `apps/frontend/src/pages/LoginPage.jsx` | Modified | Add forgot-password link + form |
| `apps/frontend/src/components/ExpenseForm.jsx` | Modified | Support `editMode` prop with pre-filled data |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Permission edge cases | Low | Reuse existing backend ownership checks; UI only shows buttons when allowed |
| Modal state conflicts | Low | Centralize modal state per entity; close others on open |
| `updateItem` bug affects collective expenses | Med | Fix is one-line change; verify immediately after apply |

## Rollback Plan

Revert the single commit or branch containing these changes. No database migrations or backend changes are involved.

## Dependencies

None

## Success Criteria

- [ ] Owner can edit group name/currency/balanceMode
- [ ] Owner can delete group with confirmation
- [ ] Payer/creator can edit any existing expense
- [ ] Payer/creator can delete expense with confirmation
- [ ] Sender can delete payment with confirmation
- [ ] Owner can remove member with confirmation
- [ ] Non-owner member can leave group with confirmation
- [ ] User can request password reset from login page
- [ ] `expenseService.updateItem` uses `PATCH` and collective item edits work
- [ ] Build passes (`pnpm -r run build`)
