/**
 * Zod validation middleware factory.
 *
 * Usage:
 *   router.post('/register', validate(registerSchema), controller.register);
 *
 * Validates req.body against the provided Zod schema.
 * On validation failure, returns 400 with structured error details.
 *
 * @param {import('zod').ZodSchema} schema — the Zod schema to validate against
 * @returns {import('express').RequestHandler}
 */
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));

      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors,
      });
    }

    // Replace req.body with parsed (and coerced/transformed) data
    req.body = result.data;
    next();
  };
}
