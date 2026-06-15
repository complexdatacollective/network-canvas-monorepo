#!/usr/bin/env bash
# Regenerate the interface screenshots inside the pinned Playwright Docker
# image. Screenshots are font-rendering sensitive, so canonical (committable)
# output must always be produced in the same Linux container regardless of
# host OS. Mirrors packages/interview/e2e/scripts/run.sh.
#
# Usage:
#   ./scripts/run-docker.sh            # regenerate screenshots + manifest
#
# The install is the full workspace (mirroring the interface-images-check CI
# job), not just `--filter @codaco/interface-images...`: the `generate` task
# depends on `@codaco/interview#build-storybook` -> `^build`, so the whole
# interview -> fresco-ui -> shared-consts build chain (and its build-time
# devDependencies, e.g. vite-plugin-dts) must be installed.
#
# A named Docker volume backs /workspace/node_modules so `pnpm install`
# inside the container doesn't overwrite the host's binaries (oxide, sharp,
# swc, etc.). Wipe with:
#   docker volume rm interface-images-node-modules
#
# STORYBOOK_MAPBOX_TOKEN (if set) is forwarded so the Geospatial story can render
# its map at storybook build time.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONOREPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$MONOREPO_ROOT"

# v1.60.0-noble, pinned by digest so locally regenerated baselines are produced
# in byte-for-byte the same environment as the interface-images-check CI job
# (which pins the same digest). A mutable tag could silently drift from CI and
# make committed output fail the staleness gate.
IMAGE="mcr.microsoft.com/playwright@sha256:9bd26ad900bb5e0f4dee75839e957a89ae89c2b7ab1e76050e559790e946b948"

if ! docker info >/dev/null 2>&1; then
  echo "Error: Docker is not running." >&2
  exit 1
fi

# The container runs as root (corepack/pnpm need to write into the image's
# global dirs and the named node_modules volume), so anything it writes back
# into the bind-mounted workspace lands root-owned on the host. Reclaim the
# generated assets for the host user at the end so the next edit/commit/
# regeneration isn't blocked by root-owned files.
HOST_UID="$(id -u)"
HOST_GID="$(id -g)"

docker run --rm \
  -e CI=true \
  -e STORYBOOK_MAPBOX_TOKEN="${STORYBOOK_MAPBOX_TOKEN:-}" \
  -v "$(pwd)":/workspace \
  -v interface-images-node-modules:/workspace/node_modules \
  -w /workspace \
  "${IMAGE}" \
  sh -c "set -e \
    && corepack enable \
    && pnpm install --frozen-lockfile --ignore-scripts \
    && pnpm exec turbo run generate --filter=@codaco/interface-images \
    && chown -R ${HOST_UID}:${HOST_GID} packages/interface-images/src/generated"
