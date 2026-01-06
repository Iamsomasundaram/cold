# detector-service/Dockerfile

# Use a slim Node image
FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Install dependencies
# Copy only package files first to leverage Docker layer cache
COPY package*.json ./

# Install only production dependencies
RUN npm install --only=production

# Copy source code
COPY src ./src

# Expose HTTP port for /health and /metrics
EXPOSE 4001

# Default command
CMD ["node", "src/server.js"]
