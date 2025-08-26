import { LRUCache } from 'lru-cache';
import OverpassService from '../Service/OverpassService';
import { calculateDistance } from '../utils';
import pino from 'pino';
import util from 'util';
import type { 
  PlaceDocument as MongoPlaceDocument, 
  ElysiaContext, 
  ApiResponse, 
  PaginatedResponse,
  PlaceModel,
  CacheService,
  LoggerService 
} from '../../types';
import type { 
  PlaceQueryInput, 
  PaginationInput,
  PlaceDocument 
} from '../schemas/validation';

export class GeoPlaceController {
  private placeModel: PlaceModel;
  public cache: LRUCache<string, MongoPlaceDocument[]>;
  public logger: pino.Logger;
  
  constructor(placeModel: PlaceModel, cache: LRUCache<string, MongoPlaceDocument[]>, logger: pino.Logger) {
    this.placeModel = placeModel;
    this.cache = cache;
    this.logger = logger;
  }

  /**
   * Get places based on geographical coordinates
   * Enhanced with Zod validation and Elysia context
   */
  public async getPlaces(context: ElysiaContext): Promise<PaginatedResponse<PlaceDocument>> {
    try {
      const query = context.query as unknown as PlaceQueryInput;
      const { lat, lon, radius, page = 1, limit = 10, cache: useCache = true } = query;

      this.logger.info(`Searching places: lat=${lat}, lon=${lon}, radius=${radius}`);

      const cacheKey = this.generateCacheKey(lat, lon, radius, page, limit);

      // Check cache first if enabled
      // if (this.cache.has(cacheKey) && useCache) {
      //   const cachedData = this.cache.get(cacheKey)!;
      //   this.logger.debug(`Cache hit for key: ${cacheKey}`);
      //   return {
      //     page,
      //     limit,
      //     results: cachedData,
      //     total: cachedData.length
      //   };
      // }

      const mongoData = await this.getMongoDBData(lat, lon, radius, page, limit);
      this.logger.debug(`MongoDB returned ${mongoData.length} places`);
      this.logger.debug(`MongoDB data: ${util.inspect(mongoData)}`);
      // If we don't have enough data from MongoDB, combine with Overpass API
      if (mongoData.length < limit) {
        const combinedData = await this.getCombinedData(mongoData, lat, lon, radius, limit);
        
        if (useCache) {
          this.cache.set(cacheKey, combinedData);
          this.logger.debug(`Cached ${combinedData.length} places with key: ${cacheKey}`);
        }

        return {
          page,
          limit,
          results: combinedData,
          total: combinedData.length
        };
      }

      return {
        page,
        limit,
        results: mongoData as PlaceDocument[],
        total: mongoData.length
      };
    } catch (error) {
      this.logger.error(`API Error in getPlaces: ${util.inspect(error)}`);
      throw new Error('Failed to fetch places');
    }
  }

  /**
   * Get all places without geographical filtering
   * Enhanced with pagination and Elysia context
   */
  public async getAllPlaces(context: ElysiaContext): Promise<PaginatedResponse<PlaceDocument>> {
    try {
      const query = context.query as unknown as PaginationInput;
      const { page = 1, limit = 50 } = query;
      
      this.logger.info(`Fetching all places: page=${page}, limit=${limit}`);
      
      const skip = (page - 1) * limit;
      const [places, total] = await Promise.all([
        (this.placeModel as any).find().skip(skip).limit(limit).lean(),
        (this.placeModel as any).countDocuments()
      ]);
      
      this.logger.debug(`Retrieved ${places.length} places out of ${total} total`);
      
      return {
        page,
        limit,
        results: places as PlaceDocument[],
        total
      };
    } catch (error) {
      this.logger.error(`Error fetching all places: ${util.inspect(error)}`);
      throw new Error('Failed to fetch all places');
    }
  }

  /**
   * Health check endpoint
   * Enhanced with detailed system status
   */
  public async healthCheck(_context: ElysiaContext): Promise<ApiResponse<{ status: string; timestamp: string; services: Record<string, boolean> }>> {
    try {
      const timestamp = new Date().toISOString();
      const [dbConnected, cacheStatus] = await Promise.all([
        this.checkDatabaseConnection(),
        this.checkCacheStatus()
      ]);
      
      const overallStatus = dbConnected && cacheStatus ? 'OK' : 'DEGRADED';
      
      this.logger.info(`Health check completed: ${overallStatus}`);
      
      return {
        data: {
          status: overallStatus,
          timestamp,
          services: {
            database: dbConnected,
            cache: cacheStatus
          }
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error(`Health check error: ${util.inspect(error)}`);
      return {
        data: {
          status: 'DEGRADED',
          timestamp: new Date().toISOString(),
          services: {
            database: false,
            cache: false
          }
        },
        timestamp: new Date().toISOString()
      };
    }
  }

  private async checkDatabaseConnection(): Promise<boolean> {
    try {
      await (this.placeModel as any).db.admin().ping();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check cache service status
   */
  private checkCacheStatus(): boolean {
    try {
      return this.cache !== null && this.cache !== undefined;
    } catch {
      return false;
    }
  }

  private generateCacheKey(lat: number, lon: number, radius: number, page: number, limit: number): string {
    return `places:${lat.toFixed(6)}:${lon.toFixed(6)}:${radius}:${page}:${limit}`;
  }

  private async getMongoDBData(lat: number, lon: number, radius: number, page: number, limit: number): Promise<MongoPlaceDocument[]> {
    return await (this.placeModel as any).aggregate([
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
    mongoData: MongoPlaceDocument[],
    lat: number,
    lon: number,
    radius: number,
    limit: number
  ): Promise<MongoPlaceDocument[]> {
  const overpassData = await this.fetchAndProcessOverpassData(lat, lon, radius);

  const combinedData = [...mongoData, ...overpassData]
    .filter(this.isValidPlace)
    .filter(this.removeDuplicates)
    .sort((a, b) => (a.distance || 0) - (b.distance || 0)) // Fixed sorting logic: nearest to farthest
    .slice(0, limit);

  return combinedData;
}

private async fetchAndProcessOverpassData(lat: number, lon: number, radius: number): Promise<MongoPlaceDocument[]> {
  const overpassData = await OverpassService.queryPlaces(lat, lon, radius);
  return overpassData
    .filter(place => place && place.coordinates && Array.isArray(place.coordinates.coordinates))
    .map(place => {
      const [placeLon, placeLat] = place.coordinates.coordinates;
      const distance = calculateDistance(lat, lon, placeLat, placeLon);
      return { ...place, distance };
    }) as MongoPlaceDocument[];
}

private isValidPlace(place: MongoPlaceDocument): string | boolean {
  return place && place.name && place.coordinates && Array.isArray(place.coordinates.coordinates) && place.coordinates.coordinates.length === 2;
}

private removeDuplicates(place: MongoPlaceDocument, index: number, self: MongoPlaceDocument[]): boolean {
  return index === self.findIndex(p => 
    p && place && 
    p.name === place.name && 
    p.coordinates && place.coordinates &&
    Array.isArray(p.coordinates.coordinates) && Array.isArray(place.coordinates.coordinates) &&
    Math.abs(p.coordinates.coordinates[0] - place.coordinates.coordinates[0]) < 0.0001 &&
    Math.abs(p.coordinates.coordinates[1] - place.coordinates.coordinates[1]) < 0.0001
  );
}
}