import { z } from 'zod';
import { AppError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
//  Expense Schemas
// ---------------------------------------------------------------------------
//  Zod validation for expense and payment request bodies.
//  Business logic validations (sum checking) live in validateSplits().
// ---------------------------------------------------------------------------

/**
 * POST /groups/:groupId/expenses
 *
 * Required: amount (positive), description (non-empty), category (enum),
 *           payerId (CUID), splitType (enum), splits (array)
 *
 * For COLLECTIVE: splits not required, but sharedCosts and participantIds required.
 * For non-COLLECTIVE: splits required, sharedCosts/participantIds not used.
 *
 * Splits structure is validated but sums are NOT checked here —
 * that is done by `validateSplits()` in the service layer.
 */
export const createExpenseSchema = z.object({
  amount: z.number().positive('Amount must be a positive number'),
  description: z.string().min(1, 'Description is required'),
  category: z.enum(['FOOD', 'DRINKS', 'TRANSPORT', 'HOUSING', 'ENTERTAINMENT', 'GIFTS', 'OTHER'], {
    errorMap: () => ({
      message: 'Category must be FOOD, DRINKS, TRANSPORT, HOUSING, ENTERTAINMENT, GIFTS, or OTHER',
    }),
  }),
  payerId: z.string().min(1, 'Payer ID is required'),
  splitType: z.enum(['EQUAL', 'PERCENTAGE', 'COLLECTIVE'], {
    errorMap: () => ({
      message: 'Split type must be EQUAL, PERCENTAGE, or COLLECTIVE',
    }),
  }),
  date: z.string().datetime('Date must be a valid ISO datetime').optional(),
  // Splits required for EQUAL, PERCENTAGE; not used for COLLECTIVE
  splits: z
    .array(
      z.object({
        userId: z.string().min(1, 'User ID is required for each split'),
        amount: z.number().optional(),
        percentage: z.number().optional(),
      }),
    )
    .optional(),
  // COLLECTIVE-specific fields
  sharedCosts: z.number().min(0, 'Shared costs must be non-negative').optional(),
  participantIds: z.array(z.string()).optional(),
  // Optional items for atomic COLLECTIVE creation
  items: z
    .array(
      z.object({
        userId: z.string().min(1, 'User ID is required'),
        amount: z.number().min(0, 'Amount must be non-negative'),
        description: z.string().optional(),
      }),
    )
    .optional(),
});

/**
 * PUT /groups/:groupId/expenses/:id
 *
 * All fields optional (partial update).
 * For COLLECTIVE: sharedCosts and participantIds can be updated while PENDING.
 */
export const updateExpenseSchema = createExpenseSchema.partial();

/**
 * POST /groups/:groupId/expenses/:id/items
 *
 * Required: amount (can be 0)
 * Optional: description (defaults to "mi gasto")
 */
export const createItemSchema = z.object({
  amount: z.number().min(0, 'Amount must be non-negative'),
  description: z.string().optional(),
});

/**
 * PATCH /groups/:groupId/expenses/:id/items/:itemId
 *
 * All fields optional (partial update).
 */
export const updateItemSchema = z.object({
  amount: z.number().min(0, 'Amount must be non-negative').optional(),
  description: z.string().optional(),
});

/**
 * POST /groups/:groupId/payments
 *
 * Required: fromUserId, toUserId, amount (positive)
 * Optional: method, paidAt (ISO datetime)
 */
export const createPaymentSchema = z.object({
  fromUserId: z.string().min(1, 'Sender ID is required'),
  toUserId: z.string().min(1, 'Receiver ID is required'),
  amount: z.number().positive('Amount must be a positive number'),
  method: z.string().optional(),
  paidAt: z.string().datetime('paidAt must be a valid ISO datetime').optional(),
});

// ---------------------------------------------------------------------------
//  Split Validation Helper
// ---------------------------------------------------------------------------

/**
 * Validate that the provided splits match the expense amount and split type.
 *
 * Called by the service layer AFTER Zod has validated structure.
 * Throws AppError with code INVALID_SPLITS if the math doesn't add up.
 *
 * @param {number} totalAmount — the expense amount
 * @param {'EQUAL'|'PERCENTAGE'} splitType
 * @param {Array<{ userId: string, amount?: number, percentage?: number }>} splits
 * @throws {AppError} INVALID_SPLITS
 */
export function validateSplits(totalAmount, splitType, splits) {
  const epsilon = 0.01; // tolerance for floating-point rounding

  if (splitType === 'PERCENTAGE') {
    const sum = splits.reduce((acc, s) => acc + (s.percentage || 0), 0);
    if (Math.abs(sum - 100) > epsilon) {
      throw new AppError(
        'INVALID_SPLITS',
        400,
        'Split percentages must sum to 100',
      );
    }
  }
}
