#!/usr/bin/env bash
# Deploys the newest Network Canvas Studio release to Codaco's staging stack when
# it differs from what .env runs, and records the deploy as a GitHub deployment
# (docs/operations/staging-auto-update.md). Meant to run hourly from cron, from
# the directory holding docker-compose.yml and .env.
# Each deploy runs the release's own upgrade.sh with the release's own
# docker-compose.yml, both fetched from the commit its images were built from.
#
#   auto-update.sh [--dir <stack-dir>]
#
# Environment:
#   GITHUB_TOKEN                     a token that may create deployments on the
#                                    repository (required)
#   STUDIO_AUTO_UPDATE_ENVIRONMENT   the GitHub deployment environment
#                                    (default studio-staging)
#   COMPOSE                          the Compose command (default: docker compose)
#
# A run that ends in anything but an upgrade writes .auto-update-halted, and
# every later run stops there until someone has looked at the instance and
# removed that file. Needs curl, jq, cosign, flock and Compose.
set -uo pipefail

REPO=complexdatacollective/network-canvas-monorepo
API="https://api.github.com/repos/$REPO"
IDENTITY="https://github.com/$REPO/.github/workflows/ci-and-release.yml@refs/heads/main"
ISSUER=https://token.actions.githubusercontent.com
ENVIRONMENT="${STUDIO_AUTO_UPDATE_ENVIRONMENT:-studio-staging}"
RAW="https://raw.githubusercontent.com/$REPO"

log() { echo "[studio-auto-update] $*"; }
fail() {
  log "error: $*" >&2
  exit 1
}

STACK_DIR="."
while [ $# -gt 0 ]; do
  case "$1" in
    --dir)
      [ $# -ge 2 ] || fail '--dir needs a directory'
      STACK_DIR="$2"
      shift 2
      ;;
    *) fail "unknown argument $1" ;;
  esac
done

[ -n "${GITHUB_TOKEN:-}" ] || fail 'GITHUB_TOKEN is not set'
cd "$STACK_DIR" 2> /dev/null || fail "no such directory: $STACK_DIR"
[ -f .env ] || fail "no .env in $(pwd)"

exec 9> .auto-update.lock
flock -n -E 75 9
case $? in
  0) ;;
  75)
    log 'another run holds the lock; skipping'
    exit 0
    ;;
  *) fail 'could not take the lock with flock' ;;
esac

if [ -f .auto-update-halted ]; then
  log "halted: $(cat .auto-update-halted)"
  log 'remove .auto-update-halted once the instance has been checked'
  exit 0
fi

github() { # method path [json]
  local body=()
  [ $# -ge 3 ] && body=(-d "$3")
  printf 'Authorization: Bearer %s\n' "$GITHUB_TOKEN" | curl -fsS --connect-timeout 10 --max-time 120 -X "$1" \
    -H @- \
    -H 'Accept: application/vnd.github+json' \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    ${body[@]+"${body[@]}"} "$API$2"
}

MANIFEST_URL=
PAGE=1
while [ -z "$MANIFEST_URL" ]; do
  RELEASES="$(github GET "/releases?per_page=100&page=$PAGE")" || fail 'could not list the releases'
  [ "$(jq length <<< "$RELEASES")" -gt 0 ] || fail 'found no published Studio release'
  RELEASE="$(jq -c '[.[] | select(.draft == false and .prerelease == false and (.tag_name | startswith("studio@")))][0] // empty' <<< "$RELEASES")"
  if [ -n "$RELEASE" ]; then
    MANIFEST_URL="$(jq -r '.assets[]? | select(.name == "studio-release.json") | .browser_download_url' <<< "$RELEASE")"
    [ -n "$MANIFEST_URL" ] || fail "$(jq -r .tag_name <<< "$RELEASE") has no studio-release.json"
  fi
  PAGE=$((PAGE + 1))
done

MANIFEST="$(curl -fsSL --connect-timeout 10 --max-time 120 "$MANIFEST_URL")" || fail "could not download $MANIFEST_URL"
VERSION="$(jq -r .version <<< "$MANIFEST")"
COMMIT="$(jq -r .commit <<< "$MANIFEST")"
NEW_API="$(jq -r .images.api <<< "$MANIFEST")"
NEW_WEB="$(jq -r .images.web <<< "$MANIFEST")"
[[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]] || fail "the manifest of Studio $VERSION names no commit"

if [ "$(sed -n 's/^STUDIO_API_IMAGE=//p' .env)" = "$NEW_API" ] \
  && [ "$(sed -n 's/^STUDIO_WEB_IMAGE=//p' .env)" = "$NEW_WEB" ]; then
  log "up to date with $VERSION"
  exit 0
fi

for image in "$NEW_API" "$NEW_WEB"; do
  cosign verify --certificate-identity "$IDENTITY" --certificate-oidc-issuer "$ISSUER" \
    --certificate-github-workflow-sha "$COMMIT" "$image" > /dev/null \
    || fail "$image is not signed by the Studio release workflow at $COMMIT; nothing was changed"
done

WORK="$(mktemp -d)" || fail 'could not make a temporary directory'
trap 'rm -rf "$WORK"' EXIT
for file in apps/studio/docker-compose.yml apps/studio/scripts/upgrade.sh; do
  curl -fsSL --connect-timeout 10 --max-time 120 -o "$WORK/${file##*/}" "$RAW/$COMMIT/$file" \
    || fail "could not download $file at $COMMIT; nothing was changed"
done

read -r -a COMPOSE_CMD <<< "${COMPOSE:-docker compose}"
FILES=(-f "$WORK/docker-compose.yml")
[ -f docker-compose.override.yml ] && FILES+=(-f docker-compose.override.yml)
CHECK="$("${COMPOSE_CMD[@]}" "${FILES[@]}" --project-directory . config -q 2>&1 < /dev/null)" \
  || fail "Compose rejects the docker-compose.yml of Studio $VERSION with this .env; nothing was changed: $CHECK"
MISSING="$(sed -nE 's/.*The \\?"([A-Za-z0-9_]+)\\?" variable is not set.*/\1/p' <<< "$CHECK" | sort -u | tr '\n' ' ')"
[ -z "$MISSING" ] || fail "Studio $VERSION needs ${MISSING% } in .env; nothing was changed"

DEPLOYMENT="$(github POST /deployments "$(jq -nc --arg ref "$COMMIT" --arg env "$ENVIRONMENT" --arg v "$VERSION" \
  '{ref: $ref, environment: $env, auto_merge: false, required_contexts: [], description: ("Studio " + $v)}')" \
  | jq -r .id)" || fail 'could not create the GitHub deployment; nothing was changed'

URL="https://$(sed -n 's/^STUDIO_HOSTNAME=//p' .env)"
status() { # state description
  github POST "/deployments/$DEPLOYMENT/statuses" \
    "$(jq -nc --arg s "$1" --arg d "$2" --arg u "$URL" '{state: $s, description: $d, environment_url: $u}')" > /dev/null \
    || log "could not set deployment $DEPLOYMENT to $1"
}

log "deploying Studio $VERSION (deployment $DEPLOYMENT)"
status in_progress "Upgrading to Studio $VERSION"
echo "Studio $VERSION: upgrade.sh started at $(date -u +%Y-%m-%dT%H:%M:%SZ) and did not finish" > .auto-update-halted
bash "$WORK/upgrade.sh" --dir . --compose "$WORK/docker-compose.yml" "$NEW_API" "$NEW_WEB"
CODE=$?

case "$CODE" in
  0) STATE=success RESULT=upgraded ;;
  3) STATE=failure RESULT=rolled-back ;;
  2) STATE=error RESULT=not-started ;;
  4) STATE=error RESULT=rollback-failed ;;
  5) STATE=error RESULT=fix-forward ;;
  *) STATE=error RESULT="exit $CODE" ;;
esac
status "$STATE" "Studio $VERSION: $RESULT"

if [ "$CODE" -ne 0 ]; then
  echo "Studio $VERSION: upgrade.sh ended $RESULT (exit $CODE) at $(date -u +%Y-%m-%dT%H:%M:%SZ)" > .auto-update-halted
  log "upgrade.sh ended $RESULT; wrote .auto-update-halted"
else
  rm -f .auto-update-halted
fi
exit "$CODE"
