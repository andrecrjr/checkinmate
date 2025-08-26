import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import mongoose from 'mongoose';
import { LRUCache } from 'lru-cache';
import pino from 'pino';
import type { PlaceDocument, DatabaseConfig, ServerConfig } from '../types';
import { createGeoPlaceRoutes } from './Routes/GeoRoutes';
import getPlaceModel from './Model/Place';
import { GeoPlaceController } from './Controller/Geoplace';

// Configuration constants with enhanced type safety
const CACHE_TTL = 60 * 1000; // 1 minute
const CACHE_MAX_SIZE = 500;

// Database configuration
const dbConfig: DatabaseConfig = {
  uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/checkinmate',
  options: {
    autoIndex: true,
    maxPoolSize: 10,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 5000,
  }
};

// Server configuration
const serverConfig: ServerConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true
  },
  rateLimit: {
    windowMs: 60 * 1000, // 1 minute
    max: 100 // requests per window
  }
};

// Enhanced logger with structured logging
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? { 
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard'
    }
  } : undefined,
  formatters: {
    level: (label) => ({ level: label.toUpperCase() })
  }
});

// Enhanced cache with better type safety
export const cache = new LRUCache<string, PlaceDocument[]>({
  max: CACHE_MAX_SIZE,
  ttl: CACHE_TTL,
  updateAgeOnGet: true,
  updateAgeOnHas: true
});

// MongoDB Connection with enhanced error handling
const connectToDatabase = async (): Promise<void> => {
  try {
    await mongoose.connect(dbConfig.uri, dbConfig.options);
    logger.info('✅ Connected to MongoDB successfully');
    
    // Setup connection event listeners
    mongoose.connection.on('error', (err) => {
      logger.error('❌ MongoDB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      logger.warn('⚠️ MongoDB disconnected');
    });
    
    mongoose.connection.on('reconnected', () => {
      logger.info('🔄 MongoDB reconnected');
    });
    
  } catch (error) {
    logger.error('❌ Failed to connect to MongoDB:', error);
    process.exit(1);
  }
};



// Create Elysia app with enhanced configuration
const app = new Elysia({ name: 'CheckinMate API', prefix: '/api/v1' })
  // CORS configuration
  .use(cors({
    origin: serverConfig.cors.origin,
    credentials: serverConfig.cors.credentials,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  }))
  
  // Global error handler
  .onError(({ code, error, set }) => {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logger.error('API Error:', { code, error: errorMessage, stack: errorStack });
    
    switch (code) {
      case 'VALIDATION':
        set.status = 400;
        return {
          error: 'Validation Error',
          message: errorMessage,
          timestamp: new Date().toISOString()
        };
      case 'NOT_FOUND':
        set.status = 404;
        return {
          error: 'Not Found',
          message: 'The requested resource was not found',
          timestamp: new Date().toISOString()
        };
      default:
        set.status = 500;
        return {
          error: 'Internal Server Error',
          message: process.env.NODE_ENV === 'development' ? errorMessage : 'Something went wrong',
          timestamp: new Date().toISOString()
        };
    }
  })
  
  // Request logging middleware
  .onRequest(({ request, set }) => {
    const start = Date.now();
    set.headers['x-request-id'] = crypto.randomUUID();
    
    logger.info('Incoming request', {
      method: request.method,
      url: request.url,
      userAgent: request.headers.get('user-agent'),
      requestId: set.headers['x-request-id']
    });
    
    // Store start time in context for response logging
    (request as any).startTime = start;
  })
  
  // Response logging and security headers middleware
  .onAfterHandle(({ request, set }) => {
    const startTime = (request as any).startTime || Date.now();
    const duration = Date.now() - startTime;
    
    logger.info('Request completed', {
      method: request.method,
      url: request.url,
      status: set.status || 200,
      duration: `${duration}ms`,
      requestId: set.headers?.['x-request-id']
    });
    
    // Set security headers
    set.headers['X-Content-Type-Options'] = 'nosniff';
    set.headers['X-Frame-Options'] = 'DENY';
    set.headers['X-XSS-Protection'] = '1; mode=block';
    set.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';
  })
  
  // Setup routes
  .use(createGeoPlaceRoutes)
  
  // Root endpoint
  .get('/', () => ({
    message: 'CheckinMate API',
    version: '1.0.0',
    documentation: '/swagger',
    timestamp: new Date().toISOString()
  }))
  
  // Swagger documentation - must be after routes are registered
  .use(swagger({
    documentation: {
      info: {
        title: 'CheckinMate API',
        version: '1.0.0',
        description: 'Geolocation API with Elysia.js and Zod validation'
      },
      tags: [
        { name: 'Places', description: 'Geolocation and place management endpoints' },
        { name: 'Health', description: 'System health and monitoring endpoints' }
      ]
    }
  }))

// Graceful shutdown handling
const gracefulShutdown = async (signal: string) => {
  logger.info(`🛑 Received ${signal}, starting graceful shutdown...`);
  
  try {
    await mongoose.connection.close();
    logger.info('✅ MongoDB connection closed');
    
    cache.clear();
    logger.info('✅ Cache cleared');
    
    logger.info('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
};

// Setup signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const startServer = async () => {
  try {
    await connectToDatabase();
    
    app.listen(serverConfig.port);
    
    logger.info('🚀 Server started successfully', {
      port: serverConfig.port,
      host: serverConfig.host,
      environment: process.env.NODE_ENV || 'development',
      swagger: `http://${serverConfig.host}:${serverConfig.port}/api/v1/swagger`
    }); 
    
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the application
startServer();