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
# Netlify PR-preview build — see vite.config.ts / netlify.toml) so the
# build under test never initializes PostHog at all.
# Visual baselines are amd64-truth: glyph advance widths differ subtly
# between the image's amd64 and arm64 builds, which moves text wrap points in
# the print documents — an arm64-generated baseline is a whole line-height off
# by the bottom of the page. Baseline-writing runs are therefore pinned to
# linux/amd64 (a no-op on CI and other amd64 hosts; on Apple Silicon it needs
# Docker's Rosetta mode — under plain QEMU Chromium's GPU process crashes and
# the run fails loudly; if that happens, adopt the `actual` image from the CI
# run's playwright-report-architect artifact instead). Normal runs stay on the
# native platform — fast everywhere — and the pixel comparison itself is
# arch-gated in e2e/helpers/visual.ts, so an arm64 run never compares against
# (or writes) amd64 baselines. Each platform gets its own node_modules volume
# so native binaries never mix.
PLATFORM_FLAG=""
VOLUME="architect-e2e-node-modules"
TURBO_VOLUME="architect-e2e-turbo-cache"
if [[ " $* " == *"--update-snapshots"* ]]; then
  PLATFORM_FLAG="--platform linux/amd64"
  VOLUME="architect-e2e-node-modules-amd64"
  TURBO_VOLUME="architect-e2e-turbo-cache-amd64"
fi
# Forwarded args are spliced into the container's `sh -c` string, so each one
# must be shell-quoted or characters like the `|` in `--grep "A|B"` are
# re-parsed as shell syntax inside the container (mirrors the interview
# runner's fix).
FORWARDED_ARGS=""
for arg in "$@"; do
  FORWARDED_ARGS="${FORWARDED_ARGS} $(printf '%q' "$arg")"
done

# shellcheck disable=SC2086 # PLATFORM_FLAG intentionally word-splits
docker run --rm \
  ${PLATFORM_FLAG} \
  -e CI=true \
  -e VITE_DISABLE_ANALYTICS=true \
  -v "$(pwd)":/workspace \
  -v "${VOLUME}":/workspace/node_modules \
  -v "${TURBO_VOLUME}":/workspace/.turbo/cache \
  -v architect-e2e-pnpm-store:/workspace/.pnpm-store \
  -w /workspace \
  "${IMAGE}" \
  sh -c "set -e \
    && corepack enable \
    && pnpm install --filter '@codaco/architect...' --frozen-lockfile \
    && pnpm turbo run build --filter=@codaco/architect \
    && pnpm --filter @codaco/architect exec playwright test --config=e2e/playwright.config.ts ${FORWARDED_ARGS}"
