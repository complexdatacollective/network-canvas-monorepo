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

if [ -n "${VENDOR_CHANGED_SINCE:-}" ]; then
  # Certifying a hotfix branch: stage exactly as the hotfix lane does —
  # vendor what changed since the release tag it was cut from (plus
  # dependents), seed the lockfile from the released mirror so nothing else
  # moves, and run the lockfile guard — so the image under test is the one
  # the lane would ship. Pending changesets play no part here.
  echo "[release-test] staging hotfix mirror tree (changed since $VENDOR_CHANGED_SINCE) -> $STAGE_DIR"
  MIRROR_STAGE_DIR="$STAGE_DIR" node scripts/mirror-app.mjs \
    --app apps/fresco --repo complexdatacollective/Fresco --branch main \
    --version "$VERSION" \
    --with-lockfile \
    --vendor-changed-since "$VENDOR_CHANGED_SINCE" \
    --seed-mirror-from "v${VENDOR_CHANGED_SINCE#fresco@}" \
    --stage-only
else
  echo "[release-test] staging mirror tree -> $STAGE_DIR"
  MIRROR_DRY_RUN=true MIRROR_STAGE_DIR="$STAGE_DIR" node scripts/mirror-app.mjs \
    --app apps/fresco --repo complexdatacollective/Fresco --branch main \
    --version "$VERSION"

  echo "[release-test] bundling pending workspace packages"
  node apps/fresco/release-test/scripts/bundle-pending-packages.mjs "$STAGE_DIR"

  echo "[release-test] generating lockfile"
  (cd "$STAGE_DIR" && pnpm install --lockfile-only --ignore-scripts)
fi

# Every vendored package — a planned bump, a version npm does not have yet
# (which `changeset publish` ships regardless), or on a hotfix branch whatever
# changed since the release — must resolve to its tarball and never from the
# registry (registry references appear as '@codaco/<name>@<semver>'); the
# rest are expected to resolve from the registry, exactly as the image will.
echo "[release-test] $(node scripts/vendor-workspace-packages.mjs --assert-lockfile "$STAGE_DIR")"

echo "[release-test] building image $IMAGE_TAG"
docker build -t "$IMAGE_TAG" "$STAGE_DIR"

# The bundler bakes the release plan's version into the staged manifest (the
# working tree still carries the released one), so the stamp reports what the
# image actually says it is.
STAGED_VERSION="$(node -p "require('$STAGE_DIR/package.json').version")"
IMAGE_ID="$(docker image inspect --format '{{.Id}}' "$IMAGE_TAG")"
STAMP="{\"image\":\"$IMAGE_TAG\",\"imageId\":\"$IMAGE_ID\",\"version\":\"$STAGED_VERSION\",\"commit\":\"$COMMIT\",\"dirty\":$DIRTY}"
printf '%s\n' "$STAMP" >"$ARTIFACTS_DIR/stamp.json"

rm -rf "$(dirname "$STAGE_DIR")"

echo "[release-test] done"
printf '%s\n' "$STAMP"
