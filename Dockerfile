# Use Node.js 18 Alpine as base image
FROM node:18-alpine

# Create app directory
WORKDIR /app

# Install dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY src/ ./src/

# Create config directory
RUN mkdir -p /app/config

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S slaking -u 1001 -G nodejs

# Change ownership of the app directory
RUN chown -R slaking:nodejs /app

# Switch to non-root user
USER slaking

# Expose ports
EXPOSE 3000 9090

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["node", "src/index.js"] 