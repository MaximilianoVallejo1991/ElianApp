# Deployment Guide

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Vercel   │────▶│   Render    │────▶│  Supabase  │
│  Frontend  │     │   Backend   │     │  PostgreSQL │
│  React+Vite│     │  Express+Node│     │            │
└─────────────┘     └──────────────┘     └─────────────┘
```

---

## 1. Supabase (Database)

1. Create project at [supabase.com](https://supabase.com)
2. Go to **Settings → Database → Connection string**
3. Copy the **URI** (use `transaction` mode for Render serverless)

Your URI looks like:
```
postgresql://postgres.xxxx:your_password@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

### Run migrations

From your local machine (once):

```bash
cd apps/backend
npx prisma migrate deploy
```

> If you never created migrations: `npx prisma migrate dev --name init` first, then `npx prisma migrate deploy`.

---

## 2. Render (Backend)

1. Create a new **Web Service** at [render.com](https://render.com)
2. Connect your GitHub repo

### Configuration

| Field | Value |
|-------|-------|
| **Root Directory** | `apps/backend` |
| **Build Command** | `cd ../.. && pnpm install --filter @splitwise/backend... && pnpm --filter @splitwise/backend exec prisma generate` |
| **Start Command** | `node src/index.js` |
| **Node Version** | 18+ |

### Environment Variables

```env
DATABASE_URL=postgresql://postgres.xxxx:your_password@aws-0-us-east-1.pooler.supabase.com:6543/postgres
JWT_SECRET=your-long-random-secret-here
CORS_ORIGIN=https://your-app.vercel.app
FRONTEND_URL=https://your-app.vercel.app
NODE_ENV=production
RESEND_API_KEY=re_...  # from https://resend.com
EMAIL_FROM="ElianApp <noreply@your-domain.com>"
```

> Render provides `PORT` automatically. Your code already handles `process.env.PORT || 4000`.

---

## 3. Vercel (Frontend)

1. Create a new project at [vercel.com](https://vercel.com)
2. Import your GitHub repo

### Configuration

| Field | Value |
|-------|-------|
| **Framework Preset** | Vite |
| **Root Directory** | `apps/frontend` |
| **Build Command** | `cd ../.. && pnpm install --filter frontend... && pnpm --filter frontend run build` |
| **Output Directory** | `dist` |

### Environment Variables

```env
VITE_API_URL=https://your-backend.onrender.com
```

---

## Monorepo Note

The project uses **pnpm workspaces**. Both Vercel and Render need the `--filter` flag to install only the relevant package:

- `--filter @splitwise/backend...` installs backend + workspace dependencies
- `--filter frontend...` installs frontend + workspace dependencies

---

## Post-Deploy Checklist

1. **Supabase** → migrations applied (`prisma migrate deploy`)
2. **Render** → `/health` returns `{"status":"ok"}`
3. **Vercel** → frontend loads and `VITE_API_URL` points to correct Render URL
4. **CORS** → `CORS_ORIGIN` in Render points exactly to your Vercel URL (no trailing `/`)
5. **Cookies** → if using httpOnly cookies, both services must be on HTTPS (default on both platforms)

---

## Useful Commands

```bash
# Local development
pnpm dev

# Database migrations (local)
cd apps/backend
npx prisma migrate dev --name migration_name
npx prisma db push

# Generate Prisma client
cd apps/backend
npx prisma generate

# Build frontend locally
cd apps/frontend
pnpm build
```
