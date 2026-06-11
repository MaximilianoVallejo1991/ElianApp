import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as closureController from '../controllers/closure.controller.js';

// ---------------------------------------------------------------------------
//  Closure Routes
// ---------------------------------------------------------------------------
//  Mounted under /groups/:groupId by index.js.
//  mergeParams: true gives access to req.params.groupId.
//
//  All routes require authentication and owner authorization (enforced in service).
// ---------------------------------------------------------------------------

const router = Router({ mergeParams: true });

// All routes protected
router.use(authenticate);

// POST /groups/:groupId/closure/start
// Start closure: OPEN → CLOSING (owner only)
router.post('/closure/start', closureController.start);

// POST /groups/:groupId/closure/complete
// Complete closure: CLOSING → CLOSED (owner only)
router.post('/closure/complete', closureController.complete);

// POST /groups/:groupId/closure/partial
// Partial closure: CLOSING → CLOSED + new OPEN period (owner only)
router.post('/closure/partial', closureController.partial);

// POST /groups/:groupId/closure/final
// Final closure: CLOSING → FINAL + group CLOSED (owner only)
router.post('/closure/final', closureController.final);

export default router;