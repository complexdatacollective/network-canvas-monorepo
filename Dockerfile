FROM node:18-alpine AS base

FROM base AS builder
RUN apk add --no-cache libc6-compat
RUN apk update
# Set working directory
WORKDIR /app

# Install pnpm
RUN npm i -g pnpm
RUN npm install turbo -g
COPY . .
RUN turbo prune analytics --docker

# Add lockfile and package.json's of isolated subworkspace
FROM base AS installer
RUN apk add --no-cache libc6-compat
RUN apk update
WORKDIR /app

# First install the dependencies (as they change less often)
COPY .gitignore .gitignore
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml .
# Install pnpm
RUN npm i -g pnpm
RUN pnpm install

# Build the project
COPY --from=builder /app/out/full/ .
RUN npm turbo run build --filter=analytics...

FROM base AS runner
WORKDIR /app

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs

COPY --from=installer /app/apps/analytics/next.config.js .
COPY --from=installer /app/apps/analytics/package.json .

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=installer --chown=nextjs:nodejs /app/apps/analytics/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/analytics/.next/static ./apps/analytics/.next/static
COPY --from=installer --chown=nextjs:nodejs /app/apps/analytics/public ./apps/analytics/public

CMD node apps/analytics/server.js
