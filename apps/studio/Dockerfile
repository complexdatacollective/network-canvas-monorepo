# syntax=docker/dockerfile:1
# Network Canvas Studio — the self-host artifact (#1245): one image containing
# the Node server plus the built client assets, which the server serves
# itself. The managed topology runs this same image behind a CDN that serves
# the client assets instead; managed backend deploys key on
# @codaco/studio-server version changes, not on image rebuilds. Build from the
# monorepo root:
#
#   docker build -f apps/studio/Dockerfile -t network-canvas-studio .

FROM node:24-slim AS base
RUN npm install --global pnpm@11.20.0

# Prune the monorepo to the subset the two Studio deployables need.
FROM base AS pruner
WORKDIR /repo
COPY . .
RUN pnpm dlx turbo@2.10.4 prune @codaco/studio-server @codaco/studio-client --docker

# Install with the pruned lockfile, then build both halves and assemble a
# production-only deployment of the server (package.json + prod node_modules).
FROM base AS builder
WORKDIR /repo
# No .git in the build context; skip the root husky prepare script.
ENV HUSKY=0
COPY --from=pruner /repo/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
RUN pnpm --filter @codaco/studio-client build && pnpm --filter @codaco/studio-server build
RUN pnpm --filter @codaco/studio-server deploy --prod --legacy /deploy

FROM node:24-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /deploy .
COPY --from=builder /repo/apps/studio/server/dist ./dist
# The server's default CLIENT_DIST resolves to ../client relative to the
# bundle — this directory.
COPY --from=builder /repo/apps/studio/client/dist ./client
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT ?? 3000}/healthz`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/index.js"]
