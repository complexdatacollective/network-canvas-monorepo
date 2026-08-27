#!/usr/bin/env bash
# Builds the pending-release Fresco image the way a release would: stage the
# mirrored single-package tree with scripts/mirror-app.mjs (dry run), bundle the
# pending workspace packages into it (bundle-pending-packages.mjs), generate the
# lockfile, and build the staged tree's own Dockerfile.
#
# Output image: fresco-release-test:pending (override with IMAGE_TAG).
# A machine-readable stamp is written to release-test/artifacts/stamp.json and
# printed on the last stdout line.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
IMAGE_TAG="${IMAGE_TAG:-fresco-release-test:pending}"
ARTIFACTS_DIR="$SCRIPT_DIR/artifacts"
STAGE_DIR="$(mktemp -d)/fresco-stage"

cd "$REPO_ROOT"
mkdir -p "$ARTIFACTS_DIR"

VERSION="$(node -p "require('./apps/fresco/package.json').version")"
COMMIT="$(git rev-parse --short HEAD)"
DIRTY="false"
[ -n "$(git status --porcelain)" ] && DIRTY="true"

echo "[release-test] building workspace dependency closure"
SKIP_ENV_VALIDATION=true pnpm exec turbo run build --filter='fresco^...'

echo "[release-test] staging mirror tree -> $STAGE_DIR"
MIRROR_DRY_RUN=true MIRROR_STAGE_DIR="$STAGE_DIR" node scripts/mirror-app.mjs \
  --app apps/fresco --repo complexdatacollective/Fresco --branch main \
  --version "$VERSION"

echo "[release-test] bundling pending workspace packages"
node apps/fresco/release-test/scripts/bundle-pending-packages.mjs "$STAGE_DIR"

echo "[release-test] generating lockfile"
(cd "$STAGE_DIR" && pnpm install --lockfile-only --ignore-scripts)

# Every @codaco entry must resolve to a vendored tarball. Registry-resolved
# references appear as '@codaco/<name>@<semver>' in the lockfile; any such hit
# means the bundling silently failed for some package.
if grep -nE "@codaco/[a-z0-9-]+@[0-9]" "$STAGE_DIR/pnpm-lock.yaml" >/dev/null; then
  echo "[release-test] ERROR: staged lockfile resolves @codaco packages from the registry:" >&2
  grep -nE "@codaco/[a-z0-9-]+@[0-9]" "$STAGE_DIR/pnpm-lock.yaml" >&2
  exit 1
fi

echo "[release-test] building image $IMAGE_TAG"
docker build -t "$IMAGE_TAG" "$STAGE_DIR"

IMAGE_ID="$(docker image inspect --format '{{.Id}}' "$IMAGE_TAG")"
STAMP="{\"image\":\"$IMAGE_TAG\",\"imageId\":\"$IMAGE_ID\",\"version\":\"$VERSION\",\"commit\":\"$COMMIT\",\"dirty\":$DIRTY}"
printf '%s\n' "$STAMP" >"$ARTIFACTS_DIR/stamp.json"

rm -rf "$(dirname "$STAGE_DIR")"

echo "[release-test] done"
printf '%s\n' "$STAMP"
