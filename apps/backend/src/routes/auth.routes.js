import { Router } from 'express';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../schemas/auth.schemas.js';
import * as authController from '../controllers/auth.controller.js';

// ---------------------------------------------------------------------------
//  Auth Routes
// ---------------------------------------------------------------------------
//  All routes are mounted under /auth by index.js.
//
//  Middleware order: validate (body) → authenticate (JWT cookie) → handler
//  Only /me is protected; register/login/forgot-password are public.
// ---------------------------------------------------------------------------

const router = Router();

// --- Public -----------------------------------------------------------------

// POST /auth/register
router.post('/register', validate(registerSchema), authController.register);

// POST /auth/login
router.post('/login', validate(loginSchema), authController.login);

// POST /auth/logout
router.post('/logout', authController.logout);

// POST /auth/forgot-password
router.post(
  '/forgot-password',
  validate(forgotPasswordSchema),
  authController.forgotPassword,
);

// POST /auth/reset-password
// Resets password using a valid token from email link.
router.post(
  '/reset-password',
  validate(resetPasswordSchema),
  authController.resetPassword,
);

// --- Protected --------------------------------------------------------------

// GET /auth/me
router.get('/me', authenticate, authController.me);

export default router;
