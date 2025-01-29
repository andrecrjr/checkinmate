import { type Request, type Response, type NextFunction } from 'express';
import { type Schema, ValidationError } from 'joi';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
});

interface ValidationResult {
  field: string;
  message: string;
}

export const validateRequest = (schema: Schema) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { error, value } = schema.validate(req.query, {
        abortEarly: false,
        stripUnknown: true,
        convert: true
      });

      if (error) {
        const validationErrors: ValidationResult[] = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }));

        logger.warn('Request validation failed', {
          path: req.path,
          query: req.query,
          errors: validationErrors
        });

        res.status(400).json({
          error: 'Validation error',
          details: validationErrors
        });
        return;
      }

      // Replace query with validated values
      req.query = value;
      next();
    } catch (err) {
      logger.error('Unexpected error during request validation', err);
      res.status(500).json({ error: 'Internal server error during validation' });
    }
  };
};