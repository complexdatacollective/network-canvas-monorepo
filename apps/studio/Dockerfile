# syntax=docker/dockerfile:1
# Network Canvas Studio — the self-host artifact (#1245): one image containing
# the Node server plus the built client assets, which the server serves
# itself. The managed topology runs this same image behind a CDN that serves
# the client assets instead. Release manifests identify the full source commit
# and each component's dependency closure, including shared RPC/sync changes.
#
# The image deliberately sets no STUDIO_DEPLOYMENT_MODE, so a self-host gets
# the fail-closed default and refuses the managed-only surfaces (pricing, the
# sign-up funnel, billing) with a 404. The managed deployment sets
# STUDIO_DEPLOYMENT_MODE=managed in its container environment — at runtime, not
# in this file, which is what lets one image serve both topologies.
#
# Build from the monorepo root:
#
#   docker build -f apps/studio/Dockerfile -t network-canvas-studio .

FROM node:24.18.0-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS base
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
# Turbo's pruned workspace omits these shared build inputs because they are
# outside both package roots. Copy the exact candidate bytes from the pruner
# stage so the client and server Vite configurations resolve the same plugins.
COPY --from=pruner /repo/apps/studio/scripts/telemetry-plugins.ts ./apps/studio/scripts/telemetry-plugins.ts
COPY --from=pruner /repo/scripts/posthog-source-maps-plugin.ts ./scripts/posthog-source-maps-plugin.ts
RUN pnpm --filter @codaco/studio-client build && pnpm --filter @codaco/studio-server build
RUN pnpm --filter @codaco/studio-server deploy --prod --legacy /deploy

FROM node:24.18.0-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /deploy .
COPY --from=builder /repo/apps/studio/server/dist ./dist
COPY --from=builder /repo/apps/studio/server/migrations ./migrations
COPY --chmod=755 apps/studio/docker-entrypoint.sh ./docker-entrypoint.sh
COPY apps/studio/docker-compose.yml apps/studio/SELF_HOSTING.md apps/studio/MIGRATIONS.md apps/studio/BACKUPS.md ./deployment-bundle/
COPY apps/studio/deployment ./deployment-bundle/deployment
# The server's default CLIENT_DIST resolves to ../client relative to the
# bundle — this directory.
COPY --from=builder /repo/apps/studio/client/dist ./client
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT ?? 3000}/healthz`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["serve"]
