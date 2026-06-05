import { z } from 'zod';

/**
 * POST /groups
 *
 * Required fields: name, currency, balanceMode
 *   - name: 1-100 chars
 *   - currency: 3-letter ISO code (e.g. USD, EUR, ARS)
 *   - balanceMode: DYNAMIC or STATIC
 */
export const createGroupSchema = z.object({
  name: z
    .string()
    .min(1, 'Group name is required')
    .max(100, 'Group name must be at most 100 characters'),
  currency: z
    .string()
    .length(3, 'Currency must be a 3-letter ISO code')
    .regex(/^[A-Z]{3}$/, 'Currency must be uppercase letters (e.g. USD, ARS)'),
  balanceMode: z
    .enum(['DYNAMIC', 'STATIC'], {
      errorMap: () => ({ message: 'balanceMode must be DYNAMIC or STATIC' }),
    }),
});

/**
 * PUT /groups/:id
 *
 * All fields optional (partial update).
 */
export const updateGroupSchema = createGroupSchema.partial();

/**
 * POST /groups/:groupId/invite
 *
 * Must provide EITHER email OR nickName to identify the target user.
 */
export const inviteSchema = z.union([
  z.object({
    email: z.string().email('Invalid email address'),
  }),
  z.object({
    nickName: z.string().min(1, 'Nickname is required'),
  }),
]);
