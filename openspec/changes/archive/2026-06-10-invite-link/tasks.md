# Tasks: Invite Link

> Addition to auth-and-groups-base. Allows group owners to generate shareable
> invite links that auto-join new users as ACTIVE members.

## Phase 1: Backend

- [x] 1.1 Update Prisma schema: add `inviteToken`, `inviteExpires` to Group model
- [x] 1.2 Run migration (db push + manual migration SQL)
- [x] 1.3 Create invite service (`src/services/invite.service.js`)
- [x] 1.4 Create invite controller (`src/controllers/invite.controller.js`)
- [x] 1.5 Create invite routes (`src/routes/invite.routes.js`)
- [x] 1.6 Modify auth schema to accept optional `inviteToken`
- [x] 1.7 Modify auth service `register()` to consume invite token
- [x] 1.8 Modify auth controller `register()` to pass `inviteToken`
- [x] 1.9 Wire invite routes in `index.js`
- [x] 1.10 Update error codes (`INVALID_TOKEN`, `TOKEN_EXPIRED`)

## Phase 2: Frontend

- [x] 2.1 Add `inviteService` to API module (`api.js`)
- [x] 2.2 Update `AuthContext.register()` to accept `inviteToken`
- [x] 2.3 Create `InviteModal` component with copy-to-clipboard
- [x] 2.4 Add "Invite" button + `InviteModal` to `GroupDetailPage` (owner only)
- [x] 2.5 Update `RegisterPage` to read `?invite=` from URL, validate token, display group name, and submit with inviteToken
