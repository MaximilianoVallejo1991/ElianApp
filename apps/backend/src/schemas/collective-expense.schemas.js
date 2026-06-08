import { z } from 'zod';

// ---------------------------------------------------------------------------
//  Collective Expense Schemas
// ---------------------------------------------------------------------------
//  Zod validation for collective expense and individual item request bodies.
//  Business logic validations live in the service layer.
// ---------------------------------------------------------------------------

/**
 * POST /groups/:groupId/collective-expenses
 *
 * Required: total (positive), sharedCosts (>= 0), participantIds (min 1 CUID)
 * Optional: description
 */
export const createCollectiveExpenseSchema = z.object({
  description: z.string().optional(),
  total: z.number().positive('Total must be a positive number'),
  sharedCosts: z.number().min(0, 'Shared costs cannot be negative'),
  participantIds: z
    .array(z.string().min(1, 'Participant ID is required'))
    .min(1, 'At least one participant is required'),
});

/**
 * PUT /groups/:groupId/collective-expenses/:id
 *
 * All fields optional (partial update). At least one field must be provided.
 */
export const updateCollectiveExpenseSchema = z
  .object({
    description: z.string().optional(),
    total: z.number().positive('Total must be a positive number').optional(),
    sharedCosts: z.number().min(0, 'Shared costs cannot be negative').optional(),
    participantIds: z
      .array(z.string().min(1, 'Participant ID is required'))
      .optional(),
  })
  .refine(
    (data) =>
      data.total !== undefined ||
      data.sharedCosts !== undefined ||
      data.participantIds !== undefined ||
      data.description !== undefined,
    { message: 'At least one field is required for update' },
  );

/**
 * POST /groups/:groupId/collective-expenses/:id/items
 *
 * Required: amount (positive)
 * Optional: description
 */
export const createItemSchema = z.object({
  amount: z.number().positive('Amount must be a positive number'),
  description: z.string().optional(),
});

/**
 * PUT /groups/:groupId/collective-expenses/:id/items/:itemId
 *
 * All fields optional (partial update). At least one field must be provided.
 */
export const updateItemSchema = z
  .object({
    amount: z.number().positive('Amount must be a positive number').optional(),
    description: z.string().optional(),
  })
  .refine((data) => data.amount !== undefined || data.description !== undefined, {
    message: 'At least one field is required for update',
  });

/**
 * POST /groups/:groupId/collective-expenses/:id/unlock
 *
 * No body required — empty schema.
 */
export const unlockSchema = z.object({});
