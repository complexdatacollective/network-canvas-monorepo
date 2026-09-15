#!/usr/bin/env bash
# Both stack images, from the monorepo root, tagged the way `up.sh` expects
# them (#1909).
#
#   apps/studio/stack-test/build.sh
#
# Same two `docker build` invocations `dev:stack` runs (server/scripts/
# dev-stack.ts), with `:ci` tags rather than `:local` so a developer running
# this beside `dev:stack` does not overwrite that lane's images.
#
# BUILD_CACHE_FROM and BUILD_CACHE_TO pass straight through to
# `--cache-from` / `--cache-to`, which is how the CI job reaches the GitHub
# Actions cache. Both are per-target: the string `{target}` in either is
# replaced with the target's name, so one value covers both images with
# separate cache scopes. Unset, nothing is added and the build uses whatever
# the local daemon already has.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

API_IMAGE="${API_IMAGE:-studio-api:ci}"
WEB_IMAGE="${WEB_IMAGE:-studio-web:ci}"

cd "$REPO_ROOT"

build_one() {
  local target="$1" tag="$2"
  local args=(build -f apps/studio/Dockerfile --target "$target" -t "$tag")

  # `--cache-to` is buildx-only, and so is `--cache-from type=gha`. The
  # classic builder silently ignores neither — it fails — so a caller that
  # asks for a cache gets the builder that can honour it.
  if [ -n "${BUILD_CACHE_FROM:-}" ]; then
    args+=(--cache-from "${BUILD_CACHE_FROM//\{target\}/$target}")
  fi
  if [ -n "${BUILD_CACHE_TO:-}" ]; then
    args+=(--cache-to "${BUILD_CACHE_TO//\{target\}/$target}")
    # A cache export needs the image loaded into the daemon explicitly:
    # buildx's default output for `docker build` is the daemon, but naming any
    # `--cache-to` switches it to the container driver's default of none.
    args+=(--load)
  fi

  echo "[stack-test] building $tag (--target $target)"
  docker "${args[@]}" .
}

build_one studio-api "$API_IMAGE"
build_one studio-web "$WEB_IMAGE"

echo "[stack-test] built $API_IMAGE and $WEB_IMAGE"
