# Proposal: auth-and-groups-base

## Intent

Establish the authentication layer (registration, login, cookie-based JWT) and group management foundation (CRUD, membership lifecycle) for the Splitwise clone. This is the first SDD change — it must be completed before any expense or balance functionality can be built.

## Scope

### In Scope
- User registration (email, nickName, password) with hashed passwords via bcrypt
- User login (email + password) returning httpOnly JWT cookie
- Auth middleware protecting backend routes
- Group CRUD (create, edit, delete)
- Group membership: invite by email, accept/reject workflow, remove member
- Leave group (self-removal)
- Backend route structure under `apps/backend/src/routes/auth.ts` and `apps/backend/src/routes/groups.ts`

### Out of Scope
- Expenses, splits, payments, balance calculations (any mode)
- Frontend UI beyond basic structure (components, pages, Context providers)
- Static closure workflow (partial/definitive closures, reset to zero, confirmation)
- JWT refresh tokens (single token with reasonable expiry)

## Capabilities

### New Capabilities
- `user-auth`: Registration, login, logout, and JWT validation middleware
- `group-management`: Full group lifecycle (create, edit, delete, list)
- `group-membership`: Invite, accept/reject, remove member, leave group

### Modified Capabilities
- None — this is the first change; no existing capabilities are being altered

## Approach

**Backend (Express + Prisma)**:
- Auth routes: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`
- JWT payload: `{ userId, email }`, stored in httpOnly cookie (`cookie` package)
- Middleware: `authenticate` extracts and verifies JWT from cookie, attaches `req.user`
- Group routes: `POST/GET/PUT/DELETE /groups`, membership routes nested under `/groups/:groupId/members`
- Validation with Zod schemas for all request bodies

**Database**:
- Use existing `User`, `Group`, `GroupMember` models (already in schema)
- No migrations needed for this change

**Frontend skeleton**:
- `apps/frontend/src/context/AuthContext.tsx` — user state holder
- `apps/frontend/src/api/auth.ts` and `apps/frontend/src/api/groups.ts` — API client functions using Axios
- `apps/frontend/src/pages/Auth.tsx` — login/register form
- `apps/frontend/src/pages/Groups.tsx` — group list/create
- No full UI implementation — skeleton only for this change

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/backend/src/routes/auth.ts` | New | Auth endpoints (register, login, logout) |
| `apps/backend/src/routes/groups.ts` | New | Group CRUD and membership endpoints |
| `apps/backend/src/middleware/authenticate.ts` | New | JWT verification middleware |
| `apps/backend/src/utils/jwt.ts` | New | JWT sign/verify helpers |
| `apps/frontend/src/context/AuthContext.tsx` | New | Auth state Context |
| `apps/frontend/src/api/auth.ts` | New | Auth API client |
| `apps/frontend/src/api/groups.ts` | New | Groups API client |
| `apps/frontend/src/pages/Auth.tsx` | New | Login/register page skeleton |
| `apps/frontend/src/pages/Groups.tsx` | New | Groups page skeleton |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Password stored without proper hashing | Low | Use bcrypt with cost factor 12 |
| JWT exposed in localStorage (XSS) | Low | httpOnly cookie only — no client JS access |
| Group deletion removes all members | Medium | Warn in spec: deletion cascades via Prisma `onDelete: Cascade`; document this behavior |
| Invite without pending state (race) | Medium | Use `GroupMember` existing row with `joinedAt` as approval date; add `status` field if needed later |

## Rollback Plan

1. Revert `apps/backend/src/routes/auth.ts`, `apps/backend/src/routes/groups.ts`, and `apps/backend/src/middleware/authenticate.ts` — delete these files
2. Revert `apps/frontend/src/context/AuthContext.tsx`, `apps/frontend/src/api/auth.ts`, `apps/frontend/src/api/groups.ts`, `apps/frontend/src/pages/Auth.tsx`, `apps/frontend/src/pages/Groups.tsx` — delete these files
3. No database migration needed (no schema changes in this change)
4. Git revert or delete the commit

## Dependencies

- `bcrypt` for password hashing
- `jsonwebtoken` for JWT
- `cookie` for parsing/setting httpOnly cookies
- `zod` for request validation

## Success Criteria

- [ ] `POST /auth/register` creates user with hashed password and returns 201
- [ ] `POST /auth/login` validates credentials and sets httpOnly JWT cookie
- [ ] `GET /groups` returns 401 without valid JWT cookie
- [ ] `POST /groups` creates a group and returns 201 with group object
- [ ] `POST /groups/:id/members` with valid invite creates pending membership
- [ ] `DELETE /groups/:id/members/:userId` removes member or self-removes
- [ ] All endpoints validate request body with Zod schemas
- [ ] No test runner required (per project config), but ESLint passes on new files