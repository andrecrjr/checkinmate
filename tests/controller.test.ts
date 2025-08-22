import { describe, it, expect } from 'bun:test';

// Mock logger
const mockLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {}
};

// Mock cache
const mockCache = {
  get: () => undefined,
  set: () => {},
  has: () => false,
  clear: () => {}
};

// Mock place model
const mockPlaceModel = {
  aggregate: () => Promise.resolve([]),
  find: () => ({
    skip: () => ({
      limit: () => ({
        lean: () => Promise.resolve([])
      })
    })
  }),
  countDocuments: () => Promise.resolve(0),
  db: {
    admin: () => ({
      ping: () => Promise.resolve()
    })
  }
};

describe('GeoPlace Controller', () => {
  it('should be able to instantiate the controller', async () => {
    // Dynamic import to avoid issues with dependencies
    const { GeoPlaceController } = await import('../server/Controller/Geoplace');
    
    const controller = new GeoPlaceController(mockPlaceModel as any, mockCache as any, mockLogger as any);
    
    expect(controller).toBeDefined();
    expect(typeof controller.getPlaces).toBe('function');
    expect(typeof controller.getAllPlaces).toBe('function');
    expect(typeof controller.healthCheck).toBe('function');
  });

  it('should have required properties', async () => {
    // Dynamic import to avoid issues with dependencies
    const { GeoPlaceController } = await import('../server/Controller/Geoplace');
    
    const controller = new GeoPlaceController(mockPlaceModel as any, mockCache as any, mockLogger as any);
    
    expect(controller.placeModel).toBe(mockPlaceModel);
    expect(controller.cache).toBe(mockCache);
    expect(controller.logger).toBe(mockLogger);
  });
});