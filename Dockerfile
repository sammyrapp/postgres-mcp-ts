# ---- Build stage ----
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files and .npmrc (needed for JSR registry @hono/mcp)
COPY package*.json .npmrc ./
RUN npm ci

COPY tsconfig.json tsup.config.ts ./
COPY src ./src
RUN npm run build

# ---- Production stage ----
FROM node:24-alpine

WORKDIR /app

# Copy package files and .npmrc for production install
COPY package*.json .npmrc ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Cloud Run injects PORT (default 8080) — app reads it from env via config.ts
# Do NOT use npm start here; that script uses --env-file=.env which won't exist
CMD ["node", "dist/index.js"]
