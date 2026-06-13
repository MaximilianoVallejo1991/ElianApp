# ElianApp

A modern, full-stack expense splitting application built for groups. Whether you're splitting a dinner with friends, managing shared costs on a trip, or tracking household expenses with roommates, ElianApp makes it effortless to record who paid what, who owes whom, and settle up fairly.

Unlike simple calculators, ElianApp supports **collaborative expense reporting** — each participant can independently report their own items in a collective expense, and the system automatically validates that everything adds up before finalizing the split.

## Features

### Expense Splitting

- **Equal Split** — Divide a bill evenly among all participants. The system handles rounding automatically so no cents are lost.
- **Percentage Split** — Assign custom percentages to each participant. Perfect for when someone covered a larger share.
- **Collective Expenses** — The real power: one person records the total, then each participant reports their own individual items. The system locks the expense only when all items match the total, preventing mismatches before they affect balances.

### Group Management

- Create and manage multiple groups (trips, households, friend circles)
- Invite members via email with secure, expiring tokens
- Owner controls for editing group settings and deleting groups
- Configurable balance modes: **DYNAMIC** (live balances) or **STATIC** (period-based closures)

### Balances & Settlements

- Real-time balance calculation across all expense types
- Payment recording to track who settled whom
- Net balance view showing exactly who owes what
- Historical data preserved even after soft-deleting expenses

### User Experience

- Internationalization (i18n) with language switcher
- Responsive design with Tailwind CSS
- Protected routes and authentication via JWT + httpOnly cookies
- Email notifications via Resend

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
│   ├── frontend/          # React + Vite SPA
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── services/
│   │   │   ├── hooks/
│   │   │   ├── context/
│   │   │   └── i18n.js
│   │   └── package.json
│   └── backend/           # Express API
│       ├── src/
│       │   ├── controllers/
│       │   ├── services/
│       │   ├── routes/
│       │   ├── schemas/
│       │   └── middleware/
│       └── prisma/
│           └── schema.prisma
├── openspec/              # Specification docs
├── docker-compose.yaml
└── package.json
```

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 9+
- PostgreSQL (or use Docker)

### Installation

```bash
# Install dependencies
pnpm install

# Start local database
docker-compose up -d

# Run migrations
pnpm db:migrate

# Start development servers
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

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Login |
| POST | `/groups` | Create group |
| GET | `/groups` | List user's groups |
| POST | `/groups/:id/expenses` | Create expense |
| GET | `/groups/:id/balances` | Get group balances |
| POST | `/invites` | Invite member |

## Deployment

See [DEPLOY.md](./DEPLOY.md) for full deployment guide.

### Quick Deploy

1. **Supabase**: Create project, run `prisma migrate deploy`
2. **Render**: Deploy backend with environment variables
3. **Vercel**: Deploy frontend with `VITE_API_URL` pointing to Render

## Development

```bash
# Run tests
pnpm --filter frontend test
pnpm --filter backend test

# Database commands
pnpm db:migrate    # Run migrations
pnpm db:generate   # Generate Prisma client
pnpm db:push       # Push schema changes
```

## License

MIT
