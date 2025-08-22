# CheckinMate Tests

This directory contains basic tests for the main functionalities of the CheckinMate application.

## Test Files

1. **geo.test.ts** - Tests for geolocation functions, specifically the Haversine distance calculation
2. **routes.test.ts** - Tests for API routes to ensure they exist and respond correctly
3. **validation.test.ts** - Tests for Zod validation schemas and helper functions
4. **controller.test.ts** - Tests for the GeoPlaceController instantiation and basic properties

## Running Tests

To run all tests:

```bash
bun test
```

To run tests for a specific file:

```bash
bun test tests/geo.test.ts
```

## Test Coverage

The tests cover:

- Geolocation distance calculations
- API route existence and basic responses
- Input validation for coordinates, radius, and pagination
- Controller instantiation and property assignment

These are basic tests to ensure the core functionality works as expected.