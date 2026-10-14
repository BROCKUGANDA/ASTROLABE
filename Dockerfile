# ASTROLABE — employee journey companion.
#
# Three stages: resolve, build, then run only Next's standalone output so the
# image carries no toolchain, no source map of the app, and no dev dependencies.
# The synthetic data pack is compiled into the bundle, so the container needs no
# database to serve the journey engine; DATABASE_URL only backs /api/readyz.

FROM oven/bun:1.4.2-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.4.2-alpine AS build
WORKDIR /app
# `next build` runs the config validation with NODE_ENV=production, and the
# config treats a missing DATABASE_URL as fatal — so the build needs it too, not
# only the running server. Absolute path: a relative SQLite URL is resolved
# against prisma/schema.prisma, which does not exist in the standalone output.
ENV DATABASE_URL=file:/app/db/custom.db
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

FROM oven/bun:1.4.2-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATABASE_URL=file:/app/db/custom.db
# SESSION_SECRET is required in production and deliberately has no default: an
# unset key makes sign-in fail loudly rather than run on a known secret. Pass it
# with -e, and mount /app/db if you want /api/readyz to see a real database.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/api/healthz >/dev/null || exit 1
CMD ["bun", "server.js"]
