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
 * Splits structure is validated but sums are NOT checked here —
 * that is done by `validateSplits()` in the service layer.
 */
export const createExpenseSchema = z.object({
  amount: z.number().positive('Amount must be a positive number'),
  description: z.string().min(1, 'Description is required'),
  category: z.enum(['FOOD', 'TRANSPORT', 'HOUSING', 'ENTERTAINMENT', 'OTHER'], {
    errorMap: () => ({
      message: 'Category must be FOOD, TRANSPORT, HOUSING, ENTERTAINMENT, or OTHER',
    }),
  }),
  payerId: z.string().min(1, 'Payer ID is required'),
  splitType: z.enum(['EQUAL', 'EXACT', 'PERCENTAGE'], {
    errorMap: () => ({
      message: 'Split type must be EQUAL, EXACT, or PERCENTAGE',
    }),
  }),
  splits: z
    .array(
      z.object({
        userId: z.string().min(1, 'User ID is required for each split'),
        amount: z.number().optional(),
        percentage: z.number().optional(),
      }),
    )
    .min(1, 'At least one split entry is required'),
});

/**
 * PUT /groups/:groupId/expenses/:id
 *
 * All fields optional (partial update).
 */
export const updateExpenseSchema = createExpenseSchema.partial();

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
 * @param {'EQUAL'|'EXACT'|'PERCENTAGE'} splitType
 * @param {Array<{ userId: string, amount?: number, percentage?: number }>} splits
 * @throws {AppError} INVALID_SPLITS
 */
export function validateSplits(totalAmount, splitType, splits) {
  const epsilon = 0.001; // tolerance for floating-point rounding

  if (splitType === 'EXACT') {
    const sum = splits.reduce((acc, s) => acc + (s.amount || 0), 0);
    if (Math.abs(sum - totalAmount) > epsilon) {
      throw new AppError(
        'INVALID_SPLITS',
        400,
        'Split amounts must sum to expense amount',
      );
    }
  }

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
