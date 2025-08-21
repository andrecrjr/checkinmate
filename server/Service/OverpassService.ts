import axios, { AxiosError } from 'axios';
import mongoose from 'mongoose';
import type { PlaceDocument, ApiError } from '../../types';
import type { PlaceDocument as PlaceDocumentZod, CoordinateInput } from '../schemas/validation';
import { getPlaceModel } from '../Model/Place';

/**
 * Enhanced OverpassService with improved TypeScript types and error handling
 * Provides geospatial data from OpenStreetMap via Overpass API
 */
class OverpassService {
  private static readonly BASE_URL = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
  private static readonly TIMEOUT = 30000;
  private static readonly PlaceModel = getPlaceModel();
  private static readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  private static readonly RELEVANT_TAGS = [
    'amenity',
    'tourism',
    'leisure',
    'historic',
    'shop',
    'road'
  ];

  private static readonly EXCLUDED_VALUES = [
    'bench',
    'waste_basket',
    'telephone',
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
        return cachedData;
      }

      const query = this.buildQuery(lat, lon, radius);
      const response = await axios.post(this.BASE_URL, query, {
        timeout: this.TIMEOUT,
        headers: { 'Content-Type': 'text/plain' },
      });

      const places = this.parseResponse(response.data);
      
      if (places.length > 0) {
        await this.storeInMongoDB(places);
      }
      
      return places;
    } catch (error) {
      console.error('Error in OverpassService:', error);
      
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
      return await (this.PlaceModel as any).find({
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
      }).exec();
    } catch (error) {
      console.warn('Failed to retrieve cached data from MongoDB:', error);
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

  private static async storeInMongoDB(places: PlaceDocument[]): Promise<void> {
    const bulkOps = places.map(place => ({
      updateOne: {
        filter: {
          name: place.name,
          'coordinates.coordinates': place.coordinates.coordinates,
          source: 'overpass'
        },
        update: {
          $set: {
            ...place,
            updatedAt: new Date()
          }
        },
        upsert: true
      }
    }));

    if (bulkOps.length > 0) {
      await (this.PlaceModel as any).bulkWrite(bulkOps, { ordered: false });
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
    return `
      [out:json][timeout:${timeout}];
      (
        ${this.RELEVANT_TAGS.map(tag => `node(around:${radius},${lat},${lon})[${tag}];`).join('\n')}
        ${this.RELEVANT_TAGS.map(tag => `way(around:${radius},${lat},${lon})[${tag}];`).join('\n')}
        ${this.RELEVANT_TAGS.map(tag => `relation(around:${radius},${lat},${lon})[${tag}];`).join('\n')}
      );
      out body center;
      >;
      out skel qt;
    `;
  }

  private static parseResponse(data: any): PlaceDocument[] {
    if (!data.elements) {
      console.warn('No elements found in Overpass API response');
      return [];
    }

    return data.elements
      .filter((element: any) => {
        const hasName = element.tags?.name;
        const isExcluded = this.EXCLUDED_VALUES.some((excluded) =>
          this.RELEVANT_TAGS.some((tag) => element.tags?.[tag] === excluded)
        );
        const hasCoordinates = (element.lat && element.lon) || (element.center?.lat && element.center?.lon);
        return hasName && !isExcluded && hasCoordinates;
      })
      .map((element: any) => {
        const category = this.RELEVANT_TAGS.find((tag) => element.tags?.[tag]) || 'other';
        const lat = element.lat ? parseFloat(element.lat) : parseFloat(element.center.lat);
        const lon = element.lon ? parseFloat(element.lon) : parseFloat(element.center.lon);
        
        return {
          name: element.tags.name,
          address: element.tags['addr:street'] || 'Unknown address',
          coordinates: {
            type: 'Point',
            coordinates: [lon, lat],
          },
          category: element.tags[category] === 'yes' ? category : element.tags[category],
          source: 'overpass',
          updatedAt: new Date(),
        };
      });
  }
}

export default OverpassService;