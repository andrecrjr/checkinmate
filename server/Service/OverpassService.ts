import axios, { AxiosError } from 'axios';
import mongoose from 'mongoose';
import type { PlaceDocument, ApiError } from '../../types';
import type { PlaceDocument as PlaceDocumentZod, CoordinateInput } from '../schemas/validation';
import { getPlaceModel } from '../Model/Place';
import { logger } from '../logger';

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
    'road',
    'building',
    'man_made',
    'natural'
  ];

  private static readonly LANDMARK_TAGS = [
    'tourism=attraction',
    'historic=monument',
    'historic=memorial',
    'historic=building',
    'landmark=yes',
    'tower=yes',
    'building=tower',
    'natural=peak',
    'natural=volcano',
    'man_made=tower',
    'man_made=obelisk',
    'man_made=monument',
    'building=church',
    'building=cathedral'
  ];

  private static readonly EXCLUDED_VALUES = [
    'bench',
    'waste_basket',
    'telephone',
    'parking',
    'parking_space'
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
      
      return places;
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
    try {
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
    return `
      [out:json][timeout:${timeout}];
      (
        // Specific landmark queries (highest priority)
        ${this.LANDMARK_TAGS.map(tag => `node(around:${radius},${lat},${lon})[${tag}];`).join('\n')}
        ${this.LANDMARK_TAGS.map(tag => `way(around:${radius},${lat},${lon})[${tag}];`).join('\n')}
        ${this.LANDMARK_TAGS.map(tag => `relation(around:${radius},${lat},${lon})[${tag}];`).join('\n')}
        
        // Explicit landmark search by name patterns
        node(around:${radius},${lat},${lon})["name"~"[Ee]iffel"];
        way(around:${radius},${lat},${lon})["name"~"[Ee]iffel"];
        relation(around:${radius},${lat},${lon})["name"~"[Ee]iffel"];
        node(around:${radius},${lat},${lon})["name"~"[Cc]hrist [Tt]he [Rr]edeemer"];
        way(around:${radius},${lat},${lon})["name"~"[Cc]hrist [Tt]he [Rr]edeemer"];
        relation(around:${radius},${lat},${lon})["name"~"[Cc]hrist [Tt]he [Rr]edeemer"];
        node(around:${radius},${lat},${lon})["name"~"[Ss]tatue [Oo]f [Ll]iberty"];
        way(around:${radius},${lat},${lon})["name"~"[Ss]tatue [Oo]f [Ll]iberty"];
        relation(around:${radius},${lat},${lon})["name"~"[Ss]tatue [Oo]f [Ll]iberty"];
        node(around:${radius},${lat},${lon})["name"~"[Tt]aj [Mm]ahal"];
        way(around:${radius},${lat},${lon})["name"~"[Tt]aj [Mm]ahal"];
        relation(around:${radius},${lat},${lon})["name"~"[Tt]aj [Mm]ahal"];
        node(around:${radius},${lat},${lon})["name"~"[Mm]ount [Ff]uji"];
        way(around:${radius},${lat},${lon})["name"~"[Mm]ount [Ff]uji"];
        relation(around:${radius},${lat},${lon})["name"~"[Mm]ount [Ff]uji"];
        node(around:${radius},${lat},${lon})["name"~"[Tt]ower"];
        way(around:${radius},${lat},${lon})["name"~"[Tt]ower"];
        relation(around:${radius},${lat},${lon})["name"~"[Tt]ower"];
        node(around:${radius},${lat},${lon})["name"~"[Mm]onument"];
        way(around:${radius},${lat},${lon})["name"~"[Mm]onument"];
        relation(around:${radius},${lat},${lon})["name"~"[Mm]onument"];
        node(around:${radius},${lat},${lon})["name"~"[Ss]tatue"];
        way(around:${radius},${lat},${lon})["name"~"[Ss]tatue"];
        relation(around:${radius},${lat},${lon})["name"~"[Ss]tatue"];
        
        // General tags for places of interest
        ${this.RELEVANT_TAGS.map(tag => `node(around:${radius},${lat},${lon})[${tag}];`).join('\n')}
        ${this.RELEVANT_TAGS.map(tag => `way(around:${radius},${lat},${lon})[${tag}];`).join('\n')}
        ${this.RELEVANT_TAGS.map(tag => `relation(around:${radius},${lat},${lon})[${tag}];`).join('\n')}
        
        // Named places with specific tourism/historic values
        node(around:${radius},${lat},${lon})["name"]["tourism"];
        way(around:${radius},${lat},${lon})["name"]["tourism"];
        relation(around:${radius},${lat},${lon})["name"]["tourism"];
        node(around:${radius},${lat},${lon})["name"]["historic"];
        way(around:${radius},${lat},${lon})["name"]["historic"];
        relation(around:${radius},${lat},${lon})["name"]["historic"];
      );
      out body center;
      >;
      out skel qt;
    `;
  }

  private static parseResponse(data: any): PlaceDocument[] {
    if (!data.elements) {
      logger.warn('No elements found in Overpass API response');
      return [];
    }

    logger.info(`Processing ${data.elements.length} elements from Overpass API`);
    
    const filteredElements = data.elements.filter((element: any) => {
      const hasName = element.tags?.name;
      const isExcluded = this.EXCLUDED_VALUES.some((excluded) => {
        // Check if any relevant tag has an excluded value
        return this.RELEVANT_TAGS.some((tag) => element.tags?.[tag] === excluded) ||
               // Check if any landmark tag has an excluded value
               element.tags?.[excluded] !== undefined;
      });
      
      const hasCoordinates = (element.lat && element.lon) || (element.center?.lat && element.center?.lon);
      
      const shouldInclude = hasName && !isExcluded && hasCoordinates;
      
      if (!shouldInclude && hasName) {
        logger.info(`Filtering out element: ${element.tags?.name} - hasName: ${!!hasName}, isExcluded: ${isExcluded}, hasCoordinates: ${!!hasCoordinates}`);
        if (element.tags) {
          logger.info(`  Tags: ${JSON.stringify(element.tags)}`);
        }
      }
      
      return shouldInclude;
    });
    
    logger.info(`Filtered to ${filteredElements.length} elements after exclusion checks`);

    return filteredElements.map((element: any) => {
      // Determine the most appropriate category
      let category = 'other';
      
      // Check landmark tags first (higher priority)
      for (const tag of this.LANDMARK_TAGS) {
        const [key, value] = tag.split('=');
        if (element.tags?.[key] === value) {
          category = value !== 'yes' ? value : key;
          break;
        }
      }
      
      // If no landmark tag found, check general tags
      if (category === 'other') {
        const foundTag = this.RELEVANT_TAGS.find((tag) => element.tags?.[tag]);
        if (foundTag) {
          category = element.tags[foundTag] === 'yes' ? foundTag : element.tags[foundTag];
        }
      }
      
      // Special case for tourism and historic tags
      if (category === 'other' && element.tags?.tourism) {
        category = element.tags.tourism === 'yes' ? 'tourism' : element.tags.tourism;
      }
      
      if (category === 'other' && element.tags?.historic) {
        category = element.tags.historic === 'yes' ? 'historic' : element.tags.historic;
      }
      
      const lat = element.lat ? parseFloat(element.lat) : parseFloat(element.center.lat);
      const lon = element.lon ? parseFloat(element.lon) : parseFloat(element.center.lon);
      
      const place = {
        name: element.tags.name,
        address: element.tags['addr:street'] || 'Unknown address',
        coordinates: {
          type: 'Point',
          coordinates: [lon, lat],
        },
        category: category,
        source: 'overpass',
        updatedAt: new Date(),
      };
      
      logger.info(`Processing place: ${place.name} with category: ${place.category}`);
      return place;
    });
  }
}

export default OverpassService;