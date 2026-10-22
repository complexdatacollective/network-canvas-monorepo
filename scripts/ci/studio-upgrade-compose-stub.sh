#!/usr/bin/env bash
set -u
state="$STUB_STATE"
[ "${1:-}" = compose ] && shift
echo "$*" >> "$state/calls.log"
env_image() { sed -n "s/^STUDIO_${1:-API}_IMAGE=//p" "${STUB_RESOLVED_ENV:-.env}"; }
schema_of() { [ "$1" = "$STUB_NEW_API" ] && echo new || echo old; }
should_fail() {
  local key="$1" count=0 entry
  [ -f "$state/count-$key" ] && count="$(cat "$state/count-$key")"
  count=$((count + 1))
  echo "$count" > "$state/count-$key"
  for entry in $(tr ',' ' ' <<< "${STUB_FAIL:-}"); do
    [ "$entry" = "$key" ] || [ "$entry" = "$key:$count" ] && return 0
  done
  return 1
}
case "$1" in
  config)
    if [ "$2" = --images ]; then
      printf '%s\n' traefik "$(env_image WEB)" "$(env_image)" valkey postgres garage
    else
      printf '%s\n' traefik web api api-b worker postgres garage migrate
    fi
    ;;
  run)
    if [ "$*" = 'run --rm migrate' ]; then
      should_fail migrate && { echo 'migrate refused' >&2; exit 1; }
      image_schema="$(schema_of "$(env_image)")"
      [ "$(cat "$state/db")" = new ] && [ "$image_schema" = old ] && { echo 'migrate refused: newer history' >&2; exit 1; }
      echo "$image_schema" > "$state/db"
      should_fail migrate-commit && { echo 'migrate died after COMMIT' >&2; exit 1; }
      exit 0
    fi
    flag="${*: -1}"
    should_fail "maintenance-$flag" && exit 1
    echo "$flag" > "$state/maintenance"
    [ "$flag" = on ] && touch "$state/flag-was-on"
    [ "${STUB_SIGNAL:-}" = "maintenance-$flag" ] && kill -TERM "$PPID"
    should_fail "maintenance-$flag-commit" && exit 1
    ;;
  stop)
    should_fail stop && exit 1
    shift
    for service in "$@"; do touch "$state/stopped-$service"; done
    ;;
  pull)
    [ "${STUB_SIGNAL:-}" = pull ] && kill -TERM "$PPID"
    should_fail pull && exit 1
    ;;
  ps)
    shift 4
    for service in "$@"; do
      code=130
      should_fail "killed-$service" && code=137
      echo "$service exited $code False"
      [ -n "${STUB_ONEOFF:-}" ] && echo "$service exited 1 True"
    done
    ;;
  up)
    should_fail up && exit 1
    shift 2
    for service in "$@"; do
      rm -f "$state/stopped-$service"
      case "$service" in api*) env_image > "$state/image-$service" ;; esac
      case " $* " in *' web '*) ;; *) [ -n "${STUB_STUCK_FOREVER:-}" ] || rm -f "$state/stuck-$service" ;; esac
    done
    ;;
  exec)
    service="$3"
    should_fail "hang-$service" && exec sleep 120
    [ -f "$state/stopped-$service" ] && exit 1
    image="$(cat "$state/image-$service")"
    schema=ok
    [ "$(schema_of "$image")" = "$(cat "$state/db")" ] || schema='failed: the database schema is not this build’s'
    [ -f "$state/stuck-$service" ] && [ "$(schema_of "$image")" = new ] && schema='failed: the database schema is not this build’s'
    maintenance=ok
    [ "$schema" = ok ] || maintenance="$schema"
    [ "$(cat "$state/maintenance")" = on ] && [ -z "${STUB_IGNORE_FLAG:-}" ] && maintenance='failed: maintenance mode is on'
    [ -n "${STUB_STICKY_FLAG:-}" ] && [ -f "$state/flag-was-on" ] && maintenance='failed: maintenance mode is on'
    object_store=ok
    [ -n "${STUB_OBJECT_STORE_DOWN:-}" ] && object_store='failed: unreachable'
    status=ok
    [ "$schema/$maintenance/$object_store" = ok/ok/ok ] || status=failing
    printf '{"status":"%s","checks":{"db":"ok","objectStore":"%s","schema":"%s","maintenance":"%s"}}\n' "$status" "$object_store" "$schema" "$maintenance"
    ;;
  *) echo "stub: unexpected $*" >&2; exit 99 ;;
esac
exit 0
