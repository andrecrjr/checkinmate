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

export interface PlaceDocument extends PlaceBase, Document {
  metadata: any;
}
export type PlaceResult = Omit<PlaceBase, 'updatedAt'> & { updatedAt: string };