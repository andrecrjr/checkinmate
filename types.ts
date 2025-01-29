// Interfaces atualizadas
export interface GeoJSONPoint {
  type: 'Point';
  coordinates: [number, number];
}

export interface PlaceBase {
  name: string;
  address?: string;
  coordinates: GeoJSONPoint;
  category?: string;
  source: 'overpass' | 'mongodb';
  updatedAt: Date;
}

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

export type PlaceResult = Omit<PlaceBase, 'updatedAt'> & { updatedAt: string };