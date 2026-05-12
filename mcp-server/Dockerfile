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

# Bake read-only Coach assets at paths OUTSIDE the volume mount (/app/data),
# so they survive even when an empty named-volume is mounted on first start.
# - prompts/system_prompt.md → loaded via COACH_SYSTEM_PROMPT_FILE env
# - CLAUDE.md → loadBaseDddGuide() second fallback (resolve(cwd, 'CLAUDE.md'))
COPY data/coach/system_prompt.md /app/prompts/system_prompt.md
COPY CLAUDE.md /app/CLAUDE.md

# Runtime data directory (volume mounts here for persistence:
#   /app/data/project.json + /app/data/coach/sessions|pending|audit)
RUN mkdir -p /app/data/coach

ENV NODE_ENV=production
ENV ES_HTTP_ONLY=true
ENV COACH_DATA_DIR=/app/data/coach
ENV COACH_SYSTEM_PROMPT_FILE=/app/prompts/system_prompt.md

EXPOSE 3333

CMD ["node", "dist/index.js"]
