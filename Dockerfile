# Use official Bun image
FROM oven/bun:latest

# Set working directory
WORKDIR /app

# Copy files
COPY . .

# Install dependencies
RUN bun install

# Expose the port
EXPOSE 3000

# Start the application
CMD ["bun", "run", "dev"]
