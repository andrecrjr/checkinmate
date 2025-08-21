/**
 * Elysia.js routes with enhanced Zod validation and type safety
 * Architectural decisions:
 * - Replaced Express Router with Elysia's native routing
 * - Integrated Zod schemas for comprehensive input validation
 * - Enhanced error handling with proper HTTP status codes
 * - Built-in rate limiting using Elysia plugins
 * - Improved TypeScript integration with context typing
 */

import { Elysia } from 'elysia';
import { GeoPlaceController } from '../Controller/Geoplace';
import { 
  PlaceQuerySchema, 
  PaginationSchema,
  type PlaceQueryInput,
  type PaginationInput 
} from '../schemas/validation';
import getPlaceModel from '../Model/Place';
import { logger } from '../logger';
import { cache } from '..';

// Constants with enhanced type safety
const DEFAULT_RADIUS = 1000;
const API_RATE_LIMIT = 100;
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

// Rate limiting store (simple in-memory implementation)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Rate limiting middleware
const rateLimit = (limit: number, windowMs: number) => {
  return ({ request, set }: { request: Request; set: any }) => {
    const clientIp = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown';
    
    const now = Date.now();
    const key = `${clientIp}:${new URL(request.url).pathname}`;
    const record = rateLimitStore.get(key);
    
    if (!record || now > record.resetTime) {
      rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
      return;
    }
    
    if (record.count >= limit) {
      set.status = 429;
      return {
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil((record.resetTime - now) / 1000),
        timestamp: new Date().toISOString()
      };
    }
    
    record.count++;
  };
};

// Initialize models and controllers
const PlaceModel = getPlaceModel();

/**
 * Creates Elysia routes for geolocation endpoints with enhanced validation and error handling
 * @param app - Elysia application instance
 * @param controller - GeoPlaceController instance
 * @returns Enhanced Elysia application with routes
 */
export const createGeoPlaceRoutes = (
  app: Elysia,
) => {
  const controller = new GeoPlaceController(PlaceModel, cache, logger);

  return app.onBeforeHandle(rateLimit(API_RATE_LIMIT, RATE_LIMIT_WINDOW))
    
    // GET /places - Search for places with comprehensive validation
    .get('/places', async ({ query, set, headers, params }) => {
      try {
        // Validate and transform query parameters
        const validatedQuery = PlaceQuerySchema.parse({
          lat: parseFloat(query.lat as string),
          lon: parseFloat(query.lon as string),
          radius: query.radius ? parseInt(query.radius as string) : DEFAULT_RADIUS,
          page: query.page ? parseInt(query.page as string) : 1,
          limit: query.limit ? parseInt(query.limit as string) : 10,
          cache: query.cache === 'true'
        });
        
        // Create context object for controller
        const context = {
          query: validatedQuery,
          params: params || {},
          body: {},
          headers: headers || {},
          set
        };
        
        return await controller.getPlaces(context);
        
      } catch (error: any) {
        set.status = 400;
        return {
          error: 'Validation Error',
          message: error.message || 'Invalid query parameters',
          details: error.issues || [],
          timestamp: new Date().toISOString()
        };
      }
    }, {
       detail: {
        tags: ['Places'],
        summary: 'Search for places by coordinates',
        description: 'Find places within a specified radius of given coordinates with pagination support',
        parameters: [
          { name: 'lat', in: 'query', required: true, schema: { type: 'number', minimum: -90, maximum: 90 } },
          { name: 'lon', in: 'query', required: true, schema: { type: 'number', minimum: -180, maximum: 180 } },
          { name: 'radius', in: 'query', schema: { type: 'number', minimum: 100, maximum: 5000, default: DEFAULT_RADIUS } },
          { name: 'page', in: 'query', schema: { type: 'number', minimum: 1, default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'number', minimum: 1, maximum: 100, default: 10 } },
          { name: 'cache', in: 'query', schema: { type: 'boolean', default: false } }
        ]
      }
    })
    
    // GET /all-places - Get all places with pagination
    .get('/all-places', async ({ query, set, headers, params }) => {
      try {
        // Validate pagination parameters
        const validatedQuery = PaginationSchema.parse({
          page: query.page ? parseInt(query.page as string) : 1,
          limit: query.limit ? parseInt(query.limit as string) : 10
        });
        
        // Create context object for controller
        const context = {
          query: validatedQuery,
          params: params || {},
          body: {},
          headers: headers || {},
          set
        };
        
        return await controller.getAllPlaces(context);
        
      } catch (error: any) {
        set.status = 400;
        return {
          error: 'Validation Error',
          message: error.message || 'Invalid pagination parameters',
          details: error.issues || [],
          timestamp: new Date().toISOString()
        };
      }
    }, {
       detail: {
        tags: ['Places'],
        summary: 'Get all places with pagination',
        description: 'Retrieve all places from the database with pagination support',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'number', minimum: 1, default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'number', minimum: 1, maximum: 100, default: 10 } }
        ]
      }
    })
    
    // GET /health - Health check endpoint
    .get('/health', async ({ set, headers, params }) => {
      try {
        // Create context object for controller
        const context = {
          query: {},
          params: params || {},
          body: {},
          headers: headers || {},
          set
        };
        
        return await controller.healthCheck(context);
        
      } catch (error: any) {
        set.status = 500;
        return {
          error: 'Health Check Failed',
          message: error.message || 'Service unavailable',
          timestamp: new Date().toISOString()
        };
      }
    }, {
      detail: {
        tags: ['Health'],
        summary: 'Health check',
        description: 'Check the health status of the API and its dependencies'
      }
    });
};