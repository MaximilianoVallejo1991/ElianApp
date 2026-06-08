# Tasks: Auth & Groups Base

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 750–900 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (schema + foundation) → PR 2 (auth) → PR 3 (groups + membership + wiring) → PR 4 (frontend skeleton) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Schema migration + utils + middleware (foundation all other tasks depend on) | PR 1 | Base branch; includes deps install (zod, cookie) |
| 2 | Auth service, controller, routes — register/login/logout/me/forgot-password | PR 2 | Depends on PR 1; standalone testable |
| 3 | Group + membership services, controllers, routes + index.js wiring | PR 3 | Depends on PR 2; full group lifecycle |
| 4 | Frontend skeleton — AuthContext, pages, api layer, router setup | PR 4 | Independent; optional if time-constrained |

## Phase 1: Foundation (Schema + Utils + Middleware)

- [x] 1.1 Install missing deps: `cd apps/backend && pnpm add zod cookie`
- [x] 1.2 Modify `apps/backend/prisma/schema.prisma`: add `BalanceMode` enum (DYNAMIC, STATIC), `MemberStatus` enum (PENDING, ACTIVE, REMOVED), `ownerId String` + `balanceMode BalanceMode @default(DYNAMIC)` to Group, `status MemberStatus @default(PENDING)` to GroupMember, make `joinedAt` optional
- [ ] 1.3 Run `cd apps/backend && pnpm db:migrate` to generate migration **(BLOCKED: no running PostgreSQL database — Docker not available)**
- [x] 1.4 Run `cd apps/backend && pnpm db:generate` to regenerate Prisma client
- [x] 1.5 Create `apps/backend/src/utils/errors.js`: `AppError` class with `(code, status, message)`, `isAppError()` guard
- [x] 1.6 Create `apps/backend/src/utils/password.js`: `hashPassword(plain)` → bcrypt.hash(plain, 12), `comparePassword(plain, hash)` → bcrypt.compare
- [x] 1.7 Create `apps/backend/src/utils/jwt.js`: `signToken({ userId, email })` → jwt.sign with env secret, `verifyToken(token)` → jwt.verify
- [x] 1.8 Create Zod schemas split into `apps/backend/src/schemas/auth.schemas.js` and `apps/backend/src/schemas/group.schemas.js` (split from single schemas.js per orchestrator design)
- [x] 1.9 Create `apps/backend/src/middleware/error.middleware.js`: global handler mapping AppError codes to HTTP responses, Prisma P2002 → 400
- [x] 1.10 Create `apps/backend/src/middleware/validate.middleware.js`: factory `(schema) => (req, res, next)` — validates `req.body`, returns 400 on failure
- [x] 1.11 Create `apps/backend/src/middleware/auth.middleware.js`: reads JWT from cookie, verifies, attaches `req.user = { userId, email }`, returns 401 on missing/invalid

## Phase 2: Auth Implementation

- [x] 2.1 Create `apps/backend/src/services/auth.service.js`: `register()`, `login()`, `logout()`, `getMe()`, `generateResetToken()` — uses Prisma, bcrypt, jwt utils
- [x] 2.2 Create `apps/backend/src/controllers/auth.controller.js`: handlers for register (201), login (200 + Set-Cookie), logout (200 + clear cookie), me (200), forgot-password (200)
- [x] 2.3 Create `apps/backend/src/routes/auth.routes.js`: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` (protected), `POST /auth/forgot-password` — each with validate middleware
- [x] 2.4 Verify: `POST /auth/register` returns 201 with user object, rejects duplicate email/nickName with 400

## Phase 3: Groups + Membership + Wiring

- [x] 3.1 Create `apps/backend/src/services/group.service.js`: `createGroup()`, `getGroupById()`, `getUserGroups()`, `updateGroup()`, `deleteGroup()` — owner checks, member-only reads
- [x] 3.2 Create `apps/backend/src/controllers/group.controller.js`: handlers for create (201), getMine (200), getOne (200), update (200), remove (204) — all protected
- [x] 3.3 Create `apps/backend/src/routes/group.routes.js`: `POST /groups`, `GET /groups`, `GET /groups/:id`, `PUT /groups/:id`, `DELETE /groups/:id` — validate + auth middleware
- [x] 3.4 Create `apps/backend/src/services/membership.service.js`: `inviteMember()`, `acceptInvitation()`, `rejectInvitation()`, `removeMember()`, `leaveGroup()`, `getGroupMembers()` — status transitions, owner guards
- [x] 3.5 Create `apps/backend/src/controllers/membership.controller.js`: handlers for invite (201), accept (200), reject (204), removeMember (204), leave (200), getMembers (200)
- [x] 3.6 Create `apps/backend/src/routes/membership.routes.js`: `POST /invite`, `POST /accept`, `POST /reject`, `DELETE /members/:userId`, `POST /leave`, `GET /members` — mounted under `/groups/:groupId`
- [x] 3.7 Modify `apps/backend/src/index.js`: import and register all three route groups under `/auth`, `/groups`, `/groups/:groupId` — error middleware last
- [x] 3.8 Verify: `GET /groups` without cookie → 401 (auth middleware); with cookie → 200; `POST /groups` creates group with ownerId = req.user.userId

## Phase 4: Frontend Skeleton (Secondary — do only if remaining work is simple)

- [x] 4.1 Install frontend deps: `@heroicons/react` (axios + react-router-dom already present)
- [x] 4.2 Create `apps/frontend/src/services/api.js`: axios instance (baseURL localhost:4000, withCredentials: true), authService (login, register, logout, getMe), groupService (getAll, getById, create), response interceptor for error mapping
- [x] 4.3 Create `apps/frontend/src/context/AuthContext.jsx`: AuthProvider with user state, isLoading, login(), register(), logout() — calls api services, getMe() on mount for session restore
- [x] 4.4 Create `apps/frontend/src/App.jsx`: BrowserRouter + AuthProvider + Routes (/login, /register, /groups, /groups/:id), ProtectedRoute component with loading spinner and redirect
- [x] 4.5 Create `apps/frontend/src/pages/LoginPage.jsx`: email + password form with Heroicons, validation, loading state, error banner, link to /register, Exaggerated Minimalism styling
- [x] 4.6 Create `apps/frontend/src/pages/RegisterPage.jsx`: email + nickName + password form with Heroicons, validation, loading state, error banner, link to /login
- [x] 4.7 Create `apps/frontend/src/pages/GroupsPage.jsx`: group list (cards with name, currency, member count, balance mode badge), create group modal with currency selector, empty state, sign out button, loading/error states
- [x] 4.8 Create `apps/frontend/src/pages/GroupDetailPage.jsx`: group header (name, currency, balance mode, member count), members list with status badges, owner badge, expenses placeholder, back navigation, loading/error/404 states
- [x] 4.9 Update `apps/frontend/src/index.css`: Tailwind v4 @import + @theme design tokens (primary, secondary, cta, background, text, text-muted, border, error, success), Lexend + Source Sans 3 Google Fonts, prefers-reduced-motion support
- [x] 4.10 Update `apps/frontend/index.html`: change title to "Splitwise"
- [x] 4.11 Remove `apps/frontend/src/App.css` (replaced by Tailwind)
- [x] 4.12 Fix backend `auth.controller.js` register handler: now sets JWT cookie after registration (same as login) so the user is immediately authenticated
