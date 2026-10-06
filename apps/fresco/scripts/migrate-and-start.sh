#!/bin/sh
set -e

# prisma + tsx are merged into /app/node_modules by the Docker runner stage, so
# their binaries live in ./node_modules/.bin. Call them by path so npx never
# falls back to a registry download at runtime.
PRISMA=./node_modules/.bin/prisma
TSX=./node_modules/.bin/tsx

"$PRISMA" generate
"$TSX" scripts/setup-database.ts
"$TSX" scripts/initialize.ts

# Next writes its runtime incremental cache (the fetch cache and ISR) into
# .next/cache. The image creates it, but that only settles the image layer: a
# volume mounted over /app/.next hides the directory and its ownership, and a
# read-only root filesystem makes it unwritable whatever the image did. In both
# cases Next discovers the problem mid-request and surfaces it as an unhandled
# rejection rather than a cache miss, so a deployment that is merely running
# uncached reports a crash.
#
# Settle it here instead. This runs after any mount is in place and as the user
# that will serve requests, so the directory is created when it can be; when it
# cannot, the reason is said once, plainly, and the server still starts.
if ! mkdir -p .next/cache 2>/dev/null || ! [ -w .next/cache ]; then
  echo "fresco: /app/.next/cache is not writable, so Next will run without its incremental cache. If /app/.next is a mounted volume or the filesystem is read-only, make that path writable by uid 1001 to restore caching." >&2
fi

exec node server.js
