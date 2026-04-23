FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ─── Runtime ─────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Copy only production dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Runtime data directory (mount a volume here for persistence)
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV ES_HTTP_ONLY=true

EXPOSE 3333

CMD ["node", "dist/index.js"]
