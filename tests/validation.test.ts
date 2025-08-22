import { describe, it, expect } from 'bun:test';
import { 
  PlaceQuerySchema, 
  PaginationSchema, 
  validateCoordinates, 
  validateRadius 
} from '../server/schemas/validation';

describe('Validation Schemas', () => {
  it('should validate correct place query parameters', () => {
    const validData = {
      lat: 40.7128,
      lon: -74.0060,
      radius: 1000,
      page: 1,
      limit: 10,
      cache: false
    };

    expect(() => PlaceQuerySchema.parse(validData)).not.toThrow();
  });

  it('should reject invalid latitude values', () => {
    const invalidData = {
      lat: 91, // Invalid latitude
      lon: -74.0060,
      radius: 1000
    };

    expect(() => PlaceQuerySchema.parse(invalidData)).toThrow();
  });

  it('should reject invalid longitude values', () => {
    const invalidData = {
      lat: 40.7128,
      lon: 181, // Invalid longitude
      radius: 1000
    };

    expect(() => PlaceQuerySchema.parse(invalidData)).toThrow();
  });

  it('should reject radius values outside allowed range', () => {
    // Test radius too small
    expect(() => PlaceQuerySchema.parse({ lat: 40.7128, lon: -74.0060, radius: 50 })).toThrow();
    
    // Test radius too large
    expect(() => PlaceQuerySchema.parse({ lat: 40.7128, lon: -74.0060, radius: 6000 })).toThrow();
  });

  it('should validate correct pagination parameters', () => {
    const validData = {
      page: 1,
      limit: 10
    };

    expect(() => PaginationSchema.parse(validData)).not.toThrow();
  });

  it('should reject invalid pagination parameters', () => {
    // Test negative page
    expect(() => PaginationSchema.parse({ page: -1, limit: 10 })).toThrow();
    
    // Test limit too high
    expect(() => PaginationSchema.parse({ page: 1, limit: 101 })).toThrow();
  });
});

describe('Validation Helper Functions', () => {
  it('should validate correct coordinates', () => {
    expect(validateCoordinates(40.7128, -74.0060)).toBe(true);
    expect(validateCoordinates(-90, -180)).toBe(true);
    expect(validateCoordinates(90, 180)).toBe(true);
  });

  it('should reject invalid coordinates', () => {
    expect(validateCoordinates(91, -74.0060)).toBe(false);
    expect(validateCoordinates(40.7128, 181)).toBe(false);
    expect(validateCoordinates(-91, -180)).toBe(false);
    expect(validateCoordinates(90, -181)).toBe(false);
  });

  it('should validate correct radius values', () => {
    expect(validateRadius(100)).toBe(true);
    expect(validateRadius(1000)).toBe(true);
    expect(validateRadius(5000)).toBe(true);
  });

  it('should reject invalid radius values', () => {
    expect(validateRadius(99)).toBe(false);
    expect(validateRadius(5001)).toBe(false);
    expect(validateRadius(-1)).toBe(false);
  });
});