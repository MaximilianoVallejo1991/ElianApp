# ElianApp — Split Expenses with Friends

A modern, full-stack expense splitting application for groups. Whether sharing a dinner, managing trip costs, or tracking household expenses, ElianApp handles who paid what, who owes whom, and settling up.

The key differentiator: **collaborative expense reporting** — each participant can independently report their own items in a collective expense, and the system validates that everything adds up before finalizing the split.

## Features

### Split Types

- **Equal** — Divide evenly among participants. Rounding is handled automatically.
- **Percentage** — Assign custom percentages to each participant.
- **Collective** — One person records the total; each participant reports their own individual items. The expense locks only when all items match the total, preventing balance mismatches.

### Group Management

- Create and manage multiple groups (trips, households, circles)
- Invite members via email with expiring secure tokens
- Owner controls for group settings, member management, and deletion
- **Balance modes**: `DYNAMIC` (live balances) or `STATIC` (period-based closures)

### Balances & Settlements

- Real-time net balance per participant
- Payment recording with PENDING / ACCEPTED / REJECTED workflow
- Settlement computation showing exactly who owes whom
- Historical data preserved after soft-deleting expenses

### Periods & Closures (STATIC mode)

- Period-based expense tracking for monthly or trip-based accounting
- Closing workflow: OPEN → CLOSING → CLOSED → FINAL
- All expenses and payments are locked once a period is closed

### User Experience

- i18n with language switcher (English / Spanish)
- PWA support — installable on mobile and desktop
- Responsive design with Tailwind CSS
- JWT authentication via httpOnly cookies
- Password reset flow with email notifications via Resend

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, Vite 8, Tailwind CSS 4, React Router 7 |
| **Backend** | Node.js, Express 5, Prisma 7 (PostgreSQL) |
| **Database** | PostgreSQL 16 (Supabase) |
| **Deployment** | Vercel (frontend), Render (backend), Supabase (DB) |

## Project Structure

```
ElianApp/
├── apps/
│   ├── frontend/                    # React + Vite SPA
│   │   ├── src/
│   │   │   ├── components/          # UI components (ExpenseForm, PaymentForm, etc.)
│   │   │   ├── pages/               # Route pages (Groups, GroupDetail, Login, etc.)
│   │   │   ├── context/             # AuthContext (AuthProvider)
│   │   │   ├── hooks/               # useAuth
│   │   │   ├── services/            # API client (axios)
│   │   │   ├── utils/               # Settlement/split calculation logic
│   │   │   ├── locales/             # i18n translations (en.json, es.json)
│   │   │   └── i18n.js              # i18next configuration
│   │   └── public/
│   │       └── manifest.json        # PWA manifest
│   │
│   └── backend/                     # Express API
│       ├── src/
│       │   ├── controllers/         # Route handlers (auth, expense, group, etc.)
│       │   ├── services/            # Business logic (auth, expense, balance, closure, etc.)
│       │   ├── routes/              # Express route definitions
│       │   ├── schemas/             # Zod validation schemas
│       │   ├── middleware/          # Auth, validation, error handling
│       │   └── lib/                 # Prisma client, email (Resend)
│       └── prisma/
│           └── schema.prisma        # Database schema
│
├── packages/
│   └── shared/                      # Shared types and utilities (work in progress)
│
├── openspec/                        # Specification docs (SDD artifacts)
├── docker-compose.yaml              # Local PostgreSQL
├── pnpm-workspace.yaml
└── package.json
```

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 9+
- PostgreSQL (or use Docker with the provided `docker-compose.yaml`)

### Installation

```bash
# Install dependencies
pnpm install

# Start local database (port 5433 to avoid conflicts)
docker-compose up -d

# Run migrations
pnpm db:migrate

# Generate Prisma client
pnpm db:generate

# Start development servers (frontend + backend concurrently)
pnpm dev
```

### Environment Variables

**Backend** (`apps/backend/.env`):

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/splitwise
JWT_SECRET=your-secret-key
CORS_ORIGIN=http://localhost:5173
FRONTEND_URL=http://localhost:5173
RESEND_API_KEY=re_...
EMAIL_FROM="ElianApp <noreply@your-domain.com>"
```

**Frontend** (`apps/frontend/.env`):

```env
VITE_API_URL=http://localhost:4000
```

### Quick Start

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all dev servers |
| `pnpm build` | Build all packages |
| `pnpm db:migrate` | Run Prisma migrations |
| `pnpm db:generate` | Generate Prisma client |
| `pnpm db:push` | Push schema to database |

## API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register a new user |
| POST | `/auth/login` | Log in |
| POST | `/auth/logout` | Log out |
| POST | `/auth/forgot-password` | Request password reset |
| POST | `/auth/reset-password` | Reset password with token |
| GET | `/auth/me` | Get current user |
| GET/POST | `/groups` | List / Create groups |
| GET/PUT/DELETE | `/groups/:id` | Get / Update / Delete group |
| POST | `/groups/:id/invites` | Invite a member |
| GET | `/groups/:id/members` | List members |
| PUT | `/groups/:id/members/:userId` | Update member status |
| DELETE | `/groups/:id/members/:userId` | Remove member |
| GET/POST | `/groups/:id/expenses` | List / Create expenses |
| GET/PUT/DELETE | `/groups/:id/expenses/:expenseId` | Get / Update / Delete expense |
| POST | `/groups/:id/expenses/:expenseId/items` | Report an expense item |
| GET | `/groups/:id/balances` | Get group balances |
| GET/POST | `/groups/:id/payments` | List / Record payments |
| PUT | `/groups/:id/payments/:paymentId` | Accept / Reject payment |
| GET/POST | `/groups/:id/periods` | List / Create periods |
| POST | `/groups/:id/periods/:periodId/close` | Close a period |
| POST | `/groups/:id/closure` | Compute settlement for a period |

See [DEPLOY.md](./DEPLOY.md) for the full deployment guide.

## Development

```bash
# Run tests
pnpm --filter frontend test
pnpm --filter backend test

# Test with coverage
pnpm --filter frontend test -- --coverage
pnpm --filter backend test -- --coverage

# Lint
pnpm --filter frontend lint
```

## License

MIT

