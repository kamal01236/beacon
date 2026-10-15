# Beacon — the full server target (UI + /api + the agent brain) in a container.
#
# Two processes come out of ONE image, because they must run the same code:
#   the app     node server.js            (serves the UI and /api)
#   the clock   node agent/run.mjs        (triggers POST /api/agent/run)
# docker-compose.yml runs both; see docs/OPERATIONS.md.
#
# Notes that matter at runtime:
#   • Next's standalone output is used, so the runtime stage carries a server
#     bundle instead of node_modules.
#   • data/ IS a runtime dependency, not just build input: with no database the
#     base snapshot is read from data/*.json through the faked Jira adapter, and
#     data/kb.json backs the blocker suggestions.
#   • .data/ (the no-database event log) must be a VOLUME. Without one, every
#     recorded decision is lost when the container is replaced.
#   • The image runs as a non-root user and declares a health check that uses
#     the real readiness endpoint.

# ---- dependencies ----------------------------------------------------------
FROM node:20.19-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` for a reproducible install; dev dependencies are needed to build.
RUN npm ci

# ---- build -----------------------------------------------------------------
FROM node:20.19-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# A standalone server bundle (next.config.mjs reads this).
ENV BEACON_OUTPUT=standalone
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Passed by CI so /api/health can name the exact commit it is serving.
ARG BEACON_COMMIT=unknown
ENV BEACON_COMMIT=$BEACON_COMMIT
RUN npx next build

# ---- runtime ---------------------------------------------------------------
FROM node:20.19-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Structured single-line JSON logs for a log shipper (lib/server/log.ts).
ENV BEACON_LOG_FORMAT=json

# wget is used by the health check; curl is not in the base image.
RUN apk add --no-cache wget

# Next's standalone bundle, its static assets, and the public folder.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Runtime data: the base snapshot and the knowledge base.
COPY --from=build /app/data ./data
# The agent worker, the retention clock and the seeding script all run from
# this same image (they are small, and they must match the app's version).
COPY --from=build /app/agent ./agent
COPY --from=build /app/scripts ./scripts
# The schema, so an operator can seed a fresh database from the running image.
COPY --from=build /app/db ./db

# The no-database event log lives here; mount a volume over it in compose.
RUN mkdir -p /app/.data && chown -R node:node /app/.data
USER node

EXPOSE 3000

# Readiness, not just liveness: /api/health probes the store. A degraded store
# (configured database unreachable) still answers 200 and is visible in the
# body; an unreadable one answers 503 and fails this check.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1

CMD ["node", "server.js"]
