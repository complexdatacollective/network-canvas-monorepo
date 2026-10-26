#!/usr/bin/env bash
set -u
state="$STUB_STATE"
[ "${1:-}" = compose ] && shift
echo "$*" >> "$state/calls.log"
files=()
while :; do
  case "${1:-}" in
    -f) files+=("$2"); shift 2 ;;
    --project-directory) shift 2 ;;
    *) break ;;
  esac
done
services() {
  local file="${files[0]:-docker-compose.yml}"
  if [ -f "$file" ]; then
    sed -n 's/^  \([a-z0-9-]*\):$/\1/p' "$file"
  else
    printf '%s\n' traefik web api api-b worker postgres garage migrate
  fi
}
env_image() { sed -n "s/^STUDIO_API_IMAGE=//p" .env; }
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
  config) services ;;
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
    ;;
  stop)
    should_fail stop && exit 1
    shift
    for service in "$@"; do touch "$state/stopped-$service"; done
    ;;
  pull) should_fail pull && exit 1 ;;
  up)
    should_fail up && exit 1
    shift
    targets=()
    for arg in "$@"; do [ "${arg#-}" = "$arg" ] && targets+=("$arg"); done
    [ "${#targets[@]}" -gt 0 ] || read -r -a targets <<< "$(services | grep -v '^migrate$' | tr '\n' ' ')"
    if [ "${*#*--remove-orphans}" != "$*" ]; then
      for running in "$state"/image-*; do
        service="${running##*/image-}"
        case " ${targets[*]} " in *" $service "*) ;; *) touch "$state/stopped-$service" ;; esac
      done
    fi
    set -- "${targets[@]}"
    for service in "$@"; do
      rm -f "$state/stopped-$service"
      case "$service" in api*) env_image > "$state/image-$service" ;; esac
      case " $* " in *' web '*) ;; *) [ -n "${STUB_STUCK_FOREVER:-}" ] || rm -f "$state/stuck-$service" ;; esac
    done
    ;;
  exec)
    service="$3"
    [ -f "$state/stopped-$service" ] && exit 1
    image="$(cat "$state/image-$service")"
    schema=ok
    [ "$(schema_of "$image")" = "$(cat "$state/db")" ] || schema='failed: the database schema is not this build’s'
    [ -f "$state/stuck-$service" ] && [ "$(schema_of "$image")" = new ] && schema='failed: the database schema is not this build’s'
    maintenance=ok
    [ "$schema" = ok ] || maintenance="$schema"
    [ "$(cat "$state/maintenance")" = on ] && [ -z "${STUB_IGNORE_FLAG:-}" ] && maintenance='failed: maintenance mode is on'
    [ -n "${STUB_STICKY_FLAG:-}" ] && [ -f "$state/flag-was-on" ] && maintenance='failed: maintenance mode is on'
    store=ok
    [ -n "${STUB_STORE_FAILING:-}" ] && [ "$(schema_of "$image")" = new ] && store='failed: unreachable'
    printf '{"db":"ok","objectStore":"%s","schema":"%s","maintenance":"%s"}\n' "$store" "$schema" "$maintenance"
    ;;
  *) echo "stub: unexpected $*" >&2; exit 99 ;;
esac
exit 0
