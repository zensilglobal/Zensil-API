# syntax=docker/dockerfile:1
# ---------- Zensil web (Next.js standalone) ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
# HOSTNAME must be 0.0.0.0: standalone server.js binds to it, and container
# runtimes (e.g. Render) otherwise set HOSTNAME to the container ID -> 502
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Python + the etl package: instrumentation.ts runs the warehouse sync
# in-process on a timer (external cron schedulers proved unreliable).
RUN apk add --no-cache python3 \
    && python3 -m venv /opt/etl-venv \
    && /opt/etl-venv/bin/pip install --no-cache-dir \
       "httpx>=0.27" "psycopg[binary]>=3.2" "pydantic-settings>=2.4" "tenacity>=9.0"
ENV ETL_PYTHON=/opt/etl-venv/bin/python
COPY --chown=nextjs:nodejs etl ./etl

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
