#!/usr/bin/env bash
# Run the @codaco/architect e2e suite inside the pinned Playwright Docker image.
# Visual snapshots are font-sensitive, so baselines must be generated here, never
# on the host. The image tag is derived from pnpm-lock.yaml so it stays in
# lock-step with the @playwright/test / playwright catalog pins.
#
#   ./e2e/scripts/run.sh                    # run all specs
#   ./e2e/scripts/run.sh --update-snapshots # regenerate visual baselines
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONOREPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
cd "$MONOREPO_ROOT"

PW_VERSION="$(grep -oE '@playwright/test@[0-9]+\.[0-9]+\.[0-9]+' pnpm-lock.yaml | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | sort -uV | tail -1 || true)"
if [ -z "$PW_VERSION" ]; then
  echo "Error: could not determine @playwright/test version from pnpm-lock.yaml" >&2
  exit 1
fi
IMAGE="mcr.microsoft.com/playwright:v${PW_VERSION}-noble"

if ! docker info >/dev/null 2>&1; then
  echo "Error: Docker is not running." >&2
  exit 1
fi

# VITE_DISABLE_ANALYTICS=true skips analytics.ts's posthog.init entirely.
# Without it, PostHog's client attempts a `<script src="…surveys.js">` load
# against connect-src's ph-relay.networkcanvas.com host, which the app's own
# CSP meta tag (vite.config.ts) allows for connect-src but blocks under
# script-src — an expected, permanent CSP violation, not a bug, but its timing
# is non-deterministic, so it can occasionally interleave with a spec's own
# page.evaluate/addStyleTag calls and surface as a spurious action failure.
# Reuse the app's build-time analytics gate (already used by vitest and the
# Netlify PR-preview deploy — see vite.config.ts / ci-and-release.yml) so the
# build under test never initializes PostHog at all.
# --platform linux/amd64 pins the container to the architecture CI runs on.
# Glyph advance widths differ subtly between the image's amd64 and arm64
# builds, which moves text wrap points in the summary/codebook print
# documents — an arm64-generated baseline is a whole line-height off by the
# bottom of the page. The node_modules volume is arch-specific to match
# (native binaries installed under one platform don't run under the other).
docker run --rm \
  --platform linux/amd64 \
  -e CI=true \
  -e VITE_DISABLE_ANALYTICS=true \
  -v "$(pwd)":/workspace \
  -v architect-e2e-node-modules-amd64:/workspace/node_modules \
  -w /workspace \
  "${IMAGE}" \
  sh -c "set -e \
    && corepack enable \
    && pnpm install --filter '@codaco/architect...' --frozen-lockfile \
    && pnpm turbo run build --filter=@codaco/architect \
    && pnpm --filter @codaco/architect exec playwright test --config=e2e/playwright.config.ts $*"
