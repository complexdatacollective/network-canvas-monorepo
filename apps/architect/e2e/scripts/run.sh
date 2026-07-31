#!/usr/bin/env bash
# Run the @codaco/architect e2e suite inside the pinned Playwright Docker image.
# Visual snapshots are font-sensitive, so baselines must be generated here, never
# on the host. The image tag is derived from pnpm-lock.yaml so it stays in
# lock-step with the @playwright/test / playwright catalog pins.
#
#   ./e2e/scripts/run.sh                    # run all specs
#   ./e2e/scripts/run.sh --grep @visual --update-snapshots # regenerate PNG baselines
#   ./e2e/scripts/run.sh specs/foo.spec.ts --update-snapshots
#     # scoped regen — extra args pass through to playwright verbatim. Put
#     # spec paths BEFORE --update-snapshots: playwright's -u takes an
#     # optional mode argument, so a path directly after it is rejected
#     # ("argument 'specs/…' is invalid").
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

source "$MONOREPO_ROOT/scripts/playwright-docker-platform.sh"
detect_playwright_docker_platform

# VITE_DISABLE_ANALYTICS=true skips analytics.ts's posthog.init entirely.
# Without it, PostHog's client attempts a `<script src="…surveys.js">` load
# against connect-src's ph-relay.networkcanvas.com host, which the app's own
# CSP meta tag (vite.config.ts) allows for connect-src but blocks under
# script-src — an expected, permanent CSP violation, not a bug, but its timing
# is non-deterministic, so it can occasionally interleave with a spec's own
# page.evaluate/addStyleTag calls and surface as a spurious action failure.
# Reuse the app's build-time analytics gate (already used by vitest and the
# Netlify PR-preview build — see vite.config.ts / netlify.toml) so the
# build under test never initializes PostHog at all.
# Pixel baselines are ARM64 truth. Native arm64 runs compare and may update
# them; the capture helper skips pixel work on other architectures. Keep all
# dependency and cache volumes architecture-specific so an Apple Silicon run
# cannot reuse amd64 native binaries.
# Forwarded args are spliced into the container's `sh -c` string, so each one
# must be shell-quoted or characters like the `|` in `--grep "A|B"` are
# re-parsed as shell syntax inside the container (mirrors the interview
# runner's fix).
FORWARDED_ARGS=""
for arg in "$@"; do
  FORWARDED_ARGS="${FORWARDED_ARGS} $(printf '%q' "$arg")"
done

docker run --rm \
  --platform "$PLAYWRIGHT_DOCKER_PLATFORM" \
  -e CI=true \
  -e VITE_DISABLE_ANALYTICS=true \
  -v "$(pwd)":/workspace \
  -v "architect-e2e-node-modules-${PLAYWRIGHT_DOCKER_VOLUME_ARCH}":/workspace/node_modules \
  -v "architect-e2e-turbo-cache-${PLAYWRIGHT_DOCKER_VOLUME_ARCH}":/workspace/.turbo/cache \
  -v "architect-e2e-pnpm-store-${PLAYWRIGHT_DOCKER_VOLUME_ARCH}":/workspace/.pnpm-store \
  -w /workspace \
  "${IMAGE}" \
  sh -c "set -e \
    && corepack enable \
    && pnpm install --filter '@codaco/architect...' --frozen-lockfile \
    && pnpm turbo run build --filter=@codaco/architect \
    && pnpm --filter @codaco/architect exec playwright test --config=e2e/playwright.config.ts ${FORWARDED_ARGS}"
