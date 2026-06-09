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


const app = express();

// --- Global middleware -------------------------------------------------------
app.use(cors({
  origin: process.env.CORS_ORIGIN,
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
app.use('/groups/:groupId', inviteRoutes);

// --- Error handler (MUST be last) --------------------------------------------
app.use(errorHandler);

// --- Start -------------------------------------------------------------------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
