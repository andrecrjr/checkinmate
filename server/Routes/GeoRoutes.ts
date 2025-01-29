import express, { Router } from 'express';
import Joi from 'joi';
import rateLimit from 'express-rate-limit';
import type { GeoPlaceController } from '../Controller/Geoplace';
import { validateRequest } from '../Middlewares/JoiMiddleware';

// Constants
const DEFAULT_RADIUS = 1000;
const API_RATE_LIMIT = 100;

// Rate Limiter
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: API_RATE_LIMIT,
  handler: (_req, res) => {
    res.status(429).json({ error: 'Too many requests. Please try again later.' });
  },
});

// Validation Schema
const placeQuerySchema = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lon: Joi.number().min(-180).max(180).required(),
  radius: Joi.number().min(100).max(5000).default(DEFAULT_RADIUS),
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(10),
  cache: Joi.boolean().default(false)
}).required();

export const createGeoPlaceRoutes = (controller: GeoPlaceController): Router => {
  const router = express.Router();

  // Apply rate limiting to all routes
  router.use(limiter);

  // Routes
  router.get(
    '/places',
    validateRequest(placeQuerySchema),
    async (req, res) => controller.getPlaces(req, res)
  );

  router.get(
    '/all-places',
    async (req, res) => controller.getAllPlaces(req, res)
  );

  router.get(
    '/health',
    async (req, res) => controller.healthCheck(req, res)
  );

  return router;
};