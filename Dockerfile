FROM node:lts-alpine AS base
RUN apk update && apk add --no-cache libc6-compat

RUN npm install pnpm turbo@1.12.4 --global
RUN pnpm config set store-dir ~/.pnpm-store

# Copy the project files
WORKDIR /
COPY . .

# Build the project
FROM base AS builder
ARG PROJECT=apps/web-analytics

WORKDIR /

# Install dependencies
COPY . .
RUN corepack enable pnpm && pnpm i --no-frozen-lockfile

# Copy source code
COPY . .

# Build the project
RUN turbo build --filter=${PROJECT}

# Final image
FROM alpine AS runner
ARG PROJECT=apps/web-analytics

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nodejs

USER nodejs
WORKDIR /
COPY --from=builder --chown=nodejs:nodejs / .

WORKDIR /apps/${PROJECT}

EXPOSE 3000

ENV PORT 3000

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/next-config-js/output
CMD ["node", "server.js"]
