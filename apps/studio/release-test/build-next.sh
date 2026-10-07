#!/usr/bin/env bash
# Candidate-next: the candidate plus one schema-bearing release, generated the
# way an author generates one and never committed (#1901).
#
#   apps/studio/release-test/build-next.sh     # after build.sh
#
# A copy of this checkout (tracked and untracked-but-not-ignored files, outside
# the repository) gets next.patch — a nullable column with a default on the
# populated `protocols` table, and one changed sidecar statement — then the
# author's own two commands, `sync-fingerprint` and `migrate:generate`, then a
# hand-written backfill (next-backfill.sql) sealed into the new directory with
# `migrate:generate --seal`. The result is the next numbered migration with a
# delta, a backfill and changed sidecars, built into a studio-api image and
# pushed to the lane's registry as NEXT_API in $WORK_DIR/images.env.
#
# Needs this checkout's installed dependencies: the generator is drizzle-kit,
# which no image carries. That is the release author's toolchain, not the
# self-hoster's — nothing in the upgrade itself needs a checkout.
set -euo pipefail

# shellcheck source=./lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

[ -f "$IMAGES_ENV" ] || die "no $IMAGES_ENV — run build.sh first"
[ -d "$REPO_ROOT/node_modules" ] \
  || die "this checkout has no node_modules: run pnpm install first (the generator needs drizzle-kit)"

NEXT_TREE="$WORK_DIR/next-tree"
NEXT_LOCAL="studio-api:release-test-next"
SLUG="release_test_next"

rm -rf "$NEXT_TREE"
mkdir -p "$NEXT_TREE"

# ── A copy of the working tree ────────────────────────────────────────────
# What `docker build` would see from this checkout, minus deleted files.
say "copying the checkout to $NEXT_TREE"
(
  cd "$REPO_ROOT"
  git ls-files -z -co --exclude-standard \
    | while IFS= read -r -d '' file; do
      [ -f "$file" ] && printf '%s\0' "$file"
    done \
    | tar --null -T - -cf -
) | tar -xf - -C "$NEXT_TREE"

# ── The change ────────────────────────────────────────────────────────────
# `--check` first, so a patch that no longer applies fails here, naming the
# hunk, rather than half-applying.
(cd "$NEXT_TREE" && git apply --check "$RELEASE_TEST_DIR/next.patch" \
  && git apply "$RELEASE_TEST_DIR/next.patch") \
  || die "next.patch no longer applies to this checkout: regenerate it against the current schema"

# The generator imports the copy's own sources and this checkout's installed
# packages. next.patch changes only apps/studio/api, so the workspace packages
# those links resolve to are the same files the copy holds.
if grep -E '^\+\+\+ b/' "$RELEASE_TEST_DIR/next.patch" | grep -vqE '^\+\+\+ b/apps/studio/api/'; then
  die 'next.patch touches a file outside apps/studio/api; the generator would not see that change'
fi
ln -s "$REPO_ROOT/node_modules" "$NEXT_TREE/node_modules"
ln -s "$REPO_ROOT/apps/studio/api/node_modules" "$NEXT_TREE/apps/studio/api/node_modules"

API="$NEXT_TREE/apps/studio/api"
newest_migration() {
  find "$API/migrations" -mindepth 1 -maxdepth 1 -type d -name '[0-9][0-9][0-9][0-9]_*' \
    | sort | tail -n 1
}
before="$(basename "$(newest_migration)")"

say "sync-fingerprint and migrate:generate --name $SLUG in the copy"
(cd "$API" && node scripts/sync-fingerprint.ts && node scripts/migrate-generate.ts --name "$SLUG")

generated="$(newest_migration)"
version="$(basename "$generated")"
expected_ordinal="$(printf '%04d' $((10#${before%%_*} + 1)))"
[ "$version" = "${expected_ordinal}_$SLUG" ] \
  || die "expected migrate:generate to write ${expected_ordinal}_$SLUG after $before; the newest directory is $version"

# The edit took, in both halves: the delta adds the column, and the sidecars
# carry the changed statement.
grep -q '"release_test_probe"' "$generated/delta.sql" \
  || die "$version/delta.sql does not add release_test_probe (see $generated/delta.sql)"
grep -q "COMMENT ON TABLE deployment_state IS 'release-test-next'" "$generated/sidecars.sql" \
  || die "$version/sidecars.sql does not carry the changed sidecar statement"

cp "$RELEASE_TEST_DIR/next-backfill.sql" "$generated/backfill.sql"
# `--seal` refuses a directory origin/main carries; it answers from this
# checkout's history, which is where origin/main is.
say "sealing $version with its backfill"
(cd "$API" && GIT_DIR="$(git -C "$REPO_ROOT" rev-parse --absolute-git-dir)" \
  GIT_WORK_TREE="$NEXT_TREE" node scripts/migrate-generate.ts --seal)
grep -q '"backfill.sql"' "$generated/manifest.json" \
  || die "$version/manifest.json does not record the backfill"

# ── The image ─────────────────────────────────────────────────────────────
# Only studio-api: the web image carries no schema, so the code-only web image
# stands in for this release's.
say "building $NEXT_LOCAL from the copy"
build_args=(buildx build -f apps/studio/Dockerfile --target studio-api -t "$NEXT_LOCAL" --load)
if [ -n "${BUILD_CACHE_FROM:-}" ]; then
  build_args+=(--cache-from "${BUILD_CACHE_FROM//\{target\}/studio-api}")
fi
(cd "$NEXT_TREE" && docker "${build_args[@]}" .)

remote="$REGISTRY/studio-api:next"
docker tag "$NEXT_LOCAL" "$remote"
docker push -q "$remote" > /dev/null
NEXT_API="$(docker inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$remote" \
  | grep "^$REGISTRY/studio-api@sha256:" | head -n 1)"
[ -n "$NEXT_API" ] || die "pushed $remote but the daemon recorded no digest for it"

# Replace any earlier value rather than appending a second.
grep -v '^NEXT_' "$IMAGES_ENV" > "$IMAGES_ENV.tmp" || true
{
  cat "$IMAGES_ENV.tmp"
  echo "NEXT_API=$NEXT_API"
  echo "NEXT_VERSION=$version"
} > "$IMAGES_ENV"
rm -f "$IMAGES_ENV.tmp"
say "NEXT_API=$NEXT_API ($version)"
