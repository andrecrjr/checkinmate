import { LRUCache } from 'lru-cache';
import OverpassService from '../Service/OverpassService';
import { calculateDistance } from '../utils';
import pino from 'pino';
import util from 'util';
import type { PlaceDocument } from '../../types';
import type { Request, Response } from 'express';

export class GeoPlaceController {
  private placeModel;
  private cache: LRUCache<string, PlaceDocument[]>;
  private logger: pino.Logger;
  
  constructor(placeModel: any, cache: LRUCache<string, PlaceDocument[]>, logger: pino.Logger) {
    this.placeModel = placeModel;
    this.cache = cache;
    this.logger = logger;
  }

  /**
   * Get places based on geographical coordinates
   */
  public async getPlaces(req: Request, res: Response): Promise<void> {
    try {
      const { lat, lon, radius, page, limit, cache: useCache } = req.query as unknown as {
        lat: number;
        lon: number;
        radius: number;
        page: number;
        limit: number;
        cache: boolean;
      };

      const cacheKey = this.generateCacheKey(lat, lon, radius, page, limit);

      if (this.cache.has(cacheKey) && useCache) {
        res.json(this.cache.get(cacheKey));
        return;
      }

      const mongoData = await this.getMongoDBData(lat, lon, radius, page, limit);

      if (mongoData.length < limit) {
        const combinedData = await this.getCombinedData(mongoData, lat, lon, radius, limit);
        
        if (useCache) {
          this.cache.set(cacheKey, combinedData);
        }

        res.json({
          page,
          limit,
          results: combinedData,
          total: combinedData.length
        });
        return;
      }

      res.json({
        page,
        limit,
        results: mongoData,
        total: mongoData.length
      });
    } catch (error) {
      this.logger.error(`API Error: ${util.inspect(error)}`);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  /**
   * Get all places without geographical filtering
   */
  public async getAllPlaces(_req: Request, res: Response): Promise<void> {
    try {
      const places = await this.placeModel.find();
      res.json(places);
    } catch (error) {
      this.logger.error(`Error fetching all places: ${util.inspect(error)}`);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  /**
   * Health check endpoint
   */
  public async healthCheck(_req: Request, res: Response): Promise<void> {
    try {
      const isConnected = await this.checkDatabaseConnection();
      res.json({ status: isConnected ? 'OK' : 'DEGRADED' });
    } catch (error) {
      this.logger.error(`Health check error: ${util.inspect(error)}`);
      res.status(500).json({ status: 'DEGRADED' });
    }
  }

  private async checkDatabaseConnection(): Promise<boolean> {
    try {
      await this.placeModel.db.admin().ping();
      return true;
    } catch {
      return false;
    }
  }

  private generateCacheKey(lat: number, lon: number, radius: number, page: number, limit: number): string {
    return `places:${lat.toFixed(6)}:${lon.toFixed(6)}:${radius}:${page}:${limit}`;
  }

  private async getMongoDBData(lat: number, lon: number, radius: number, page: number, limit: number): Promise<PlaceDocument[]> {
    return await this.placeModel.aggregate([
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
  }

  private async getCombinedData(
    mongoData: PlaceDocument[],
    lat: number,
    lon: number,
    radius: number,
    limit: number
): Promise<PlaceDocument[]> {
  const overpassData = await this.fetchAndProcessOverpassData(lat, lon, radius);

  const combinedData = [...mongoData, ...overpassData]
    .filter(this.isValidPlace)
    .filter(this.removeDuplicates)
    .sort((a, b) => (a.distance || 0) - (b.distance || 0)) // Fixed sorting logic: nearest to farthest
    .slice(0, limit);

  return combinedData;
}

private async fetchAndProcessOverpassData(lat: number, lon: number, radius: number): Promise<PlaceDocument[]> {
  const overpassData = await OverpassService.queryPlaces(lat, lon, radius);
  return overpassData
    .filter(place => place && place.coordinates && Array.isArray(place.coordinates.coordinates))
    .map(place => {
      const [placeLon, placeLat] = place.coordinates.coordinates;
      const distance = calculateDistance(lat, lon, placeLat, placeLon);
      return { ...place, distance };
    });
}

private isValidPlace(place: PlaceDocument): string | boolean {
  return place && place.name && place.coordinates && Array.isArray(place.coordinates.coordinates) && place.coordinates.coordinates.length === 2;
}

private removeDuplicates(place: PlaceDocument, index: number, self: PlaceDocument[]): boolean {
  return index === self.findIndex(p => 
    p && place && 
    p.name === place.name && 
    p.coordinates && place.coordinates &&
    Array.isArray(p.coordinates.coordinates) && Array.isArray(place.coordinates.coordinates) &&
    p.coordinates.coordinates[0] === place.coordinates.coordinates[0] &&
    p.coordinates.coordinates[1] === place.coordinates.coordinates[1]
  );
}
}