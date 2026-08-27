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

# Every package the pending release publishes must resolve to its vendored
# tarball and never from the registry (registry references appear as
# '@codaco/<name>@<semver>'); packages without a pending changeset are
# expected to resolve from the registry, exactly as the released image will.
node - "$STAGE_DIR" <<'EOF'
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const stageDir = process.argv[2];
const manifest = JSON.parse(
  readFileSync(join(stageDir, 'bundle-manifest.json'), 'utf8'),
);
const lockfile = readFileSync(join(stageDir, 'pnpm-lock.yaml'), 'utf8');
const problems = [];
for (const [name, tarball] of Object.entries(manifest.vendored)) {
  if (!lockfile.includes(`file:vendor/${tarball}`)) {
    problems.push(`${name}: no file:vendor/${tarball} resolution in lockfile`);
  }
  if (new RegExp(`${name}@\\d`).test(lockfile)) {
    problems.push(`${name}: vendored but also resolved from the registry`);
  }
}
if (problems.length) {
  console.error('[release-test] ERROR: bundling guard failed:');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(
  `[release-test] bundling guard OK: ${Object.keys(manifest.vendored).length} vendored, ${manifest.registry.length} from registry (${manifest.registry.join(', ') || 'none'})`,
);
EOF

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
