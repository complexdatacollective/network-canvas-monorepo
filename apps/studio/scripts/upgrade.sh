#!/usr/bin/env bash
# Upgrades a running Network Canvas Studio stack to new images, by the sequence
# in docs/self-host/upgrade.md, and rolls back when the database is unchanged.
#
#   upgrade.sh [--dir <stack-dir>] <api-image> <web-image>
#
# Run it from the directory holding docker-compose.yml and .env, or name that
# directory with --dir. Both images must be pinned by digest
# (ghcr.io/complexdatacollective/studio-api@sha256:<64 hex>).
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
#   STUDIO_UPGRADE_AFTER_UP              a command run with bash in the stack directory
#                                        after every `up -d` that replaces containers,
#                                        such as reloading a proxy of your own; a
#                                        failure counts as a failed step
#   STUDIO_UPGRADE_AFTER_UP_TIMEOUT      seconds it may take before it is stopped and
#                                        counted as failed (default 60)
#
# Exit codes, each also printed as the last line, `[studio-upgrade] result=<name> exit=<code>`:
#   0  upgraded        the new images serve; web, the worker and every API
#                      replica run them and report ready; maintenance mode is off
#   2  not-started     bad arguments, settings or stack directory; nothing was changed
#   3  rolled-back     failed or was interrupted before migrate changed the
#                      database (or migrate refused, or found nothing to change);
#                      the previous images are back in .env and serve,
#                      maintenance mode is off
#   4  rollback-failed failed before migrate, and the rollback did not bring the
#                      previous images back ready; needs a human
#   5  fix-forward     migrate changed the database, then a later step failed or
#                      the script was interrupted; the previous images refuse
#                      that database, so they were not put back. The new images
#                      stay in .env, and maintenance mode is turned on again
#                      (the log says if that failed); needs a human
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
WHOLE='^(0|[1-9][0-9]*)$'
[[ "$MAINTENANCE_TIMEOUT" =~ $WHOLE ]] || refuse "STUDIO_UPGRADE_MAINTENANCE_TIMEOUT is not a whole number of seconds: $MAINTENANCE_TIMEOUT"
[[ "$SCHEMA_TIMEOUT" =~ $WHOLE ]] || refuse "STUDIO_UPGRADE_SCHEMA_TIMEOUT is not a whole number of seconds: $SCHEMA_TIMEOUT"
[[ "$POLL_INTERVAL" =~ ^[0-9]+(\.[0-9]+)?$ ]] || refuse "STUDIO_UPGRADE_POLL_INTERVAL is not a number of seconds: $POLL_INTERVAL"
AFTER_UP="${STUDIO_UPGRADE_AFTER_UP:-}"
AFTER_UP_TIMEOUT="${STUDIO_UPGRADE_AFTER_UP_TIMEOUT:-60}"
[[ "$AFTER_UP_TIMEOUT" =~ $WHOLE ]] || refuse "STUDIO_UPGRADE_AFTER_UP_TIMEOUT is not a whole number of seconds: $AFTER_UP_TIMEOUT"

cd "$STACK_DIR" 2> /dev/null || refuse "no such directory: $STACK_DIR"
[ -f .env ] || refuse "no .env in $(pwd)"
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

SERVICES="$(compose config --services)" || refuse "'${COMPOSE_CMD[*]} config --services' failed in $(pwd)"
read -r -a APIS <<< "$(grep '^api' <<< "$SERVICES" | tr '\n' ' ')"
[ "${#APIS[@]}" -gt 0 ] || refuse 'the stack has no API service (no service name starts with "api")'

env_value() { # line
  local value="${1#*=}"
  case "$value" in
    \"*\" | \'*\') value="${value:1:${#value}-2}" ;;
  esac
  printf '%s' "$value"
}
compose_reads() { # api-line web-line
  local images
  images="$(compose config --images)" || return 1
  grep -Fxq -- "$(env_value "$1")" <<< "$images" && grep -Fxq -- "$(env_value "$2")" <<< "$images"
}
compose_reads "$OLD_API_LINE" "$OLD_WEB_LINE" \
  || refuse "Compose does not take its images from $(pwd)/.env (is COMPOSE_ENV_FILES set, or --env-file in COMPOSE?), so rewriting .env would not change them"

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

replica_checks() { # service seconds
  "${COMPOSE_CMD[@]}" exec -T "$1" node -e "fetch('http://127.0.0.1:3000/readyz', { signal: AbortSignal.timeout($2 * 1000) }).then(r => r.json()).then(r => console.log(JSON.stringify(r)))" < /dev/null 2> /dev/null &
  local probe=$! end=$((SECONDS + $2))
  while kill -0 "$probe" 2> /dev/null; do
    if [ "$SECONDS" -ge "$end" ]; then
      kill "$probe" 2> /dev/null
      break
    fi
    sleep 0.1
  done
  wait "$probe"
}

PENDING=()
replicas_report() { # timeout pattern…
  local deadline=$((SECONDS + $1)) api checks pattern
  shift
  while :; do
    PENDING=()
    for api in "${APIS[@]}"; do
      checks="$(replica_checks "$api" $((deadline - SECONDS > 5 ? deadline - SECONDS : 5)))"
      for pattern in "$@"; do
        if { [[ "$pattern" == '!'* ]] && [[ "$checks" == *"${pattern#!}"* ]]; } \
          || { [[ "$pattern" != '!'* ]] && [[ "$checks" != *"$pattern"* ]]; }; then
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
READY='!"status":"failing"'

stop_drained() {
  compose stop "${APIS[@]}" worker || return 1
  local states unclean
  states="$(compose ps -a --format '{{.Service}} {{.State}} {{.ExitCode}} {{.Label "com.docker.compose.oneoff"}}' "${APIS[@]}" worker)" || return 1
  unclean="$(awk '$4 != "True" && ($2 != "exited" || $3 != 130) { print $1, $2, $3 }' <<< "$states")"
  [ -z "$unclean" ] && return 0
  log "not every API replica and worker exited through its own shutdown (want: exited 130; 137 means killed at the end of its stop grace period, with work it had started unfinished): $(tr '\n' ';' <<< "$unclean")" >&2
  return 1
}

services_check() { # api-image web-image timeout images|ready
  local deadline=$((SECONDS + $3)) states service want lines bad
  while :; do
    bad=()
    states="$(compose ps -a --format '{{.Service}}|{{.State}}|{{.Health}}|{{.Image}}|{{.Label "com.docker.compose.oneoff"}}' web "${APIS[@]}" worker)" || states=''
    for service in web "${APIS[@]}" worker; do
      want="$1"
      [ "$service" = web ] && want="$2"
      lines="$(awk -F'|' -v s="$service" '$1 == s && $5 != "True"' <<< "$states")"
      if [ -z "$lines" ] || awk -F'|' -v want="$want" -v mode="$4" '
        $4 != want || (mode == "ready" && ($2 != "running" || ($3 != "" && $3 != "healthy"))) { found = 1 }
        END { exit !found }
      ' <<< "$lines"; then
        bad+=("$service: ${lines:-no container} (want $want)")
      fi
    done
    [ "${#bad[@]}" -eq 0 ] && return 0
    if [ "$SECONDS" -ge "$deadline" ]; then
      log "  not $4 on the images it should run: $(printf '%s; ' "${bad[@]}")" >&2
      return 1
    fi
    sleep "$POLL_INTERVAL"
  done
}

after_up() {
  [ -n "$AFTER_UP" ] || return 0
  log "running STUDIO_UPGRADE_AFTER_UP: $AFTER_UP"
  bash -c "$AFTER_UP" < /dev/null &
  local hook=$! end=$((SECONDS + AFTER_UP_TIMEOUT)) code
  while kill -0 "$hook" 2> /dev/null; do
    if [ "$SECONDS" -ge "$end" ]; then
      pkill -P "$hook" 2> /dev/null
      kill "$hook" 2> /dev/null
      wait "$hook"
      log "STUDIO_UPGRADE_AFTER_UP did not finish within ${AFTER_UP_TIMEOUT}s and was stopped" >&2
      return 1
    fi
    sleep 0.1
  done
  wait "$hook"
  code=$?
  [ "$code" -eq 0 ] || log "STUDIO_UPGRADE_AFTER_UP failed with exit $code" >&2
  return "$code"
}

run_migrate() {
  local out code
  out="$(mktemp)" || return 1
  compose run --rm migrate 2>&1 | tee "$out"
  code=$?
  if [ "$code" -eq 0 ] && grep -qx 'Schema current\.' < <(tr -d '\r' < "$out") \
    && ! grep -q '^Upgraded [0-9]* pinned' "$out"; then
    log 'migrate changed nothing (Schema current.), so the previous images can still be put back'
  elif [ "$code" -eq 0 ]; then
    MIGRATED=1
  fi
  rm -f "$out"
  return "$code"
}

roll_back() {
  trap '' INT TERM HUP
  log "failed step=$STEP before migrate changed the database; rolling back to the previous images"
  STEP=rollback
  PENDING=()
  write_images "$OLD_API_LINE" "$OLD_WEB_LINE" || {
    log "rollback could not restore .env; put back $OLD_API_LINE and $OLD_WEB_LINE yourself" >&2
    finish 4
  }
  log "restored $OLD_API_LINE"
  log "restored $OLD_WEB_LINE"
  if compose up -d web "${APIS[@]}" worker \
    && after_up \
    && compose run --rm --no-deps api maintenance off \
    && replicas_report "$SCHEMA_TIMEOUT" "$SCHEMA_OK" "$MAINTENANCE_OFF" "$READY" \
    && services_check "$(env_value "$OLD_API_LINE")" "$(env_value "$OLD_WEB_LINE")" "$SCHEMA_TIMEOUT" ready; then
    log 'rolled back: the previous images serve and maintenance mode is off'
    finish 3
  fi
  log "rollback failed: the previous images are in .env but STUDIO_UPGRADE_AFTER_UP failed, web, the worker or an API replica is not running ready on them, or not every API replica reports its schema ok with maintenance mode off (${PENDING[*]:-see above}); maintenance mode may still be on" >&2
  finish 4
}

fix_forward() { # reason
  trap '' INT TERM HUP
  log "failed step=$STEP after migrate changed the database: $1" >&2
  STEP=maintenance-reassert
  if compose run --rm --no-deps api maintenance on; then
    log 'ran maintenance on again: maintenance mode is on'
  else
    log 'running maintenance on again failed: maintenance mode may be off, with the instance open' >&2
  fi
  log 'the previous images refuse a database migrate has moved forward, so they were not put back; fix forward with these images or a newer release, or restore your backup (docs/self-host/upgrade.md#rollback)' >&2
  finish 5
}

log "from: $OLD_API_LINE"
log "from: $OLD_WEB_LINE"
log "to: STUDIO_API_IMAGE=$NEW_API"
log "to: STUDIO_WEB_IMAGE=$NEW_WEB"
log "api replicas: ${APIS[*]}"
log 'this script takes no backup'

MIGRATED=''
after_migrate() { # reason
  [ -n "$MIGRATED" ] && fix_forward "$1"
  log "$1" >&2
  roll_back
}
interrupted() {
  log "interrupted at step=$STEP" >&2
  after_migrate 'interrupted'
}
trap interrupted INT TERM HUP

step env write_images "STUDIO_API_IMAGE=$NEW_API" "STUDIO_WEB_IMAGE=$NEW_WEB" || roll_back
compose_reads "STUDIO_API_IMAGE=$NEW_API" "STUDIO_WEB_IMAGE=$NEW_WEB" || {
  log 'Compose does not resolve the new images after .env was rewritten' >&2
  roll_back
}
step maintenance-on compose run --rm --no-deps api maintenance on || roll_back
step maintenance-wait replicas_report "$MAINTENANCE_TIMEOUT" "$MAINTENANCE_ON" || roll_back
step stop stop_drained || roll_back
step pull compose pull || roll_back
step up compose up -d web "${APIS[@]}" worker || roll_back
step after-up after_up || roll_back
step images services_check "$NEW_API" "$NEW_WEB" 0 images || roll_back
step migrate run_migrate || roll_back

if ! step schema-wait replicas_report "$SCHEMA_TIMEOUT" "$SCHEMA_OK"; then
  log "not ready: ${PENDING[*]:-}; recreating them once, as the guide's step 6 says"
  if ! compose up -d "${PENDING[@]}" || ! after_up; then
    after_migrate "recreating ${PENDING[*]:-} or STUDIO_UPGRADE_AFTER_UP after it failed"
  fi
  if ! replicas_report "$SCHEMA_TIMEOUT" "$SCHEMA_OK"; then
    after_migrate "not every API replica reported its schema ok (${PENDING[*]:-})"
  fi
fi
step services-wait services_check "$NEW_API" "$NEW_WEB" "$SCHEMA_TIMEOUT" ready \
  || after_migrate 'web, the worker or an API replica is not running ready on the new images'
step maintenance-off compose run --rm --no-deps api maintenance off \
  || after_migrate 'maintenance off failed, and may have landed'
step reopen-wait replicas_report "$MAINTENANCE_TIMEOUT" "$MAINTENANCE_OFF" "$READY" \
  || after_migrate "not every API replica reported ready with maintenance mode off (${PENDING[*]:-})"
log 'upgraded: the new images serve, web, the worker and every API replica run ready, and maintenance mode is off'
finish 0
