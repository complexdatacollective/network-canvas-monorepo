#!/usr/bin/env bash
# The candidate images, and the code-only release built from them, pushed by
# digest to the lane's local registry (#1901).
#
#   apps/studio/release-test/build.sh
#
# Writes $WORK_DIR/images.env (lib.sh; outside the checkout):
#
#   CANDIDATE_API / CANDIDATE_WEB   this checkout, built by stack-test/build.sh
#   CODE_API / CODE_WEB             the same images plus one LABEL: new digests,
#                                   identical files and so an identical schema
#                                   fingerprint — an honest code-only release
#
# Every value is `127.0.0.1:5005/<image>@sha256:…`. A code-only release needs
# digests that differ, or the guide's `up -d` would replace nothing and the
# run would be testing a no-op rather than an upgrade.
#
# BUILD_CACHE_FROM / BUILD_CACHE_TO pass through to stack-test/build.sh.
set -euo pipefail

# shellcheck source=./lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

mkdir -p "$WORK_DIR"

# ── The registry ──────────────────────────────────────────────────────────
start_registry() {
  if [ -n "$(docker ps -q --filter "name=^${REGISTRY_CONTAINER}$")" ]; then
    return 0
  fi
  docker rm -f "$REGISTRY_CONTAINER" > /dev/null 2>&1 || true
  say "starting the local registry on $REGISTRY"
  docker run -d --name "$REGISTRY_CONTAINER" \
    -p "$REGISTRY:5000" "$REGISTRY_IMAGE" > /dev/null
  for _ in $(seq 1 30); do
    curl -fsS "http://$REGISTRY/v2/" > /dev/null 2>&1 && return 0
    sleep 1
  done
  die "the local registry did not answer on $REGISTRY"
}

# Pushes a daemon image as $REGISTRY/<repository>:<tag> and prints the digest
# reference the registry assigned. Through the daemon, not buildx: a
# container-driver builder's 127.0.0.1 is its own container, not this host.
push() { # local-image repository tag
  local remote="$REGISTRY/$2:$3"
  docker tag "$1" "$remote"
  docker push -q "$remote" > /dev/null
  local digest
  digest="$(docker inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$remote" \
    | grep "^$REGISTRY/$2@sha256:" | head -n 1)"
  [ -n "$digest" ] || die "pushed $remote but the daemon recorded no digest for it"
  echo "$digest"
}

# A second image that is the first plus one label. Built on the daemon's own
# builder (`docker build`, which does not follow a buildx container builder
# that `docker buildx use` or BUILDX_BUILDER selected), because only that one
# can see an image the daemon holds locally.
relabel() { # base-image tag
  printf 'FROM %s\nLABEL org.networkcanvas.release-test="code-only"\n' "$1" \
    | env -u BUILDX_BUILDER docker build -q -t "$2" - > /dev/null
}

start_registry

API_LOCAL="studio-api:release-test"
WEB_LOCAL="studio-web:release-test"
say "building the candidate images"
API_IMAGE="$API_LOCAL" WEB_IMAGE="$WEB_LOCAL" "$STUDIO_DIR/stack-test/build.sh"

CANDIDATE_API="$(push "$API_LOCAL" studio-api candidate)"
CANDIDATE_WEB="$(push "$WEB_LOCAL" studio-web candidate)"

relabel "$API_LOCAL" studio-api:release-test-code
relabel "$WEB_LOCAL" studio-web:release-test-code
CODE_API="$(push studio-api:release-test-code studio-api code)"
CODE_WEB="$(push studio-web:release-test-code studio-web code)"

[ "$CANDIDATE_API" != "$CODE_API" ] || die "the code-only api image has the candidate's digest"
[ "$CANDIDATE_WEB" != "$CODE_WEB" ] || die "the code-only web image has the candidate's digest"

cat > "$IMAGES_ENV" <<ENV
CANDIDATE_API=$CANDIDATE_API
CANDIDATE_WEB=$CANDIDATE_WEB
CODE_API=$CODE_API
CODE_WEB=$CODE_WEB
ENV
say "wrote $(basename "$IMAGES_ENV"):"
sed 's/^/  /' "$IMAGES_ENV"
