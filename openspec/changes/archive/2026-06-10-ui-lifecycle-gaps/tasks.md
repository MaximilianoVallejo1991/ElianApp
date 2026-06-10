# Tasks: UI Lifecycle Gaps

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 440–480 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Delivery strategy | ask-on-risk |
| Suggested split | PR 1 → PR 2 |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Backend permissions + api.js additions/fix + new UI components | PR 1 | ~290 lines; standalone deliverable; includes ConfirmDialog, EditGroupModal, MemberManagementPanel, ExpenseForm editMode |
| 2 | Page integration + LoginPage forgot password | PR 2 | ~175 lines; base=PR 1; wires all components into GroupDetailPage, LoginPage, GroupsPage |

## Phase 1: Backend Permission Changes

- [x] 1.1 `[backend]` Expand `deleteExpense` (`expense.service.js`): allow `group.ownerId === userId` in addition to payer/creator. **AC**: Group owner can delete any expense via API; non-owner non-creator still gets 403.
- [x] 1.2 `[backend]` Expand `deletePayment` (`payment.service.js`): allow `group.ownerId === userId` in addition to sender. Fetch group via `prisma.group.findUnique` to check `ownerId`. **AC**: Group owner can delete any payment via API.
- [x] 1.3 `[backend]` Change `leaveGroup` (`membership.service.js`): soft-delete (status=REMOVED) instead of hard delete; add negative-balance check returning HTTP 400 with `CANNOT_LEAVE_WITH_DEBTS`. **AC**: Member with debts blocked; zero/positive balance sets REMOVED; owner blocked with `CANNOT_LEAVE_AS_OWNER`.

## Phase 2: Bug Fix + API Service Additions

- [x] 2.1 `[bugfix]` Fix `expenseService.updateItem` (`api.js`): change `api.put()` to `api.patch()`. **AC**: POST a PATCH to `/groups/:gid/expenses/:eid/items/:iid` returns 200.
- [x] 2.2 `[frontend]` Add missing methods to `api.js`: `groupService.update(id, data)` → PUT; `groupService.delete(id)` → DELETE; `membershipService` export with `remove(groupId, userId)` → DELETE and `leave(groupId)` → POST; `authService.forgotPassword(email)` → POST. **AC**: All new methods call correct verb and URL; importable from `api.js`.

## Phase 3: Core UI Components

- [x] 3.1 `[frontend]` Create `ConfirmDialog.jsx` with props: `title`, `message`, `warning` (opt), `confirmLabel`, `variant` ("danger"|"warning"), `onConfirm`, `onClose`. Follow existing modal backdrop pattern. **AC**: Renders; calls `onConfirm` on click; calls `onClose` on cancel/backdrop.
- [x] 3.2 `[frontend]` Create `EditGroupModal.jsx` with props: `group` ({id,name,currency}), `onSuccess`, `onClose`. Pre-fill name+currency only (NOT balanceMode). Submit via `groupService.update()`. **AC**: Owner edits name/currency; modal closes on success; non-owner sees no trigger.
- [x] 3.3 `[frontend]` Create `MemberManagementPanel.jsx` with props: `groupId`, `members`, `ownerId`, `currentUserId`, `onRemoveMember`, `onClose`. Show per-member details (name, email, joinedAt). Per-member "Remove" button guarded by `currentUserId === ownerId`. **AC**: Owner-only panel renders member list; Remove calls `onRemoveMember(userId)`.
- [x] 3.4 `[frontend]` Extend `ExpenseForm.jsx`: add `editMode` (bool) and `initialData` (expense object) props. In edit mode: pre-fill all fields from `initialData`; change submit to call `expenseService.update()`; change title/button labels to "Edit expense"/"Save changes". **AC**: Edit mode pre-fills; PUT submits correctly; create mode unchanged.

## Phase 4: Page-Level Integration

- [x] 4.1 `[frontend]` Wire `GroupDetailPage.jsx`: add Settings section (owner-only) with Edit Group and Delete Group buttons; add Edit/Delete buttons per expense (payer/creator or owner); add Delete button per payment (sender or owner); add Leave Group button (non-owner); wire all to ConfirmDialog/EditGroupModal/MemberManagementPanel. **AC**: Buttons visible per permission model; confirmations shown; API calls succeed.
- [x] 4.2 `[frontend]` Add forgot-password to `LoginPage.jsx`: "Forgot password?" link below form → toggle shows email input → submit calls `authService.forgotPassword()` → show success message. **AC**: Submits POST; shows success; hides email after submit. Note: implemented as dedicated ForgotPasswordPage at /forgot-password route.
- [x] 4.3 `[frontend]` Refresh `GroupsPage.jsx` on navigation back: trigger `loadGroups()` on mount so deleted/left groups are reflected. **AC**: After leaving a group, returning to GroupsPage shows updated list. (Already working via useEffect on mount)

## Phase 5: Verification

- [x] 5.1 Run `pnpm --filter frontend run lint` — zero errors. **AC**: ESLint passes.
- [x] 5.2 Run `pnpm -r run build` — both apps build. **AC**: Backend and frontend build without errors.
- [x] 5.3 Manual checklist: owner edits group; owner deletes group (with/without expenses); payer edits expense; creator deletes expense; owner deletes any expense; sender deletes payment; owner deletes any payment; owner removes member; non-owner leaves group (zero balance); non-owner blocked with debts; forgot-password submits; GroupsPage refreshes on back-navigation.
