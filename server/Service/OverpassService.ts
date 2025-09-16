import axios, { AxiosError } from 'axios';
import mongoose, { Types, Model } from 'mongoose';
import type { PlaceDocument, ApiError, PlaceData, OverpassElement } from '../../types';
import type { PlaceDocument as PlaceDocumentZod, CoordinateInput } from '../schemas/validation';
import { LRUCache } from 'lru-cache';
import pino from 'pino';
import { getPlaceModel } from '../Model/Place';
import { logger } from '../logger';

/**
 * Enhanced OverpassService with improved TypeScript types and error handling
 * Provides geospatial data from OpenStreetMap via Overpass API
 */
export class OverpassService {
  private static readonly BASE_URL = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
  private static readonly TIMEOUT = 30000;
  private static readonly PlaceModel: Model<PlaceDocument> = getPlaceModel();
  private static readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  private static readonly RELEVANT_TAGS = [
    'tourism',
    'historic',
    'amenity',
    'leisure',
    'shop',
    'building',
    'man_made',
    'natural',
    'landmark'
  ];

  private static readonly EXCLUDED_VALUES = [
    'bench',
    'waste_basket',
    'telephone',
    'parking',
    'parking_space',
    'no',
    'none',
    'unknown'
  ];

  /**
   * Query places from Overpass API with fallback to cached data
   * @param lat - Latitude coordinate
   * @param lon - Longitude coordinate  
   * @param radius - Search radius in meters
   * @returns Promise resolving to array of place documents
   * @throws ApiError with detailed error information
   */
  static async queryPlaces(lat: number, lon: number, radius: number): Promise<PlaceDocument[]> {
    try {
      // Validate input coordinates
      if (!this.isValidCoordinate(lat, lon, radius)) {
        throw new Error('Invalid coordinates or radius provided');
      }
      
      const cachedData = await this.getFromMongoDB(lat, lon, radius);
      
      if (this.isCacheValid(cachedData)) {
        logger.info(`Using cached data for ${lat},${lon} with radius ${radius}`);
        return cachedData;
      }

      const query = this.buildQuery(lat, lon, radius);
      logger.info(`Making Overpass API request for ${lat},${lon} with radius ${radius}`);
      
      const response = await axios.post(this.BASE_URL, query, {
        timeout: this.TIMEOUT,
        headers: { 'Content-Type': 'text/plain' },
      });

      logger.info(`Received ${response.data.elements?.length || 0} elements from Overpass API`);
      const places = this.parseResponse(response.data);
      logger.info(`Parsed ${places.length} places from Overpass API response`);
      
      if (places.length > 0) {
        // Try to store in MongoDB but don't fail if it doesn't work
        try {
          await this.storeInMongoDB(places);
        } catch (storageError) {
          logger.warn('Failed to store places in MongoDB, but returning results anyway:', storageError);
        }
      }
      
      return places as PlaceDocument[];
    } catch (error) {
      logger.error('Error in OverpassService:', error);
      
      // Fallback to cached data
      const cachedData = await this.getFromMongoDB(lat, lon, radius);
      if (cachedData.length > 0) {
        return cachedData;
      }
      
      const apiError = error as ApiError;
      throw new Error(`Failed to fetch data: ${apiError.message || 'Unknown error'}`);
    }
  }

  /**
   * Retrieve cached places from MongoDB
   */
  private static async getFromMongoDB(lat: number, lon: number, radius: number): Promise<PlaceDocument[]> {
    try {
      return await this.PlaceModel.find({
        coordinates: {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: [lon, lat]
            },
            $maxDistance: radius
          }
        },
        source: 'overpass'
      }).lean<PlaceDocument[]>();
    } catch (error) {
      logger.warn('Failed to retrieve cached data from MongoDB:', error);
      return [];
    }
  }

  /**
   * Validate coordinate inputs
   */
  private static isValidCoordinate(lat: number, lon: number, radius: number): boolean {
    return lat >= -90 && lat <= 90 && 
           lon >= -180 && lon <= 180 && 
           radius > 0 && radius <= 10000;
  }

  private static async storeInMongoDB(places: PlaceData[]): Promise<void> {
    try {
      const bulkOps = places.map(place => ({
        updateOne: {
          filter: {
            name: place.name,
            'coordinates.coordinates.0': place.coordinates.coordinates[0],
            'coordinates.coordinates.1': place.coordinates.coordinates[1]
          },
          update: {
            $set: {
              ...place,
              source: 'overpass', // Ensure source is always 'overpass' for Overpass data
              updatedAt: new Date()
            }
          },
          upsert: true
        }
      }));

      if (bulkOps.length > 0) {
        await this.PlaceModel.bulkWrite(bulkOps, { ordered: false });
      }
    } catch (error) {
      logger.error('Error storing places in MongoDB:', error);
      // Don't throw the error, just log it and continue
    }
  }

  private static isCacheValid(places: PlaceDocument[]): boolean {
    if (places.length === 0) return false;
    
    const now = new Date().getTime();
    const oldestAllowedUpdate = now - this.CACHE_DURATION;
    
    return places.every(place => 
      place.updatedAt.getTime() > oldestAllowedUpdate
    );
  }

  private static buildQuery(lat: number, lon: number, radius: number): string {
    const timeout = Math.floor(this.TIMEOUT / 1000);
    
    // Build queries for elements with English names and relevant tags
    let query = `[out:json][timeout:${timeout}];\n(\n`;
    
    // Add queries for nodes, ways, and relations with English names and relevant tags
    for (const tag of this.RELEVANT_TAGS) {
      query += `  node(around:${radius},${lat},${lon})[\"name:en\"][${tag}];\n`;
      query += `  way(around:${radius},${lat},${lon})[\"name:en\"][${tag}];\n`;
      query += `  relation(around:${radius},${lat},${lon})[\"name:en\"][${tag}];\n`;
    }
    
    // Add queries for any elements with English names
    query += `  node(around:${radius},${lat},${lon})[\"name:en\"];\n`;
    query += `  way(around:${radius},${lat},${lon})[\"name:en\"];\n`;
    query += `  relation(around:${radius},${lat},${lon})[\"name:en\"];\n`;
    
    // Add fallback queries for elements with default names and relevant tags
    for (const tag of this.RELEVANT_TAGS) {
      query += `  node(around:${radius},${lat},${lon})[\"name\"][${tag}];\n`;
      query += `  way(around:${radius},${lat},${lon})[\"name\"][${tag}];\n`;
      query += `  relation(around:${radius},${lat},${lon})[\"name\"][${tag}];\n`;
    }
    
    // Add fallback queries for any elements with default names
    query += `  node(around:${radius},${lat},${lon})[\"name\"];\n`;
    query += `  way(around:${radius},${lat},${lon})[\"name\"];\n`;
    query += `  relation(around:${radius},${lat},${lon})[\"name\"];\n`;
    
    query += `);\nout body center;\n>;\nout skel qt;`;
    
    return query;
  }

  private static parseResponse(data: { elements?: any[] }): PlaceData[] {
    if (!data.elements) {
      logger.warn('No elements found in Overpass API response');
      return [];
    }

    logger.info(`Processing ${data.elements.length} elements from Overpass API`);

    
    const filteredElements = data.elements.filter((element: OverpassElement) => {
      // Check for English name first, then fallback to default name
      const hasName = element.tags?.['name:en'] || element.tags?.name;
      const isExcluded = this.EXCLUDED_VALUES.some((excluded) => {
        // Check if any relevant tag has an excluded value
        return this.RELEVANT_TAGS.some((tag) => element.tags?.[tag] === excluded) ||
               // Check if any landmark tag has an excluded value
               element.tags?.[excluded] !== undefined;
      });
      
      // Additional check to exclude elements with no relevant tags
      const hasRelevantTag = this.RELEVANT_TAGS.some(tag => element.tags?.[tag] !== undefined);
      
      const hasCoordinates = (element.lat && element.lon) || (element.center?.lat && element.center?.lon);
      
      const shouldInclude = hasName && !isExcluded && hasCoordinates && hasRelevantTag;
      
      return shouldInclude;
    });
    
    logger.info(`Filtered to ${filteredElements.length} elements after exclusion checks`);

    return filteredElements.map((element: OverpassElement) => {
      // Determine the most appropriate category
      let category = 'other';
      
      // Check tags in order of priority
      for (const tag of this.RELEVANT_TAGS) {
        if (element.tags?.[tag]) {
          category = element.tags[tag] === 'yes' ? tag : element.tags[tag];
          break;
        }
      }
      
      const lat = element.lat ? parseFloat(element.lat) : parseFloat(element.center?.lat || '0');
      const lon = element.lon ? parseFloat(element.lon) : parseFloat(element.center?.lon || '0');
      
      // Use English name if available, otherwise fallback to default name
      const tags = element.tags || {};
      const name = tags['name:en'] || tags.name;
      
      // Generate a new ObjectId for this place
      const place: PlaceData = {
        _id: new Types.ObjectId(), // Generate a new ObjectId for the place
        name: name,
        address: tags['addr:street'] || 'Unknown address',
        coordinates: {
          type: 'Point' as const,
          coordinates: [lon, lat],
        },
        category: category,
        source: 'overpass' as const,
        updatedAt: new Date(),
      };
      
      return place;
    });
  }
}

export default OverpassService;