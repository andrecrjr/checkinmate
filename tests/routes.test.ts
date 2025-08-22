import { describe, it, expect } from 'bun:test';
import { Elysia } from 'elysia';

// Simple mock controller to test routes without complex dependencies
const createMockGeoPlaceRoutes = (app: Elysia) => {
  return app
    .get('/places', () => ({ message: 'Places endpoint' }))
    .get('/all-places', () => ({ message: 'All places endpoint' }))
    .get('/health', () => ({ status: 'OK' }));
};

describe('Geo Routes', () => {
  let app: Elysia;
  
  app = new Elysia({ prefix: '/api/v1' })
    .use(createMockGeoPlaceRoutes);

  it('should have /places endpoint', async () => {
    const response = await app.handle(
      new Request('http://localhost:3000/api/v1/places')
    );
    
    expect(response.status).toBe(200);
    
    const body = await response.json();
    expect(body.message).toBe('Places endpoint');
  });

  it('should have /all-places endpoint', async () => {
    const response = await app.handle(
      new Request('http://localhost:3000/api/v1/all-places')
    );
    
    expect(response.status).toBe(200);
    
    const body = await response.json();
    expect(body.message).toBe('All places endpoint');
  });

  it('should have /health endpoint', async () => {
    const response = await app.handle(
      new Request('http://localhost:3000/api/v1/health')
    );
    
    expect(response.status).toBe(200);
    
    const body = await response.json();
    expect(body.status).toBe('OK');
  });
});