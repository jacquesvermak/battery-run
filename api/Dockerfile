# syntax=docker/dockerfile:1

# ============================================================================
# Tiny SQLite-backed top-10 leaderboard API for Battery Run. better-sqlite3
# needs a native build, hence the build tools — everything else here is
# plain Express on Node's own base image, no framework beyond that.
# ============================================================================
FROM node:20-alpine

LABEL org.opencontainers.image.title="sz-battery-run-leaderboard-api" \
      org.opencontainers.image.description="Tiny SQLite-backed top-10 leaderboard API for Battery Run" \
      org.opencontainers.image.vendor="Stage Zero"

RUN apk add --no-cache python3 make g++ sqlite

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY server.js ./

RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/healthz', r => process.exit(r.statusCode===200?0:1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
