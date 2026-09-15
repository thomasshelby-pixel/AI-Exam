# Multi-stage Dockerfile optimized for Google Cloud Run
FROM node:22-slim AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
RUN npm ci || npm install

# Copy source files
COPY . .

# Build Vite client assets and compile server bundle to dist/server.cjs
RUN npm run build

# Runtime container
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy compiled bundles and persistent resources
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/data ./data
COPY --from=builder /app/metadata.json ./metadata.json
COPY --from=builder /app/firebase-applet-config.json* ./
COPY --from=builder /app/firebase-blueprint.json* ./
COPY --from=builder /app/firestore.rules* ./
COPY --from=builder /app/storage.rules* ./

EXPOSE 8080

# Start production server (binds dynamically to 0.0.0.0:$PORT)
CMD ["npm", "start"]
