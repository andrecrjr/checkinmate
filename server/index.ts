import express, { type Request, type Response } from 'express';
import mongoose, { Schema, Document } from 'mongoose';
import { LRUCache } from 'lru-cache';
import Joi from 'joi';
import util from 'util';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pino from 'pino';
import type { PlaceDocument, PlaceResult } from '../types';
import OverpassService from './Service/OverpassService';
import { calculateDistance } from './utils';
import getPlaceModel from './Model/Place';

// Constants
const DEFAULT_RADIUS = 1000;
const CACHE_TTL = 60 * 1000;
const API_RATE_LIMIT = 100;

// Logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
});

const PlaceModel = getPlaceModel();
// Cache
const cache = new LRUCache<string, PlaceDocument[]>({ max: 500, ttl: CACHE_TTL });

// Rate Limiter
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: API_RATE_LIMIT,
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many requests. Please try again later.' });
  },
});

// Validation Schema
const querySchema = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lon: Joi.number().min(-180).max(180).required(),
  radius: Joi.number().min(100).max(5000).default(DEFAULT_RADIUS),
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(10),
  cache: Joi.boolean().optional().default(false)
});


// Express App
const app = express();
app.use(helmet());
app.use(limiter);
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

// Health Check
app.get('/health', async (req: Request, res: Response) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'healthy' : 'unhealthy';
  res.json({ status: dbStatus === 'healthy' ? 'OK' : 'DEGRADED' });
});

// Main Places Endpoint
app.get('/places', async (req: Request, res: Response) => {
  try {
    const { error, value } = querySchema.validate(req.query);
    if (error) {
      logger.warn(`Validation error: ${error.message}`);
      return res.status(400).json({ error: error.message });
    }

    const { lat, lon, radius, page, limit, cache:useCache } = value;
    const cacheKey = `places:${lat.toFixed(6)}:${lon.toFixed(6)}:${radius}:${page}:${limit}`;

    if (cache.has(cacheKey) && useCache) {
      return res.json(cache.get(cacheKey));
    }
        // MongoDB aggregation with distance calculation
    const mongoData = await PlaceModel.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [lon, lat] },
          distanceField: 'distance',
          spherical: true,
          maxDistance: radius,
          query: {}
        }
      },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      {
        $project: {
          name: 1,
          address: 1,
          coordinates: 1,
          category: 1,
          source: 1,
          updatedAt: 1,
          distance: 1
        }
      }
    ]);

    
    if (mongoData.length < limit) {
      const overpassData = await OverpassService.queryPlaces(lat, lon, radius);
      
      // Safely add distances to Overpass results
      const overpassDataWithDistance = overpassData
        .filter(place => place && place.coordinates && Array.isArray(place.coordinates.coordinates))
        .map(place => {
          const [placeLon, placeLat] = place.coordinates.coordinates;
          const distance = calculateDistance(lat, lon, placeLat, placeLon);
          return { ...place, distance };
        });

      // Combine and deduplicate with safe checks
      const combinedData = [...mongoData, ...overpassDataWithDistance]
        .filter(place => 
          place && 
          place.name &&
          place.coordinates &&
          Array.isArray(place.coordinates.coordinates) &&
          place.coordinates.coordinates.length === 2
        )
        .filter((place, index, self) => {
          return index === self.findIndex(p => 
            p && 
            place &&
            p.name === place.name &&
            p.coordinates &&
            place.coordinates &&
            Array.isArray(p.coordinates.coordinates) &&
            Array.isArray(place.coordinates.coordinates) &&
            p.coordinates.coordinates[0] === place.coordinates.coordinates[0] &&
            p.coordinates.coordinates[1] === place.coordinates.coordinates[1]
          );
        })
        .sort((a, b) => (b.distance || 0) - (a.distance || 0))
        .slice(0, limit);

      if (useCache) {
        cache.set(cacheKey, combinedData);
      }

      return res.json({
        page,
        limit,
        results: combinedData,
        total: combinedData.length
      });
    }
  } catch (error) {
    logger.error(`API Error: ${util.inspect(error)}`);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Server
const PORT = parseInt(process.env.PORT || '3000', 10);
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server running on port ${PORT}`);
});