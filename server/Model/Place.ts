// src/models/Place.ts
import mongoose, { Schema, Document, Model } from 'mongoose';

export interface PlaceDocument extends Document {
  name: string;
  address: string;
  coordinates: {
    type: string;
    coordinates: [number, number];
  };
  category: string;
  source: 'overpass' | 'mongodb';
  updatedAt: Date;
  distance?: number;
}

// Define the schema
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
          return v.length === 2 && 
                 v[0] >= -180 && v[0] <= 180 && 
                 v[1] >= -90 && v[1] <= 90;
        },
        message: 'Invalid coordinates'
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
placeSchema.index({ name: 1, 'coordinates.coordinates': 1, source: 1 }, { unique: true });

// Model initialization function
export const getPlaceModel = (): Model<PlaceDocument> => {
  // Check if model already exists to prevent recompilation
  const modelExists = mongoose.modelNames().includes('Place');
  return modelExists 
    ? mongoose.model<PlaceDocument>('Place')
    : mongoose.model<PlaceDocument>('Place', placeSchema);
};

// Instance methods should be defined on the schema
placeSchema.methods.calculateDistance = function(lat: number, lon: number): number {
  const [placeLon, placeLat] = this.coordinates.coordinates;
  const R = 6371; // Earth's radius in kilometers

  const dLat = (lat - placeLat) * Math.PI / 180;
  const dLon = (lon - placeLon) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(placeLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  return R * c;
};

// Static methods
placeSchema.statics.findNearby = async function(
  lat: number, 
  lon: number, 
  radius: number,
  limit: number = 10
) {
  return this.aggregate([
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
    { $limit: limit }
  ]);
};

// Middleware
placeSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export default getPlaceModel;