# syntax=docker/dockerfile:1
# Build from the monorepo root. This image has no Studio server or SPA entrypoint.
FROM node:24.18.0-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS base
RUN npm install --global pnpm@11.20.0

FROM base AS pruner
WORKDIR /repo
COPY . .
RUN pnpm dlx turbo@2.10.4 prune @codaco/template-registry --docker

FROM base AS builder
WORKDIR /repo
ENV HUSKY=0
COPY --from=pruner /repo/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
RUN pnpm --filter @codaco/template-registry build
RUN pnpm --filter @codaco/template-registry deploy --prod --legacy /deploy

FROM node:24.18.0-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS runner
ARG SOURCE_REVISION
LABEL org.opencontainers.image.source="https://github.com/complexdatacollective/network-canvas-monorepo" \
  org.opencontainers.image.revision="${SOURCE_REVISION}"
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /deploy .
COPY --from=builder /repo/apps/template-registry/dist ./dist
COPY --from=builder /repo/apps/template-registry/migrations ./migrations
COPY --from=builder /repo/apps/template-registry/spec ./spec
USER node
# Import every runtime entry from the exact production dependency closure.
# import.meta.main stays false, so this never reads deployment configuration.
RUN node --input-type=module -e "await Promise.all(['index', 'migrate', 'operator', 'backup'].map((entry) => import('./dist/' + entry + '.js')))"
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT ?? 3000}/healthz`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
ENTRYPOINT ["node"]
CMD ["dist/index.js"]
