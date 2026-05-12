# ─── Stage 1: Build frontend ─────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .

# Feature flags (Vite reads VITE_* env vars at build time and inlines them
# into the bundle via import.meta.env). Override via:
#   docker compose build --build-arg VITE_ENABLE_COACH=false frontend
ARG VITE_ENABLE_COACH=true
ENV VITE_ENABLE_COACH=$VITE_ENABLE_COACH

RUN npm run build

# ─── Stage 2: Serve via nginx ────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
