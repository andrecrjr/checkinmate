# CheckinMate

A geolocation-based API service built with Elysia.js and MongoDB.

## Installation

To install dependencies:

```bash
bun install
```

## Running the Application

To run in development mode:

```bash
bun run dev
```

To run in production mode:

```bash
bun run server/index.ts
```

## Running Tests

To run tests:

```bash
bun test
```

See `tests/README.md` for more information about the test suite.

## API Documentation

Once the server is running, visit `http://localhost:3000/api/v1/swagger` for interactive API documentation.

## Project Structure

- `server/` - Main application code
- `server/Controller/` - Business logic controllers
- `server/Model/` - Database models
- `server/Routes/` - API route definitions
- `server/schemas/` - Zod validation schemas
- `server/Service/` - External service integrations
- `tests/` - Test files

This project was created using `bun init` in bun v1.1.29. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
