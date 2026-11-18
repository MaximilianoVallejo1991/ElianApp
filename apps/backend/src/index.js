import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import 'dotenv/config';

import prisma from './lib/prisma.js';
import { errorHandler } from './middleware/error.middleware.js';
import authRoutes from './routes/auth.routes.js';
import groupRoutes from './routes/group.routes.js';
import membershipRoutes from './routes/membership.routes.js';
import expenseRoutes from './routes/expense.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import inviteRoutes from './routes/invite.routes.js';
import closureRoutes from './routes/closure.routes.js';
import periodRoutes from './routes/period.routes.js';
import { cleanupExpiredInviteTokens } from './services/invite.service.js';


const app = express();

// --- Global middleware -------------------------------------------------------
// CORS_ORIGIN soporta una lista separada por comas (ej. el dominio de Vercel
// + un dominio custom) — un string simple en `origin` hace que `cors` devuelva
// siempre ese mismo valor fijo sin comparar contra el Origin real del request,
// lo que bloquea cualquier otro origen aunque esté "permitido" de palabra.
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// --- Health check ------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// --- Route groups ------------------------------------------------------------
app.use('/auth', authRoutes);
app.use('/groups', groupRoutes);

// Mount specific paths BEFORE generic /groups/:groupId to avoid route capture
app.use('/invites', inviteRoutes);

// Generic group sub-routes (order matters — more specific paths first)
app.use('/groups/:groupId', membershipRoutes);
app.use('/groups/:groupId', expenseRoutes);
app.use('/groups/:groupId', paymentRoutes);
app.use('/groups/:groupId', closureRoutes);
app.use('/groups/:groupId', periodRoutes);
app.use('/groups/:groupId', inviteRoutes);

// --- Error handler (MUST be last) --------------------------------------------
app.use(errorHandler);

// --- Cleanup expired invite tokens on startup ---------------------------------
const cleaned = await cleanupExpiredInviteTokens();
if (cleaned > 0) {
  console.log(`Cleaned up ${cleaned} expired invite token(s)`);
}

// --- Start -------------------------------------------------------------------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
