/**
 * Enhanced Place model with improved TypeScript types and validation
 * Integrates with Zod schemas for consistent validation across the application
 */
import mongoose, { Schema, Document, Model } from 'mongoose';
import type { PlaceDocument, PlaceModel } from '../../types';
import { PlaceDocumentSchema, CoordinateSchema } from '../schemas/validation';


// Enhanced schema with better validation and indexing
const placeSchema = new Schema<PlaceDocument>({
  name: { 
    type: String, 
    required: true,
    index: true 
  },
  address: { 
    type: String,
    default: 'Unknown address' 
  },
  coordinates: {
    type: {
      type: String,
      enum: ['Point'],
      required: true
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: function(v: number[]) {
          try {
            // Use Zod schema for validation
            CoordinateSchema.parse(v);
            return true;
          } catch {
            return false;
          }
        },
        message: 'Invalid coordinates: must be [longitude, latitude] within valid ranges'
      }
    }
  },
  category: {
    type: String,
    required: true,
    index: true
  },
  source: { 
    type: String, 
    enum: ['overpass', 'mongodb'], 
    required: true,
    index: true
  },
  updatedAt: { 
    type: Date, 
    default: Date.now,
    index: true 
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.__v;
      ret.id = ret._id;
      delete ret._id;
      return ret;
    }
  }
});

// Indexes
placeSchema.index({ coordinates: '2dsphere' });
// Enhanced unique index to prevent duplicate places from different sources
placeSchema.index({ name: 1, 'coordinates.coordinates.0': 1, 'coordinates.coordinates.1': 1 }, { unique: true, name: 'unique_place_name_coords' });

/**
 * Enhanced model initialization with proper typing
 * @returns PlaceModel with extended functionality
 */
export const getPlaceModel = (): PlaceModel => {
  // Check if model already exists to prevent recompilation
  const modelExists = mongoose.modelNames().includes('Place');
  const model = modelExists 
    ? mongoose.model<PlaceDocument>('Place')
    : mongoose.model<PlaceDocument>('Place', placeSchema);
  
  return model as unknown as PlaceModel;
};

// Static methods
/**
 * Enhanced static method with better error handling and validation
 */
placeSchema.statics.findNearby = async function(
  lat: number, 
  lon: number, 
  radius: number,
  limit: number = 10
): Promise<PlaceDocument[]> {
  try {
    // Validate coordinates using Zod
    CoordinateSchema.parse([lon, lat]);
    
    if (radius <= 0 || radius > 10000) {
      throw new Error('Radius must be between 1 and 10000 meters');
    }
    
    return await this.aggregate([
      {
        $geoNear: {
          near: { 
            type: 'Point', 
            coordinates: [lon, lat] 
          },
          distanceField: 'distance',
          maxDistance: radius,
          spherical: true
        }
      },
      { $limit: Math.min(limit, 100) }
    ]);
  } catch (error) {
    throw new Error(`Failed to find nearby places: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Middleware
placeSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export default getPlaceModel;