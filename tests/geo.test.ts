import { describe, it, expect } from 'bun:test';
import { calculateDistance } from '../server/utils';

describe('Geo Functions', () => {
  it('should calculate distance correctly using Haversine formula', () => {
    // Test with known values
    // Distance between Statue of Liberty and Empire State Building ~ 8.2 km
    const lat1 = 40.6892;  // Statue of Liberty
    const lon1 = -74.0445;
    const lat2 = 40.7484;  // Empire State Building
    const lon2 = -73.9857;
    
    const distance = calculateDistance(lat1, lon1, lat2, lon2);
    
    // Should be approximately 8.2 km (8200 meters)
    expect(distance).toBeGreaterThan(8000);
    expect(distance).toBeLessThan(8500);
  });

  it('should return 0 distance for same coordinates', () => {
    const lat = 40.7128;
    const lon = -74.0060;
    
    const distance = calculateDistance(lat, lon, lat, lon);
    
    expect(distance).toBeCloseTo(0, 2);
  });

  it('should handle antipodal points correctly', () => {
    // Test with points on opposite sides of the Earth
    const distance = calculateDistance(0, 0, 0, 180);
    
    // Should be approximately half the Earth's circumference
    // Earth's circumference ≈ 40,075 km
    // Half ≈ 20,037.5 km
    expect(distance).toBeGreaterThan(20000000); // 20,000 km in meters
    expect(distance).toBeLessThan(21000000);   // 21,000 km in meters
  });
});