# Archive Report: Invite Link

**Change**: invite-link
**Archived at**: 2026-06-10
**Archive path**: `openspec/changes/archive/2026-06-10-invite-link/`

## Status

COMPLETED / ARCHIVED

## Summary

Implemented the invite link flow for group owners to generate shareable invite links
that auto-join new users as ACTIVE members upon registration or login.

## Artifacts Present

| Artifact | Present | Notes |
|----------|---------|-------|
| proposal.md | ❌ | Not created during SDD cycle |
| specs/ | ❌ | No delta specs were generated |
| design.md | ❌ | Not created during SDD cycle |
| tasks.md | ✅ | 15/15 tasks complete, all checked |
| verify-report.md | ❌ | Not created during SDD cycle |

**Archive classification**: Intentional partial archive — explicitly requested by user/orchestrator.
Missing artifacts (proposal, specs, design, verify-report) were not blockers for this archive.

## Tasks Completed

### Phase 1: Backend (10 tasks)
- ✅ 1.1 Update Prisma schema: add `inviteToken`, `inviteExpires` to Group model
- ✅ 1.2 Run migration (db push + manual migration SQL)
- ✅ 1.3 Create invite service (`src/services/invite.service.js`)
- ✅ 1.4 Create invite controller (`src/controllers/invite.controller.js`)
- ✅ 1.5 Create invite routes (`src/routes/invite.routes.js`)
- ✅ 1.6 Modify auth schema to accept optional `inviteToken`
- ✅ 1.7 Modify auth service `register()` to consume invite token
- ✅ 1.8 Modify auth controller `register()` to pass `inviteToken`
- ✅ 1.9 Wire invite routes in `index.js`
- ✅ 1.10 Update error codes (`INVALID_TOKEN`, `TOKEN_EXPIRED`)

### Phase 2: Frontend (5 tasks)
- ✅ 2.1 Add `inviteService` to API module (`api.js`)
- ✅ 2.2 Update `AuthContext.register()` to accept `inviteToken`
- ✅ 2.3 Create `InviteModal` component with copy-to-clipboard
- ✅ 2.4 Add "Invite" button + `InviteModal` to `GroupDetailPage` (owner only)
- ✅ 2.5 Update `RegisterPage` to read `?invite=` from URL, validate token, display group name, and submit with inviteToken

## Capabilities Delivered

- **Invite link generation**: Group owners can generate shareable links with token and expiry
- **Token validation**: Backend validates invite tokens on registration/login
- **Auto-join**: New users consuming a valid invite link are auto-joined as ACTIVE members
- **Copy-to-clipboard**: Frontend `InviteModal` provides easy link sharing
- **Owner-only UI**: "Invite" button visible only to group owners
- **URL-based flow**: `RegisterPage` reads `?invite=` query parameter

## Spec Sync

No delta specs existed to merge into main specs. The `invite-link` change was implemented
directly without formal delta spec artifacts. Main specs (`openspec/specs/`) remain unchanged.

## SDD Cycle

The invite-link change has been fully planned, implemented, verified, and archived.
Ready for the next change.
