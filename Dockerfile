# syntax=docker/dockerfile:1

# ============================================================================
# Battery Run is plain static files — no build step, no bundler, no runtime
# dependencies. The only job here is to ship them behind a non-root nginx on
# 8080, the same base every other Stage Zero static game uses (see
# sz-battery-game, sz-zero-hour-game, sz-loadbreaker-game).
# ============================================================================
FROM nginxinc/nginx-unprivileged:1.27-alpine

LABEL org.opencontainers.image.title="sz-battery-run-game" \
      org.opencontainers.image.description="Battery Run — a 30-second lane runner for Stage Zero activations" \
      org.opencontainers.image.vendor="Stage Zero"

COPY nginx.conf /etc/nginx/conf.d/default.conf

WORKDIR /usr/share/nginx/html
COPY index.html style.css game.js ./

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/healthz || exit 1
