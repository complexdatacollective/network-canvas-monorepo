# syntax=docker/dockerfile:1
# Network Canvas Studio's two images (#1909), from one pruned build.
#
#   studio-api   node:24-slim, the server bundle. Its entrypoint dispatches on
#                the first argument, so one image runs every Studio process:
#
#                  serve            HTTP, RPC and the WebSocket endpoint
#                  worker           background jobs and cron schedules (#1895)
#                  migrate          create this build's schema in an empty
#                                   database, once per deployment
#                  maintenance on   close the instance to users — a stub until
#                  maintenance off    #1901 merges
#                  rotate-secrets   re-encrypt stored secrets — a stub until
#                                     #1900 merges
#
#   studio-web   nginx, the built SPA and the maintenance page. It proxies
#                nothing: Traefik is the single ingress and routes the API's
#                paths to studio-api and everything else here, so the browser
#                sees one origin.
#
# The split is the 2026-09-15 ruling on #1909: a Node container for the API and
# a separate web server for the frontend. Before it, one image served both and
# the API held a static-file mount; nothing in the server serves client assets
# any more.
#
# Neither image sets STUDIO_DEPLOYMENT_MODE, so a self-host gets the
# fail-closed default and refuses the managed-only surfaces (pricing, the
# sign-up funnel, billing). The managed deployment sets it in the container
# environment — at run time, not here, which is what lets one image serve both
# topologies.
#
# There is deliberately no image-level HEALTHCHECK: the entrypoint decides
# which process runs, and a check that suited `serve` would be wrong for
# `worker` and meaningless for `migrate`. The check belongs to the compose
# service, and the contract each process offers is in apps/studio/README.md —
# `serve` answers GET /healthz on PORT, `worker` answers GET /readyz on
# 127.0.0.1:WORKER_HEALTH_PORT.
#
# Build both from the monorepo root:
#
#   docker build -f apps/studio/Dockerfile --target studio-api -t studio-api .
#   docker build -f apps/studio/Dockerfile --target studio-web -t studio-web .

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

FROM node:24-slim AS studio-api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /deploy .
# dist/ carries the three entries and dist/schema-ddl.json beside them: the
# statements `migrate` executes, rendered at build time because drizzle-kit is
# a development dependency and `pnpm deploy --prod` installs none.
COPY --from=builder /repo/apps/studio/server/dist ./dist
COPY apps/studio/server/bin/studio-api /usr/local/bin/studio-api
USER node
EXPOSE 3000
ENTRYPOINT ["studio-api"]
CMD ["serve"]

FROM nginx:1.29-alpine AS studio-web
COPY --from=builder /repo/apps/studio/client/dist /usr/share/nginx/html
COPY apps/studio/client/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
