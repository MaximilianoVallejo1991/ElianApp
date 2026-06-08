# Verification Report: auth-and-groups-base

**Change**: auth-and-groups-base
**Version**: N/A
**Mode**: Standard (no TDD — no test runner configured)

---

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 28 |
| Tasks complete | 28 |
| Tasks incomplete | 0 |

---

## Build & Tests Execution

**Backend**: ➖ No build command — server runs successfully via `node src/index.js`
**Frontend Build**: ✅ Passed
```text
> frontend@0.0.0 build
> vite build

vite v8.0.16 building client environment for production...
transforming...✓ 407 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.43 kB │ gzip:  0.29 kB
dist/assets/index-78JlxoMi.css   25.46 kB │ gzip:  5.34 kB
dist/assets/index-DixCNDJO.js   303.32 kB │ gzip: 95.77 kB

✓ built in 466ms
```

**Tests**: ➖ Not available — no test files found in backend or frontend
**Coverage**: ➖ Not available — no coverage tool configured

**Frontend Linter**: ❌ 4 errors, 1 warning
```text
C:\...\frontend\src\context\AuthContext.jsx
  23:5   error  Calling setState synchronously within an effect can trigger cascading renders
  50:17  error  Fast refresh only works when a file only exports components

C:\...\frontend\src\pages\GroupDetailPage.jsx
  32:5  error    Cannot access variable before it is declared (loadGroup)
  33:6  warning  React Hook useEffect has a missing dependency: 'loadGroup'

C:\...\frontend\src\pages\GroupsPage.jsx
  29:5  error    Cannot access variable before it is declared (loadGroups)
```

---

## Spec Compliance Matrix

### User Authentication

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| User Registration | Successful registration | `POST /auth/register` | ✅ COMPLIANT |
| User Registration | Email already exists | `POST /auth/register` (duplicate) | ✅ COMPLIANT |
| User Registration | nickName already exists | `POST /auth/register` (duplicate nick) | ✅ COMPLIANT |
| User Login | Successful login | `POST /auth/login` | ✅ COMPLIANT |
| User Login | Invalid password | `POST /auth/login` (wrong pass) | ✅ COMPLIANT |
| User Login | Non-existent user | `POST /auth/login` (unknown email) | ✅ COMPLIANT |
| User Logout | Successful logout | `POST /auth/logout` | ✅ COMPLIANT |
| Protected Route Access | Missing cookie | `GET /groups` (no auth) | ✅ COMPLIANT |
| Protected Route Access | Valid cookie | `GET /groups` (with auth) | ✅ COMPLIANT |
| Protected Route Access | Expired/invalid cookie | `GET /groups` (bad token) | ✅ COMPLIANT |
| Password Reset Token | Generate reset token | `POST /auth/forgot-password` | ✅ COMPLIANT (path: `/auth/forgot-password` instead of `/auth/password-reset`) |

### Group Management

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Create Group | Successful creation | `POST /groups` | ✅ COMPLIANT |
| Create Group | Missing required fields | `POST /groups` (incomplete) | ✅ COMPLIANT (Zod validation returns 400) |
| Edit Group | Owner edits group | `PUT /groups/:id` | ✅ COMPLIANT |
| Edit Group | Non-owner edits group | `PUT /groups/:id` (non-owner) | ✅ COMPLIANT |
| Delete Group | Owner deletes group | `DELETE /groups/:id` | ✅ COMPLIANT (returns 204 instead of spec's 200) |
| Delete Group | Non-owner deletes group | `DELETE /groups/:id` (non-owner) | ✅ COMPLIANT |
| Get Group Details | Member views group | `GET /groups/:id` | ✅ COMPLIANT |
| Get Group Details | Non-member views group | `GET /groups/:id` (non-member) | ✅ COMPLIANT |
| List User's Groups | List groups | `GET /groups` | ✅ COMPLIANT |

### Group Membership

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Invite User | Owner invites by email | `POST /groups/:id/invite` | ✅ COMPLIANT (path: `/groups/:id/invite` instead of `/groups/:id/members`) |
| Invite User | Owner invites by nickName | `POST /groups/:id/invite` (nick) | ✅ COMPLIANT |
| Invite User | Invite existing member | `POST /groups/:id/invite` (already member) | ✅ COMPLIANT |
| Invite User | Invite non-existent user | `POST /groups/:id/invite` (unknown) | ✅ COMPLIANT |
| Invite User | Non-owner invites | `POST /groups/:id/invite` (non-owner) | ✅ COMPLIANT |
| Accept Invitation | Accept invitation | `POST /groups/:id/accept` | ✅ COMPLIANT (path: `/groups/:id/accept` instead of `/groups/:id/members/accept`) |
| Reject Invitation | Reject invitation | `POST /groups/:id/reject` | ✅ COMPLIANT (returns 204 instead of spec's 200; path: `/groups/:id/reject` instead of `/groups/:id/members/reject`) |
| Remove Member | Owner removes member | `DELETE /groups/:id/members/:userId` | ✅ COMPLIANT (returns 204 instead of spec's 200) |
| Remove Member | Owner removes self | `DELETE /groups/:id/members/:ownerId` | ✅ COMPLIANT |
| Remove Member | Non-owner removes member | `DELETE /groups/:id/members/:userId` (non-owner) | ✅ COMPLIANT |
| Leave Group | Member leaves | `POST /groups/:id/leave` | ✅ COMPLIANT (path: `/groups/:id/leave` instead of `/groups/:id/members/leave`) |
| Leave Group | Owner leaves | `POST /groups/:id/leave` (owner) | ✅ COMPLIANT |

**Compliance summary**: 24/24 scenarios compliant (manually verified via API calls)

---

## Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| Prisma schema with BalanceMode, MemberStatus, ownerId, balanceMode | ✅ Implemented | Migration `add_owner_balance_status` applied |
| AppError class with codes | ✅ Implemented | `apps/backend/src/utils/errors.js` |
| bcrypt hash with cost 12 | ✅ Implemented | `apps/backend/src/utils/password.js` |
| JWT sign/verify with 7-day expiry | ✅ Implemented | `apps/backend/src/utils/jwt.js` |
| Zod validation middleware | ✅ Implemented | `apps/backend/src/middleware/validate.middleware.js` |
| Auth middleware (cookie-based) | ✅ Implemented | `apps/backend/src/middleware/auth.middleware.js` |
| Error middleware with P2002 mapping | ✅ Implemented | `apps/backend/src/middleware/error.middleware.js` |
| Auth routes (register/login/logout/me/forgot-password) | ✅ Implemented | `apps/backend/src/routes/auth.routes.js` |
| Group routes (CRUD) | ✅ Implemented | `apps/backend/src/routes/group.routes.js` |
| Membership routes (invite/accept/reject/remove/leave) | ✅ Implemented | `apps/backend/src/routes/membership.routes.js` |
| AuthContext with session restore | ✅ Implemented | `apps/frontend/src/context/AuthContext.jsx` |
| ProtectedRoute with redirect | ✅ Implemented | `apps/frontend/src/App.jsx` |
| Login/Register pages with Heroicons | ✅ Implemented | `apps/frontend/src/pages/LoginPage.jsx`, `RegisterPage.jsx` |
| Groups page with create modal | ✅ Implemented | `apps/frontend/src/pages/GroupsPage.jsx` |
| Group detail page with members | ✅ Implemented | `apps/frontend/src/pages/GroupDetailPage.jsx` |
| Tailwind v4 styling with design tokens | ✅ Implemented | `apps/frontend/src/index.css` |
| CORS configured with CORS_ORIGIN | ✅ Implemented | `apps/backend/src/index.js` |
| Remove old App.css | ✅ Implemented | File deleted |

---

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| GroupMember Status enum | ✅ Yes | `PENDING`/`ACTIVE`/`REMOVED` |
| Group.ownerId for ownership | ✅ Yes | `ownerId` field on Group model |
| Separate membership routes | ✅ Yes | Mounted under `/groups/:groupId` |
| JWT payload = { userId, email } | ✅ Yes | Signed with 7-day expiry |
| Schema split into auth.schemas.js + group.schemas.js | ✅ Yes | Per orchestrator direction |
| Register sets JWT cookie | ✅ Yes | Added in task 4.12 |
| Frontend: no TypeScript, .jsx files | ✅ Yes | Matches project convention |

---

## Issues Found

### CRITICAL

1. **Frontend index.html title not updated to "Splitwise"**  
   Task 4.10 requires: "Update `apps/frontend/index.html`: change title to 'Splitwise'".  
   Current file still shows `<title>ElianApp</title>` (line 8).  
   **Impact**: Product branding is wrong; task requirement is not met.

2. **Frontend lint errors prevent `pnpm run lint` from passing**  
   `apps/frontend/src/context/AuthContext.jsx` — `setState` called directly in effect body (line 23).  
   `apps/frontend/src/pages/GroupDetailPage.jsx` — `loadGroup` accessed before declaration (line 32).  
   `apps/frontend/src/pages/GroupsPage.jsx` — `loadGroups` accessed before declaration (line 29).  
   **Impact**: CI lint gate will fail; code smells indicate potential React lifecycle bugs.

### WARNING

3. **No automated tests exist**  
   No `.test.js` or `.test.jsx` files found in backend or frontend.  
   **Impact**: Manual verification only; regressions cannot be caught automatically.

4. **Membership endpoint paths deviate from spec**  
   Spec says `POST /groups/:groupId/members` for invite; implementation uses `/groups/:groupId/invite`.  
   Spec says `POST /groups/:groupId/members/accept`; implementation uses `/groups/:groupId/accept`.  
   Spec says `POST /groups/:groupId/members/reject`; implementation uses `/groups/:groupId/reject`.  
   Spec says `DELETE /groups/:groupId/members/leave`; implementation uses `POST /groups/:groupId/leave`.  
   **Impact**: API contract divergence; consumers expecting spec paths will fail.

5. **Status code deviations from spec**  
   `DELETE /groups/:id` returns 204 (spec says 200).  
   `DELETE /groups/:id/members/:userId` returns 204 (spec says 200).  
   `POST /groups/:id/reject` returns 204 (spec says 200).  
   **Impact**: Minor contract mismatch; frontends expecting 200 may not handle 204 correctly.

6. **Forgot-password endpoint path deviates from spec**  
   Spec says `POST /auth/password-reset`; implementation uses `POST /auth/forgot-password`.  
   **Impact**: Minor contract mismatch.

7. **Backend does not have a linter configured**  
   No ESLint or similar tool configured for backend code.  
   **Impact**: Code quality cannot be enforced for backend.

### SUGGESTION

8. **Add `passwordResetExpires` field to User model**  
   Design.md open question: "Should password reset token expiry be stored? (Yes)".  
   Currently only `passwordResetToken` exists; no expiry field.  
   **Impact**: Security — tokens never expire.

9. **Add `@heroicons/react` to `apps/frontend/package.json` devDependencies check**  
   Already installed (v2.2.0). No issue.

10. **Add `db:migrate` script to backend package.json**  
   Already exists (`"db:migrate": "prisma migrate dev"`). No issue.

---

## Verdict

**FAIL**

The backend API is fully functional and all spec scenarios pass when tested manually. However, the frontend has **CRITICAL** issues that block a clean pass:

1. The `index.html` title was **not** updated to "Splitwise" as required by task 4.10 (still shows "ElianApp").
2. Frontend ESLint fails with 4 errors (including `setState` in effect and hoisted-function references), which will block CI/CD gates.

Additionally, **WARNING**-level issues include missing automated tests, API endpoint path deviations from the spec, and status code mismatches.

**Recommendation**: Fix the two CRITICAL frontend issues (update `index.html` title and resolve lint errors), then add at least one integration test for the auth flow. Re-run verification.
