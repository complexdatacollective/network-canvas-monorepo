# syntax=docker/dockerfile:1
# Build from the monorepo root. The final image contains one bundled collector
# artifact; it does not need a repository checkout or runtime node_modules.
FROM node:24.18.0-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS builder
RUN npm install --global pnpm@11.20.0
WORKDIR /repo
ENV HUSKY=0
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm run studio:managed-log-collector:build
ARG SOURCE_REVISION
RUN node -e "if (!/^[a-f0-9]{40}$/.test(process.argv[1])) process.exit(1)" "${SOURCE_REVISION}"
RUN printf '%s\n' "${SOURCE_REVISION}" > dist/studio-managed-log-collector/SOURCE_REVISION

FROM node:24.18.0-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS runner
ARG SOURCE_REVISION
LABEL org.opencontainers.image.source="https://github.com/complexdatacollective/network-canvas-monorepo" \
  org.opencontainers.image.revision="${SOURCE_REVISION}"
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder --chown=node:node /repo/dist/studio-managed-log-collector/collector.mjs ./collector.mjs
COPY --from=builder --chown=node:node /repo/dist/studio-managed-log-collector/SOURCE_REVISION ./SOURCE_REVISION
USER node
RUN node --check collector.mjs
# Loading the complete artifact with no configuration must stop before a NATS
# connection, usage query, anchor call, or log request can be attempted.
RUN node collector.mjs >/tmp/collector.stdout 2>/tmp/collector.stderr; \
  collector_status=$?; \
  test "${collector_status}" -eq 1; \
  test ! -s /tmp/collector.stdout; \
  test "$(cat /tmp/collector.stderr)" = STUDIO_COLLECTOR_CONFIGURATION_INVALID; \
  rm /tmp/collector.stdout /tmp/collector.stderr
ENTRYPOINT ["node", "/app/collector.mjs"]
