# Design: UI Lifecycle Gaps

## Technical Approach

Add frontend UI for eight backend-complete lifecycle features and fix one HTTP-method bug. All backend endpoints already exist — this is purely frontend work plus two small backend permission adjustments. Follow existing patterns: Tailwind modals, `api.js` service methods, page-level state management, permission-gated buttons.

## Architecture Decisions

### Decision: Confirmation Dialog Pattern

**Choice**: Inline confirmation dialog component (`ConfirmDialog`) reused across all destructive actions.
**Alternatives considered**: Browser `window.confirm()`, per-page inline confirmation state.
**Rationale**: `window.confirm()` blocks the main thread and can't be styled. Per-page state duplicates logic. A shared component matches the existing modal pattern (ExpenseForm, InviteModal, PaymentForm) and ensures consistent UX.

### Decision: Edit Expense — Extend ExpenseForm vs New Component

**Choice**: Add `editMode` + `initialData` props to existing `ExpenseForm`.
**Alternatives considered**: Create separate `EditExpenseForm` component.
**Rationale**: ExpenseForm already handles all split types and validation. Duplicating 800+ lines for edit mode is maintenance debt. The form already has all the state — just needs pre-fill and a different submit call.

### Decision: Delete Group — Location of Button

**Choice**: Delete button in `GroupDetailPage` settings section (owner-only). NOT on `GroupsPage` cards.
**Alternatives considered**: Delete from GroupsPage card context menu; delete in GroupDetailPage header.
**Rationale**: GroupDetailPage already has the full group context (members, expenses count) for the warning dialog. Placing it in a dedicated settings section (not the header) groups it with other owner-only actions and keeps navigation clean. GroupsPage cards are navigation targets — adding destructive actions there violates the existing interaction model.

### Decision: Remove Member — Separate Settings Panel

**Choice**: Dedicated "Member Management" panel accessible from `GroupDetailPage`. Shows each member's info with a per-member "Remove" action.
**Alternatives considered**: Inline remove button next to each member in the members list.
**Rationale**: Inline buttons clutter the members list and risk accidental clicks. A separate panel provides a clear admin context, room for member details (join date, balance summary), and a confirmation flow without polluting the read-only members view. Follows the pattern of other management views in the app.

### Decision: Leave Group — Balance Check

**Choice**: Frontend shows the button; backend enforces the negative-balance block.
**Alternatives considered**: Frontend pre-checks balance and disables button.
**Rationale**: Balances can change between fetch and click. Backend is the source of truth. Frontend shows a clear error message from the API response (`CANNOT_LEAVE_WITH_DEBTS`).

### Decision: Forgot Password — Inline on LoginPage

**Choice**: Expandable form section on LoginPage (toggle link → email input → submit).
**Alternatives considered**: Separate `/forgot-password` route/page.
**Rationale**: The spec says "link on LoginPage that expands into a form." Keeps the auth flow on one page. No new route needed — just state toggle.

## Data Flow

```
Delete Expense:
  User clicks Delete → ConfirmDialog → api.delete() → filter from expenses[] → re-render

Edit Expense:
  User clicks Edit → ExpenseForm(editMode) → api.put() → loadGroup() → re-render

Delete Payment:
  User clicks Delete → ConfirmDialog → api.delete() → filter from payments[] → re-render

Remove Member:
  Owner opens Member Mgmt panel → clicks Remove on member → ConfirmDialog → api.delete() → loadGroup() → re-render

Leave Group:
  User clicks Leave → ConfirmDialog → api.post(/leave) → navigate(/groups)

Delete Group:
  Owner clicks Delete → ConfirmDialog (warn if expenses) → api.delete() → navigate(/groups)

Edit Group:
  Owner opens Settings → EditGroupModal (name + currency only) → api.put() → loadGroup() → re-render

Forgot Password:
  User clicks "Forgot password?" → expand form → api.post(/forgot-password) → show success msg
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/frontend/src/components/ConfirmDialog.jsx` | Create | Shared confirmation dialog component |
| `apps/frontend/src/components/EditGroupModal.jsx` | Create | Modal for editing group name and currency (NOT balanceMode — immutable after creation) |
| `apps/frontend/src/components/MemberManagementPanel.jsx` | Create | Settings panel showing member list with details and per-member "Remove" action (owner-only) |
| `apps/frontend/src/services/api.js` | Modify | Add `groupService.update/delete`, `membershipService.remove/leave`, `authService.forgotPassword`, fix `updateItem` bug |
| `apps/frontend/src/pages/GroupDetailPage.jsx` | Modify | Add settings section: edit/delete group, edit/delete expense, delete payment, member management panel (with remove member), leave group buttons + modals |
| `apps/frontend/src/pages/GroupsPage.jsx` | Modify | Minor: refresh list on navigation back (no delete button on cards) |
| `apps/frontend/src/pages/LoginPage.jsx` | Modify | Add forgot-password expandable form |
| `apps/frontend/src/components/ExpenseForm.jsx` | Modify | Add `editMode` + `initialData` props for pre-fill |
| `apps/backend/src/services/expense.service.js` | Modify | `deleteExpense`: add group owner permission check |
| `apps/backend/src/services/payment.service.js` | Modify | `deletePayment`: add group owner permission check |
| `apps/backend/src/services/membership.service.js` | Modify | `leaveGroup`: change hard delete to soft delete (status=REMOVED), add negative-balance block |

## Interfaces / Contracts

### New API Service Methods

```javascript
// api.js additions

// GroupService
groupService.update = (id, data) => api.put(`/groups/${id}`, data);
groupService.delete = (id) => api.delete(`/groups/${id}`);

// MembershipService (new section)
export const membershipService = {
  remove: (groupId, userId) => api.delete(`/groups/${groupId}/members/${userId}`),
  leave: (groupId) => api.post(`/groups/${groupId}/leave`),
};

// AuthService
authService.forgotPassword = (email) => api.post('/auth/forgot-password', { email });

// Bug fix
expenseService.updateItem = (groupId, expenseId, itemId, data) =>
  api.patch(`/groups/${groupId}/expenses/${expenseId}/items/${itemId}`, data); // was api.put
```

### ConfirmDialog Props

```jsx
<ConfirmDialog
  title="Delete Expense"
  message="Are you sure you want to delete this expense?"
  warning="This group has existing expenses that will also be deleted." // optional
  confirmLabel="Delete"
  variant="danger" // "danger" | "warning"
  onConfirm={() => handleDelete()}
  onClose={() => setShowConfirm(false)}
/>
```

### ExpenseForm Edit Mode Props

```jsx
<ExpenseForm
  groupId={id}
  members={members}
  currency={currency}
  currentUserId={currentUserId}
  editMode={true}
  initialData={expenseToEdit}  // { id, description, amount, category, payerId, splitType, date, splits }
  onSuccess={loadGroup}
  onClose={() => setEditingExpense(null)}
/>
```

### EditGroupModal Props

```jsx
<EditGroupModal
  group={group}  // { id, name, currency }
  onSuccess={loadGroup}
  onClose={() => setShowEditGroup(false)}
/>
// balanceMode NOT editable — immutable after creation
```

### MemberManagementPanel Props

```jsx
<MemberManagementPanel
  groupId={id}
  members={members}  // [{ id, name, email, balance, joinedAt }]
  ownerId={group.ownerId}
  currentUserId={currentUserId}
  onRemoveMember={(userId) => handleRemoveMember(userId)}
  onClose={() => setShowMemberPanel(false)}
/>
// Owner-only panel: shows member details + per-member "Remove" action
```

### Permission Model

| Action | Who Can Do It | Frontend Check | Backend Check |
|--------|--------------|----------------|---------------|
| Edit group | Owner only | `group.ownerId === currentUserId` | `group.ownerId !== userId` → 403 |
| Delete group | Owner only | `group.ownerId === currentUserId` | `group.ownerId !== userId` → 403 |
| Edit expense | Payer or creator | `expense.payerId === userId \|\| expense.createdById === userId` | Same check → 403 |
| Delete expense | Creator or group owner | `expense.createdById === userId \|\| group.ownerId === userId` | Same check → 403 |
| Delete payment | Sender or group owner | `payment.fromUserId === userId \|\| group.ownerId === userId` | Same check → 403 |
| Remove member | Owner only | `group.ownerId === currentUserId` | `group.ownerId !== requesterId` → 403 |
| Leave group | Non-owner member | `group.ownerId !== currentUserId` | `group.ownerId === userId` → 400 |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | ConfirmDialog renders, calls onConfirm | React Testing Library |
| Unit | ExpenseForm editMode pre-fills fields | React Testing Library |
| Integration | Delete expense filters from list | Mock API, verify state update |
| Integration | Leave group with negative balance shows error | Mock API 400, verify error display |
| E2E | Owner can edit/delete group | Playwright: login as owner, edit, verify |
| E2E | Non-owner sees no edit/delete buttons | Playwright: login as member, verify absence |

## Migration / Rollout

No migration required. No database changes. Backend permission changes are backward-compatible (expanding who can delete, not restricting). Rollback: revert the single commit.
