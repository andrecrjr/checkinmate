import { z } from 'zod';
import { extendZod, zId } from '@zodyac/zod-mongoose';

// Extend Zod with Mongoose-specific types
extendZod(z);

// Base coordinate validation
export const CoordinateSchema = z.object({
  lat: z.number()
    .min(-90, 'Latitude must be between -90 and 90')
    .max(90, 'Latitude must be between -90 and 90'),
  lon: z.number()
    .min(-180, 'Longitude must be between -180 and 180')
    .max(180, 'Longitude must be between -180 and 180')
});

// GeoJSON Point schema
export const GeoJSONPointSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.tuple([
    z.number().min(-180).max(180), // longitude
    z.number().min(-90).max(90)    // latitude
  ])
});

// Pagination schema
export const PaginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(10)
});

// Place query schema - main validation for /places endpoint
export const PlaceQuerySchema = z.object({
  lat: z.number()
    .min(-90, 'Latitude must be between -90 and 90')
    .max(90, 'Latitude must be between -90 and 90'),
  lon: z.number()
    .min(-180, 'Longitude must be between -180 and 180')
    .max(180, 'Longitude must be between -180 and 180'),
  radius: z.number()
    .int()
    .min(100, 'Radius must be at least 100 meters')
    .max(5000, 'Radius cannot exceed 5000 meters')
    .default(1000),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(10),
  cache: z.boolean().default(false)
});

// Place document schema for database operations
export const PlaceDocumentSchema = z.object({
  _id: zId().optional(), // ObjectId, optional for new documents
  name: z.string().min(1, 'Name is required'),
  address: z.string().default('Unknown address'),
  coordinates: GeoJSONPointSchema,
  category: z.string().min(1, 'Category is required'),
  source: z.enum(['overpass', 'mongodb']),
  updatedAt: z.date(),
  distance: z.number().optional()
});

// Response schemas for API endpoints
export const PlaceResponseSchema = z.object({
  page: z.number(),
  limit: z.number(),
  results: z.array(PlaceDocumentSchema),
  total: z.number()
});

export const HealthCheckResponseSchema = z.object({
  status: z.enum(['OK', 'DEGRADED'])
});

// Error response schema
export const ErrorResponseSchema = z.object({
  error: z.string(),
  details: z.array(z.object({
    field: z.string(),
    message: z.string()
  })).optional()
});

// Type exports for TypeScript integration
export type CoordinateInput = z.infer<typeof CoordinateSchema>;
export type GeoJSONPoint = z.infer<typeof GeoJSONPointSchema>;
export type PaginationInput = z.infer<typeof PaginationSchema>;
export type PlaceQueryInput = z.infer<typeof PlaceQuerySchema>;
export type PlaceDocument = z.infer<typeof PlaceDocumentSchema>;
export type PlaceResponse = z.infer<typeof PlaceResponseSchema>;
export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// Validation helper functions
export const validateCoordinates = (lat: number, lon: number): boolean => {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
};

export const validateRadius = (radius: number): boolean => {
  return radius >= 100 && radius <= 5000;
};