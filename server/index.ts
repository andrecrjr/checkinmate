import express from 'express';
import mongoose from 'mongoose';
import { LRUCache } from 'lru-cache';
import helmet from 'helmet';
import pino from 'pino';
import { type PlaceDocument } from '../types';
import { createGeoPlaceRoutes } from './Routes/GeoRoutes';
import getPlaceModel from './Model/Place';
import { GeoPlaceController } from './Controller/Geoplace';

// Constants
const CACHE_TTL = 60 * 1000;

// Logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
});

// Cache
const cache = new LRUCache<string, PlaceDocument[]>({ max: 500, ttl: CACHE_TTL });

// Express App
const app = express();
app.use(helmet());
app.disable('x-powered-by');

// MongoDB Connection
mongoose
  .connect(process.env.MONGODB_URI!, {
    autoIndex: true,
    maxPoolSize: 10,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 5000,
  })
  .then(() => logger.info('Connected to MongoDB'))
  .catch((err) => logger.error(`MongoDB connection error: ${err.message}`));

// Initialize models and controllers
const PlaceModel = getPlaceModel();
const geoPlaceController = new GeoPlaceController(PlaceModel, cache, logger);

// Setup routes
app.use('/api/v1', createGeoPlaceRoutes(geoPlaceController));

// Server
const PORT = parseInt(process.env.PORT || '3000', 10);
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server running on port ${PORT}`);
});