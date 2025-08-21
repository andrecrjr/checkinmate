import { Elysia } from 'elysia';
import { z, type ZodSchema, type ZodError } from 'zod';
import pino from 'pino';
import type { ElysiaContext, ValidationError as CustomValidationError } from '../../types';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
});

/**
 * Enhanced validation result interface for Zod errors
 */
interface ValidationResult {
  field: string;
  message: string;
  code: string;
  received?: any;
  expected?: string;
}

/**
 * Transform Zod errors into a more readable format
 */
function formatZodErrors(error: ZodError): ValidationResult[] {
  return error.errors.map(issue => ({
    field: issue.path.join('.') || 'root',
    message: issue.message,
    code: issue.code,
    received: 'received' in issue ? issue.received : undefined,
    expected: 'expected' in issue ? String(issue.expected) : undefined
  }));
}

/**
 * Elysia plugin for Zod-based query parameter validation
 * Provides comprehensive validation with detailed error reporting
 */
export const zodValidation = <T extends ZodSchema>(schema: T) => {
  return new Elysia({ name: 'zod-validation' })
    .derive(({ query, path }) => {
      try {
        const result = schema.safeParse(query);
        
        if (!result.success) {
          const validationErrors = formatZodErrors(result.error);
          
          logger.warn('Request validation failed', {
            path,
            query,
            errors: validationErrors
          });
          
          throw new Error(JSON.stringify({
            error: 'Validation error',
            details: validationErrors,
            statusCode: 400
          }));
        }
        
        logger.debug('Request validation successful', {
          path,
          validatedQuery: result.data
        });
        
        return {
          validatedQuery: result.data as z.infer<T>
        };
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('{')) {
          throw err; // Re-throw validation errors
        }
        
        logger.error('Unexpected error during request validation', err);
        throw new Error(JSON.stringify({
          error: 'Internal server error during validation',
          statusCode: 500
        }));
      }
    });
};

/**
 * Rate limiting middleware for Elysia
 * In-memory implementation with configurable limits
 */
interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  keyGenerator?: (context: ElysiaContext) => string;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Clean up expired rate limit entries
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

// Clean up expired entries every 5 minutes
setInterval(cleanupExpiredEntries, 5 * 60 * 1000);

export const rateLimit = (options: RateLimitOptions) => {
  const {
    windowMs,
    maxRequests,
    message = 'Too many requests',
    skipSuccessfulRequests = false,
    keyGenerator = (context) => {
      const headers = context.headers || {};
      return headers['x-forwarded-for'] || headers['x-real-ip'] || 'unknown';
    }
  } = options;

  return new Elysia({ name: 'rate-limit' })
    .derive(({ headers, path }) => {
      const key = keyGenerator({ headers, path } as any);
      const now = Date.now();
      const windowStart = now - windowMs;
      
      let entry = rateLimitStore.get(key);
      
      if (!entry || now > entry.resetTime) {
        entry = {
          count: 0,
          resetTime: now + windowMs
        };
        rateLimitStore.set(key, entry);
      }
      
      entry.count++;
      
      if (entry.count > maxRequests) {
        logger.warn('Rate limit exceeded', {
          key,
          path,
          count: entry.count,
          maxRequests,
          resetTime: new Date(entry.resetTime).toISOString()
        });
        
        throw new Error(JSON.stringify({
          error: message,
          retryAfter: Math.ceil((entry.resetTime - now) / 1000),
          statusCode: 429
        }));
      }
      
      logger.debug('Rate limit check passed', {
        key,
        path,
        count: entry.count,
        maxRequests
      });
      
      return {
        rateLimitInfo: {
          remaining: maxRequests - entry.count,
          resetTime: entry.resetTime,
          limit: maxRequests
        }
      };
    })
    .onAfterHandle(({ rateLimitInfo, set }) => {
      if (rateLimitInfo && set.headers) {
        set.headers['X-RateLimit-Limit'] = rateLimitInfo.limit.toString();
        set.headers['X-RateLimit-Remaining'] = rateLimitInfo.remaining.toString();
        set.headers['X-RateLimit-Reset'] = new Date(rateLimitInfo.resetTime).toISOString();
      }
    });
};

/**
 * Security headers middleware for Elysia
 * Replaces helmet functionality with essential security headers
 */
export const securityHeaders = () => {
  return new Elysia({ name: 'security-headers' })
    .onAfterHandle(({ set }) => {
      if (set.headers) {
        // Content Security Policy
        set.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https:";
        
        // Other security headers
        set.headers['X-Content-Type-Options'] = 'nosniff';
        set.headers['X-Frame-Options'] = 'DENY';
        set.headers['X-XSS-Protection'] = '1; mode=block';
        set.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';
        set.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()';
        
        // Remove server information
        delete set.headers['Server'];
        delete set.headers['X-Powered-By'];
      }
    });
};