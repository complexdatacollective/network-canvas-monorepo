# syntax=docker/dockerfile:1
# Network Canvas Studio — one image containing the built SPA and the Hono
# server, per the framework ADR (#1245): Node + Postgres only, no vendor
# coupling. Build from the monorepo root:
#
#   docker build -f apps/studio/Dockerfile -t network-canvas-studio .

FROM node:24-slim AS base
RUN npm install --global pnpm@11.20.0

# Prune the monorepo to the subset @codaco/studio needs.
FROM base AS pruner
WORKDIR /repo
COPY . .
RUN pnpm dlx turbo@2.10.4 prune @codaco/studio --docker

# Install with the pruned lockfile, then build client and server bundles and
# assemble a production-only deployment (package.json + prod node_modules).
FROM base AS builder
WORKDIR /repo
# No .git in the build context; skip the root husky prepare script.
ENV HUSKY=0
COPY --from=pruner /repo/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
RUN pnpm --filter @codaco/studio build
RUN pnpm --filter @codaco/studio deploy --prod --legacy /deploy

FROM node:24-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /deploy .
COPY --from=builder /repo/apps/studio/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT ?? 3000}/healthz`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/server/index.js"]
