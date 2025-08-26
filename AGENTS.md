# CheckinMate Project Context

## Project Overview

CheckinMate is a geolocation-based API service built with Elysia.js (a fast TypeScript web framework) and MongoDB. The application provides endpoints for searching places based on geographical coordinates, with data sourced from both MongoDB and the Overpass API (OpenStreetMap).

## Init Project
- You should always run the server with the `make run` command in the terminal.
- Test `test.http` in curls in terminal to easier test requests.

### Key Features
- Geospatial search with MongoDB's 2dsphere indexing
- Integration with OpenStreetMap's Overpass API, for additional place data
- LRU caching for improved performance
- Comprehensive input validation using Zod schemas
- Structured logging with Pino
- Rate limiting to prevent API abuse
- Docker containerization for easy deployment
- Swagger documentation for API endpoints

### Technologies Used - use mcp context7 to search about if necessary
- **Runtime**: Bun (JavaScript/TypeScript runtime)
- **Framework**: Elysia.js (TypeScript-focused web framework)
- **Database**: MongoDB with Mongoose ODM
- **Validation**: Zod (TypeScript-first schema declaration and validation)
- **Logging**: Pino with pino-pretty for structured logging
- **Caching**: lru-cache for in-memory caching
- **Containerization**: Docker and Docker Compose
- **Geospatial Calculations**: Haversine formula implementation
- **OverPass API**: Integration for additional place data, using OverpassQL

## Development Conventions 

### Architecture
1. **MVC-inspired Pattern**: Separation of concerns with Models, Controllers, and Routes
2. **Dependency Injection**: Services and models are injected into controllers
3. **Validation First**: All inputs are validated using Zod schemas before processing
4. **Structured Logging**: All operations are logged with contextual information
5. **Error Handling**: Centralized error handling with proper HTTP status codes


### Data Flow
1. Request received by Elysia route handler
2. Input validation using Zod schemas
3. Rate limiting middleware
4. Controller method execution
5. Model/database interaction or external API calls
6. Caching layer for performance
7. Response formatting and return

### Geospatial Implementation
1. MongoDB's 2dsphere index for efficient geospatial queries
2. GeoNear aggregation pipeline for distance calculations
3. Haversine formula for client-side distance calculations
4. Coordinate validation to ensure valid latitude/longitude values

## Testing
The project includes a test.http file with example requests for:
- Health check endpoint
- Valid place search queries
- Invalid parameter handling
- Edge cases (excessive radius/limit values)

## Future Considerations
1. Add authentication and authorization middleware
2. Implement more comprehensive unit and integration tests
3. Add metrics and monitoring endpoints
4. Implement data seeding for initial place data
5. Add data import functionality for bulk place data
