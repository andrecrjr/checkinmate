import { Document, Types } from 'mongoose';
import type {
  GeoJSONPoint,
  PlaceDocument as ZodPlaceDocument,
  CoordinateInput,
  PlaceQueryInput,
  PlaceResponse,
  HealthCheckResponse,
  ErrorResponse
} from './server/schemas/validation';

// Re-export Zod-derived types for consistency
export type { GeoJSONPoint, CoordinateInput, PlaceQueryInput, PlaceResponse, HealthCheckResponse, ErrorResponse };

// Enhanced PlaceDocument interface that extends both Zod type and Mongoose Document
export interface PlaceDocument extends Omit<ZodPlaceDocument, 'updatedAt'>, Document {
  _id: Types.ObjectId; // Explicitly include ObjectId
  updatedAt: Date;
  distance?: number;
  // Mongoose-specific methods
  calculateDistance?(lat: number, lon: number): number;
}

// Type for API responses (with string IDs)
export type PlaceDocumentApiResponse = Omit<ZodPlaceDocument, '_id'> & { _id: string };

// Database model interfaces
export interface PlaceModel {
  findNearby(lat: number, lon: number, radius: number, limit?: number): Promise<PlaceDocument[]>;
}

// Service interfaces for dependency injection
export interface CacheService<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
}

export interface LoggerService {
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
}

// Controller context types for Elysia
export interface ElysiaContext {
  query: Record<string, any>;
  params: Record<string, string>;
  body: unknown;
  headers: Record<string, string | undefined>;
  set: any;
}

// API Response types
export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  page: number;
  limit: number;
  total: number;
  results: T[];
}

// Configuration types
export interface DatabaseConfig {
  uri: string;
  options: {
    autoIndex: boolean;
    maxPoolSize: number;
    minPoolSize: number;
    serverSelectionTimeoutMS: number;
  };
}

export interface ServerConfig {
  port: number;
  host: string;
  cors: {
    origin: string | string[];
    credentials: boolean;
  };
  rateLimit: {
    windowMs: number;
    max: number;
  };
}

// Utility types
export type Coordinates = [longitude: number, latitude: number];
export type DistanceUnit = 'meters' | 'kilometers' | 'miles';
export type PlaceSource = 'overpass' | 'mongodb';
export type PlaceCategory = string;

// Error types
export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}

export interface ApiError extends Error {
  statusCode: number;
  details?: ValidationError[];
}