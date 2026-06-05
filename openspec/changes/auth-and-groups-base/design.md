# Design: auth-and-groups-base

## Technical Approach

Implement auth (register/login/logout/JWT) and group management (CRUD + membership lifecycle) on Express + Prisma with ESM. Routes → Controllers → Services → Prisma, with Zod validation at the boundary and httpOnly JWT cookie for auth.

## Architecture Decisions

### Decision: GroupMember Status Field

**Choice**: Add `status` enum (`PENDING`, `ACTIVE`) to `GroupMember` model
**Alternatives considered**: Use `joinedAt = null` for pending; add role field only
**Rationale**: Pending vs active is a first-class business concept in this app. `joinedAt = null` is ambiguous (does null mean "never tried to join" or "invited but not accepted"?). Status enum makes queries explicit: `where: { status: 'PENDING' }`. Role (owner/member) is separate — owner is determined by `Group.ownerId`, not membership role.

### Decision: Group.ownerId Instead of GroupMember Role

**Choice**: Add `ownerId` field to `Group` model
**Alternatives considered**: Infer owner from GroupMember with `role: OWNER`; check "first member" on create
**Rationale**: Simpler permission checks: `if (group.ownerId !== req.user.userId) return 403`. Avoids scanning GroupMember for role. Single source of truth for ownership.

### Decision: Separate Membership Routes (Not Nested Under /members)

**Choice**: `POST /groups/:groupId/invite`, `POST /groups/:groupId/accept`, `POST /groups/:groupId/reject`, `DELETE /groups/:groupId/members/:userId`, `POST /groups/:groupId/leave`
**Alternatives considered**: `POST /groups/:groupId/members` with action in body; RESTful nested resource only
**Rationale**: Spec explicitly lists these as separate endpoints. Invites are actions, not just membership creation. Accept/reject are idempotent-ish actions best expressed as dedicated routes.

### Decision: JWT Payload = `{ userId, email }`

**Choice**: Store `userId` and `email` in JWT payload
**Alternatives considered**: Store only `userId`, fetch email from DB on each request
**Rationale**: Minimizes DB roundtrips for common user-info lookups. Email rarely changes; when it does, re-login is acceptable.

## Data Flow

```
Request → validate.middleware (Zod) → auth.middleware (JWT cookie)
    → Controller → Service → Prisma → DB
    ↓
error.middleware → { error, code }
```

```
POST /auth/register
  body: { email, nickName, password }
  → validate(registerSchema)
  → authService.register({ email, nickName, password })
    → check email uniqueness → check nickName uniqueness
    → bcrypt.hash(password, 12)
    → prisma.user.create()
  → 201 { id, email, nickName }

POST /auth/login
  body: { email, password }
  → validate(loginSchema)
  → authService.login({ email, password })
    → prisma.user.findUnique({ where: { email } })
    → bcrypt.compare(password, hashedPassword)
    → jwt.sign({ userId, email })
  → Set-Cookie: httpOnly JWT
  → 200 { id, email, nickName }

POST /groups
  body: { name, currency, balanceMode }
  → authenticate middleware → req.user
  → validate(groupSchema)
  → groupService.create({ name, currency, balanceMode, ownerId: userId })
    → prisma.group.create({ data: { name, currency, balanceMode, ownerId } })
    → prisma.groupMember.create({ data: { groupId, userId, status: 'ACTIVE' } })
  → 201 { id, name, currency, balanceMode, ownerId }

POST /groups/:groupId/invite
  body: { email } or { nickName }
  → authenticate → groupService.invite(groupId, invitedByUserId, { email?, nickName? })
    → lookup target user by email or nickName
    → check not already member (status ACTIVE)
    → prisma.groupMember.create({ data: { groupId, userId, status: 'PENDING' } })
  → 201 { userId, groupId, status: 'PENDING' }

POST /groups/:groupId/accept
  → authenticate → membershipService.accept(groupId, userId)
    → prisma.groupMember.update({ where: { groupId_userId }, data: { status: 'ACTIVE', joinedAt: now() } })
  → 200 { ...updated }

POST /groups/:groupId/reject
  → authenticate → membershipService.reject(groupId, userId)
    → prisma.groupMember.delete({ where: { groupId_userId } })
  → 200
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/backend/prisma/schema.prisma` | Modify | Add `balanceMode` enum, `ownerId` and `balanceMode` to Group, `status` enum and field to GroupMember |
| `apps/backend/src/routes/auth.routes.js` | Create | POST /auth/register, /login, /logout, GET /me, POST /forgot-password |
| `apps/backend/src/routes/group.routes.js` | Create | POST/GET /groups, GET/PUT/DELETE /groups/:id |
| `apps/backend/src/routes/membership.routes.js` | Create | POST /invite, /accept, /reject, DELETE /members/:userId, POST /leave |
| `apps/backend/src/controllers/auth.controller.js` | Create | Request/response for auth routes |
| `apps/backend/src/controllers/group.controller.js` | Create | Request/response for group routes |
| `apps/backend/src/controllers/membership.controller.js` | Create | Request/response for membership routes |
| `apps/backend/src/services/auth.service.js` | Create | register, login, logout, generateResetToken |
| `apps/backend/src/services/group.service.js` | Create | create, findAll, findById, update, delete |
| `apps/backend/src/services/membership.service.js` | Create | invite, accept, reject, remove, leave |
| `apps/backend/src/middleware/auth.middleware.js` | Create | Verify JWT cookie, attach req.user |
| `apps/backend/src/middleware/error.middleware.js` | Create | Global error handler with code mapping |
| `apps/backend/src/middleware/validate.middleware.js` | Create | Zod schema validation wrapper |
| `apps/backend/src/utils/jwt.js` | Create | jwt.sign, jwt.verify helpers |
| `apps/backend/src/utils/password.js` | Create | bcrypt hash/compare helpers |
| `apps/backend/src/utils/errors.js` | Create | AppError class and error codes |
| `apps/backend/src/utils/schemas.js` | Create | All Zod schemas (register, login, group, membership) |
| `apps/backend/src/index.js` | Modify | Register routes and middleware |
| `apps/frontend/src/context/AuthContext.tsx` | Create | Auth state context |
| `apps/frontend/src/api/auth.ts` | Create | Auth API client |
| `apps/frontend/src/api/groups.ts` | Create | Groups API client |
| `apps/frontend/src/pages/Auth.tsx` | Create | Login/register skeleton |
| `apps/frontend/src/pages/Groups.tsx` | Create | Groups skeleton |

## Interfaces / Contracts

### Auth Routes

```
POST /auth/register
  Request:  { email: string, nickName: string, password: string }
  Response: 201 { id, email, nickName }
  Errors:    400 EMAIL_EXISTS | NICKNAME_EXISTS

POST /auth/login
  Request:  { email: string, password: string }
  Response: 200 { id, email, nickName } + Set-Cookie: httpOnly JWT
  Errors:   401 INVALID_CREDENTIALS

POST /auth/logout
  Response: 200 + Clear cookie

GET /auth/me
  Response: 200 { id, email, nickName }
  Errors:   401 UNAUTHORIZED

POST /auth/forgot-password
  Request:  { email: string }
  Response: 200 (token stored, not returned)
```

### Group Routes

```
POST /groups
  Request:  { name: string, currency: string, balanceMode: "DYNAMIC"|"STATIC" }
  Response: 201 { id, name, currency, balanceMode, ownerId }

GET /groups
  Response: 200 [{ id, name, currency, balanceMode }]

GET /groups/:id
  Response: 200 { id, name, currency, balanceMode, ownerId, members: [...] }
  Errors:   404 NOT_FOUND | NOT_MEMBER

PUT /groups/:id
  Request:  { name?: string, currency?: string, balanceMode?: "DYNAMIC"|"STATIC" }
  Response: 200 { updated group }
  Errors:   403 FORBIDDEN (non-owner)

DELETE /groups/:id
  Response: 200
  Errors:   403 FORBIDDEN (non-owner)
```

### Membership Routes

```
POST /groups/:groupId/invite
  Request:  { email: string } or { nickName: string }
  Response: 201 { userId, groupId, status: "PENDING" }
  Errors:   400 ALREADY_MEMBER | 403 FORBIDDEN | 404 USER_NOT_FOUND

POST /groups/:groupId/accept
  Response: 200 { userId, groupId, status: "ACTIVE", joinedAt }
  Errors:   404 NOT_PENDING

POST /groups/:groupId/reject
  Response: 200
  Errors:   404 NOT_PENDING

DELETE /groups/:groupId/members/:userId
  Response: 200
  Errors:   400 CANNOT_REMOVE_OWNER | 403 FORBIDDEN (non-owner)

POST /groups/:groupId/leave
  Response: 200
  Errors:   400 CANNOT_LEAVE_AS_OWNER
```

## Zod Schema Exports

All schemas live in `apps/backend/src/utils/schemas.js` and are imported by both routes and tests:

```javascript
// Auth
export const registerSchema = z.object({ email, nickName, password })
export const loginSchema = z.object({ email, password })
export const forgotPasswordSchema = z.object({ email })

// Group
export const createGroupSchema = z.object({ name, currency, balanceMode })
export const updateGroupSchema = z.object({ name, currency, balanceMode }).partial()

// Membership
export const inviteSchema = z.object({ email: z.string().email() }).or(
  z.object({ nickName: z.string() })
)
```

## Error Handling Strategy

- `AppError(code, status, message)` — custom error class in `utils/errors.js`
- All errors caught by `error.middleware` → `res.status(status).json({ error: message, code })`
- Codes: `EMAIL_EXISTS`, `NICKNAME_EXISTS`, `INVALID_CREDENTIALS`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `NOT_MEMBER`, `ALREADY_MEMBER`, `USER_NOT_FOUND`, `NOT_PENDING`, `CANNOT_REMOVE_OWNER`, `CANNOT_LEAVE_AS_OWNER`
- Prisma errors mapped to app codes: `P2002` → 400 `EMAIL_EXISTS`/`NICKNAME_EXISTS`

## Migration / Rollout

Schema changes required:
1. Add `balanceMode` enum to schema
2. Add `ownerId` String field to `Group`
3. Add `status` enum to schema
4. Add `status` field to `GroupMember` with default `'ACTIVE'`
5. Set `joinedAt` to optional (null for PENDING)

Migration: `prisma migrate dev` creates initial auth/groups migration.

## Open Questions

- [ ] Should password reset token expiry be stored? (Yes — add `passwordResetExpires` DateTime to User)
- [ ] Frontend skeleton scope — should it include routing setup (react-router)? (Yes, minimal)