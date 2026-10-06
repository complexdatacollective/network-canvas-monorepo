#!/bin/sh
set -e

# Opt-in repair of the incremental-cache directory, for the one case nothing else
# can fix: a *bind* mount at /app/.next/cache keeps the host's ownership, and a
# non-root process can neither mkdir inside a root-owned directory nor chown one
# it does not own. (A *named* volume inherits the image's ownership, so that case
# is already settled at build time, as is an arbitrary UID in group 0.)
#
# The image declares `USER nextjs`, so this block is NOT reached on a normal
# start — deliberately, because dropping that declaration would stop the
# container starting at all under Kubernetes `runAsNonRoot: true` with no
# `runAsUser`, which validates the image's user. It runs when an operator starts
# the container as root on purpose (`docker run --user 0`, `runAsUser: 0`) to
# have the mount repaired, and drops straight back to `nextjs`.
#
# Equally valid, and preferable where available: chown the host directory to uid
# 1001, set Kubernetes `fsGroup`, or use a root initContainer. The warning
# further down names these.
#
# Everything below this block runs as `nextjs` (uid 1001) either way.
if [ "$(id -u)" = '0' ]; then
  # Best effort. On a read-only filesystem these fail and the writability check
  # further down reports it after the re-exec. Scoped to the cache directory so
  # the large .next/static tree is never walked.
  mkdir -p .next/cache 2>/dev/null || true
  chown nextjs:nodejs .next 2>/dev/null || true

  # Only walk the cache when it actually needs repairing — on a normal boot the
  # ownership is already right, and the cache is the one directory here that
  # grows without bound, so an unconditional recursive chown would add startup
  # time proportional to how long the deployment has been running. The test is
  # the directory's own owner, which is what a mount replaces; entries inside a
  # correctly owned directory are assumed to have been written by this user.
  if [ "$(stat -c %u .next/cache 2>/dev/null)" != '1001' ]; then
    chown -R nextjs:nodejs .next/cache 2>/dev/null || true
  fi

  # Never fall through to serving as root — the operator asked for a repair, not
  # for the application to run privileged, and silently granting that would be
  # worse than not starting.
  if ! command -v su-exec >/dev/null 2>&1; then
    echo "fresco: refusing to start as root: su-exec is missing from the image, so privileges cannot be dropped." >&2
    exit 1
  fi

  exec su-exec nextjs:nodejs sh "$0" "$@"
fi

# prisma + tsx are merged into /app/node_modules by the Docker runner stage, so
# their binaries live in ./node_modules/.bin. Call them by path so npx never
# falls back to a registry download at runtime.
PRISMA=./node_modules/.bin/prisma
TSX=./node_modules/.bin/tsx

"$PRISMA" generate
"$TSX" scripts/setup-database.ts
"$TSX" scripts/initialize.ts

# Next writes its runtime incremental cache (the fetch cache and ISR) into
# .next/cache, and surfaces a failure to write there as an unhandled rejection
# rather than a cache miss — so a deployment that is merely running uncached
# reports a crash.
#
# Final check, now running as the user that will serve requests. The directory
# was created at build time and, if this boot began as root, had its ownership
# repaired above. So reaching the warning means the path cannot be made writable
# from inside the container as this user: a read-only filesystem, or a bind mount
# writable by neither uid 1001 nor group 0.
#
# This does NOT stop the errors in that case. `cacheComponents` is on, so Next
# keeps writing cache entries and those writes keep rejecting; all this does is
# name the cause once at boot so the rejections that follow are attributable.
# Stopping them needs a writable path, or a cache handler that falls back off
# the filesystem — a larger change, tracked on #2090.
if ! mkdir -p .next/cache 2>/dev/null || ! [ -w .next/cache ]; then
  echo "fresco: /app/.next/cache is not writable, so Next's cache writes will fail and be reported as application errors. Give uid 1001 (or group 0) write access to that path: chown the host directory, set Kubernetes fsGroup, or start the container once as root (--user 0 / runAsUser: 0) to have it repaired automatically." >&2
fi

exec node server.js
