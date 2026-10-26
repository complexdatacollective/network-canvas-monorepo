#!/usr/bin/env bash
# Upgrades a running Network Canvas Studio stack to new images, by the sequence
# in docs/self-host/upgrade.md, and rolls back when the database is unchanged.
#
#   upgrade.sh [--dir <stack-dir>] [--compose <file>] <api-image> <web-image>
#
# Run it from the directory holding docker-compose.yml and .env, or name that
# directory with --dir. Both images must be pinned by digest
# (ghcr.io/complexdatacollective/studio-api@sha256:<64 hex>). --compose names
# the release's docker-compose.yml; it replaces the stack's, which is kept as
# docker-compose.yml.previous and put back if the upgrade rolls back.
#
# IT TAKES NO BACKUP. Take your own before running it (docs/self-host/backup.md).
#
# Environment:
#   COMPOSE                              the Compose command (default: docker compose)
#   STUDIO_UPGRADE_MAINTENANCE_TIMEOUT   seconds for every API replica to report
#                                        maintenance mode on, or off again (default 60)
#   STUDIO_UPGRADE_SCHEMA_TIMEOUT        seconds for every API replica to report its
#                                        schema ok after migrate, given twice (default 120)
#   STUDIO_UPGRADE_POLL_INTERVAL         seconds between readiness checks (default 1)
#
# Exit codes, each also printed as the last line, `[studio-upgrade] result=<name> exit=<code>`:
#   0  upgraded        the new images serve, maintenance mode is off
#   2  not-started     bad arguments or stack directory; nothing was changed
#   3  rolled-back     failed before migrate changed the database (or migrate
#                      refused); the previous images (and compose file) are back
#                      and serve, maintenance mode is off. Data that Postgres,
#                      Garage or Traefik rewrote in their own volumes on start
#                      is not put back
#   4  rollback-failed failed before migrate, and the rollback did not bring the
#                      previous images back ready; needs a human
#   5  fix-forward     migrate changed the database, then a later step failed;
#                      the previous images refuse that database, so they were not
#                      put back. The new images stay in .env, maintenance mode is
#                      on; needs a human
# After 4 or 5, do not run it again until someone has looked at the instance.
set -uo pipefail

usage() {
  sed -n '2,/^set -uo pipefail$/p' "${BASH_SOURCE[0]}" | sed -e '$d' -e 's/^# \{0,1\}//'
}

log() { echo "[studio-upgrade] $*"; }

finish() { # code
  local name
  case "$1" in
    0) name=upgraded ;;
    2) name=not-started ;;
    3) name=rolled-back ;;
    4) name=rollback-failed ;;
    5) name=fix-forward ;;
  esac
  log "result=$name exit=$1"
  exit "$1"
}

refuse() {
  log "error: $*" >&2
  finish 2
}

STACK_DIR="."
NEW_COMPOSE=''
ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    -h | --help)
      usage
      exit 0
      ;;
    --dir)
      [ $# -ge 2 ] || refuse '--dir needs a directory'
      STACK_DIR="$2"
      shift 2
      ;;
    --dir=*)
      STACK_DIR="${1#--dir=}"
      shift
      ;;
    --compose)
      [ $# -ge 2 ] || refuse '--compose needs a file'
      NEW_COMPOSE="$2"
      shift 2
      ;;
    --compose=*)
      NEW_COMPOSE="${1#--compose=}"
      shift
      ;;
    -*) refuse "unknown option $1 (see --help)" ;;
    *)
      ARGS+=("$1")
      shift
      ;;
  esac
done

[ "${#ARGS[@]}" -eq 2 ] || refuse 'expected two arguments, <api-image> <web-image> (see --help)'
NEW_API="${ARGS[0]}"
NEW_WEB="${ARGS[1]}"
DIGEST_PINNED='^[^[:space:]@]+@sha256:[0-9a-f]{64}$'
[[ "$NEW_API" =~ $DIGEST_PINNED ]] || refuse "the api image is not pinned by digest: $NEW_API"
[[ "$NEW_WEB" =~ $DIGEST_PINNED ]] || refuse "the web image is not pinned by digest: $NEW_WEB"

MAINTENANCE_TIMEOUT="${STUDIO_UPGRADE_MAINTENANCE_TIMEOUT:-60}"
SCHEMA_TIMEOUT="${STUDIO_UPGRADE_SCHEMA_TIMEOUT:-120}"
POLL_INTERVAL="${STUDIO_UPGRADE_POLL_INTERVAL:-1}"

if [ -n "$NEW_COMPOSE" ]; then
  [ -f "$NEW_COMPOSE" ] || refuse "no such compose file: $NEW_COMPOSE"
  NEW_COMPOSE="$(cd "$(dirname "$NEW_COMPOSE")" && pwd)/$(basename "$NEW_COMPOSE")"
fi

cd "$STACK_DIR" 2> /dev/null || refuse "no such directory: $STACK_DIR"
[ -f .env ] || refuse "no .env in $(pwd)"
[ -z "$NEW_COMPOSE" ] || [ -f docker-compose.yml ] || refuse "no docker-compose.yml in $(pwd) to replace"
if [ -n "${STUDIO_API_IMAGE+set}" ] || [ -n "${STUDIO_WEB_IMAGE+set}" ]; then
  refuse 'STUDIO_API_IMAGE or STUDIO_WEB_IMAGE is set in the environment, which would override .env; unset it'
fi

env_line() { # name
  local lines
  lines="$(grep -E "^$1=" .env)"
  [ -n "$lines" ] && [ "$(wc -l <<< "$lines")" -eq 1 ] || return 1
  printf '%s' "$lines"
}
OLD_API_LINE="$(env_line STUDIO_API_IMAGE)" || refuse '.env must set STUDIO_API_IMAGE on exactly one line'
OLD_WEB_LINE="$(env_line STUDIO_WEB_IMAGE)" || refuse '.env must set STUDIO_WEB_IMAGE on exactly one line'

read -r -a COMPOSE_CMD <<< "${COMPOSE:-docker compose}"
compose() { "${COMPOSE_CMD[@]}" "$@" < /dev/null; }

if [ -n "$NEW_COMPOSE" ]; then
  NEW_FILES=(-f "$NEW_COMPOSE")
  [ -f docker-compose.override.yml ] && NEW_FILES+=(-f docker-compose.override.yml)
  SERVICES="$(compose "${NEW_FILES[@]}" --project-directory . config --services)" \
    || refuse "the new compose file does not validate against this stack: $NEW_COMPOSE"
else
  SERVICES="$(compose config --services)" || refuse "'${COMPOSE_CMD[*]} config --services' failed in $(pwd)"
fi
read -r -a APIS <<< "$(grep '^api' <<< "$SERVICES" | tr '\n' ' ')"
[ "${#APIS[@]}" -gt 0 ] || refuse 'the stack has no API service (no service name starts with "api")'

write_images() { # api-line web-line
  local tmp
  tmp="$(mktemp .env.upgrade.XXXXXX)" || return 1
  awk -v api="$1" -v web="$2" '
    /^STUDIO_API_IMAGE=/ { print api; next }
    /^STUDIO_WEB_IMAGE=/ { print web; next }
    { print }
  ' .env > "$tmp" && cat "$tmp" > .env
  local code=$?
  rm -f "$tmp"
  return "$code"
}

COMPOSE_SAVED=''
install_compose() {
  [ -n "$NEW_COMPOSE" ] || return 0
  cp docker-compose.yml docker-compose.yml.previous || return 1
  COMPOSE_SAVED=1
  cp "$NEW_COMPOSE" docker-compose.yml
}

write_env() {
  write_images "STUDIO_API_IMAGE=$NEW_API" "STUDIO_WEB_IMAGE=$NEW_WEB" && install_compose
}

replica_checks() { # service
  compose exec -T "$1" node -e "fetch('http://127.0.0.1:3000/readyz', { signal: AbortSignal.timeout(5000) }).then(r => r.json()).then(r => console.log(JSON.stringify(r.checks)))" 2> /dev/null
}

PENDING=()
replicas_report() { # timeout pattern…
  local deadline=$((SECONDS + $1)) api checks pattern
  shift
  while :; do
    PENDING=()
    for api in "${APIS[@]}"; do
      checks="$(replica_checks "$api")"
      for pattern in "$@"; do
        if [[ "$pattern" == '!'* && "$checks" == *"${pattern#!}"* ]] || [[ "$pattern" != '!'* && "$checks" != *"$pattern"* ]]; then
          PENDING+=("$api")
          log "  $api: ${checks:-no answer}"
          break
        fi
      done
    done
    [ "${#PENDING[@]}" -eq 0 ] && return 0
    [ "$SECONDS" -lt "$deadline" ] || return 1
    sleep "$POLL_INTERVAL"
  done
}

STEP=''
step() { # name command…
  STEP="$1"
  shift
  log "step=$STEP"
  "$@"
}

MAINTENANCE_ON='"maintenance":"failed: maintenance mode is on'
MAINTENANCE_OFF='"maintenance":"ok"'
SCHEMA_OK='"schema":"ok"'
NONE_FAILING='!":"failed'

roll_back() {
  log "failed step=$STEP before migrate changed the database; rolling back to the previous images"
  STEP=rollback
  PENDING=()
  write_images "$OLD_API_LINE" "$OLD_WEB_LINE" || {
    log "rollback could not restore .env; put back $OLD_API_LINE and $OLD_WEB_LINE yourself" >&2
    finish 4
  }
  log "restored $OLD_API_LINE"
  log "restored $OLD_WEB_LINE"
  if [ -n "$COMPOSE_SAVED" ]; then
    cp docker-compose.yml.previous docker-compose.yml || {
      log 'rollback could not restore docker-compose.yml; copy docker-compose.yml.previous over it yourself' >&2
      finish 4
    }
    log 'restored docker-compose.yml'
    read -r -a APIS <<< "$(compose config --services | grep '^api' | tr '\n' ' ')"
  fi
  if compose up -d --remove-orphans \
    && compose run --rm --no-deps api maintenance off \
    && replicas_report "$SCHEMA_TIMEOUT" "$SCHEMA_OK" "$MAINTENANCE_OFF"; then
    log 'rolled back: the previous images serve and maintenance mode is off'
    finish 3
  fi
  log "rollback failed: the previous images are in .env but not every API replica reports its schema ok with maintenance mode off (${PENDING[*]:-see above}); maintenance mode may still be on" >&2
  finish 4
}

fix_forward() { # reason
  log "failed step=$STEP after migrate changed the database: $1" >&2
  log 'the previous images refuse a database migrate has moved forward, so they were not put back; fix forward with these images or a newer release, or restore your backup (docs/self-host/upgrade.md#rollback)' >&2
  finish 5
}

log "from: $OLD_API_LINE"
log "from: $OLD_WEB_LINE"
log "to: STUDIO_API_IMAGE=$NEW_API"
log "to: STUDIO_WEB_IMAGE=$NEW_WEB"
log "api replicas: ${APIS[*]}"
log 'this script takes no backup'

step env write_env || roll_back
step maintenance-on compose run --rm --no-deps api maintenance on || roll_back
step maintenance-wait replicas_report "$MAINTENANCE_TIMEOUT" "$MAINTENANCE_ON" || roll_back
step stop compose stop "${APIS[@]}" worker || roll_back
step pull compose pull || roll_back
step up compose up -d --remove-orphans || roll_back
step migrate compose run --rm migrate || roll_back

if ! step schema-wait replicas_report "$SCHEMA_TIMEOUT" "$SCHEMA_OK"; then
  log "not ready: ${PENDING[*]:-}; recreating them once, as the guide's step 6 says"
  if ! compose up -d "${PENDING[@]}" || ! replicas_report "$SCHEMA_TIMEOUT" "$SCHEMA_OK"; then
    fix_forward "not every API replica reported its schema ok (${PENDING[*]:-}); maintenance mode is still on"
  fi
fi
step maintenance-off compose run --rm --no-deps api maintenance off \
  || fix_forward 'maintenance off failed; maintenance mode is still on'
if ! step reopen-wait replicas_report "$MAINTENANCE_TIMEOUT" "$MAINTENANCE_OFF" "$NONE_FAILING"; then
  if compose run --rm --no-deps api maintenance on; then
    fix_forward "not every API replica reported ready with maintenance mode off (${PENDING[*]:-}); maintenance mode was turned back on"
  fi
  fix_forward "not every API replica reported ready with maintenance mode off (${PENDING[*]:-}), and turning maintenance mode back on failed"
fi
log 'upgraded: the new images serve and maintenance mode is off'
finish 0
