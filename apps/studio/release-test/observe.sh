#!/usr/bin/env bash
# The maintenance-window observer (#1901): what a user and a monitor saw for
# the whole of an upgrade, four times a second, until it is killed.
#
#   apps/studio/release-test/observe.sh <base-url> <log-file>
#
# Each tick appends one tab-separated line:
#
#   <epoch ms>  <readyz status>  <readyz body>  <probe status>  <probe kind>
#
# `/readyz` is read every tick because it is the one answer that names WHY the
# instance is closed: it is on the health route, which no maintenance page sits
# in front of. The API's own 503 on every other path never reaches a client
# unaltered — the reference stack's Traefik rewrites every 502 and 503 from
# `api` into the static page — so the probe of `/api/v1/status` can say only
# whether a user got the page (`page`), the API's problem document
# (`problem-maintenance`, on an ingress that passes it through), or something
# else (`other`). window.mjs reads this log beside the upgrade's step markers.
#
# Needs only curl and perl (for a millisecond clock on every platform), so a
# deploy script can run it unchanged against a real deployment.
set -uo pipefail

[ $# -eq 2 ] || {
  echo "usage: observe.sh <base-url> <log-file>" >&2
  exit 64
}
BASE="$1"
LOG="$2"
READY_BODY="$(mktemp)"
PROBE_BODY="$(mktemp)"
trap 'rm -f "$READY_BODY" "$PROBE_BODY"' EXIT

now_ms() { perl -MTime::HiRes=time -e 'printf "%d\n", time * 1000'; }

# One curl for both requests (`--next`), and bash builtins for everything
# else: on a host whose security agent taxes every process launch, a tick that
# spawned six processes took seconds rather than a quarter of one. Each request
# is bounded well under a second, so a closed connection or an ingress that is
# itself restarting shows up as its own tick (status 000) rather than as a gap.
while :; do
  ts="$(now_ms)"
  : > "$READY_BODY"
  : > "$PROBE_BODY"
  codes="$(curl -k -s --max-time 0.8 -o "$READY_BODY" -w '%{http_code} ' "$BASE/readyz" \
    --next -k -s --max-time 0.8 -o "$PROBE_BODY" -w '%{http_code}' "$BASE/api/v1/status" \
    2> /dev/null)"
  read -r ready_code probe_code <<< "$codes"
  ready_code="${ready_code:-000}"
  probe_code="${probe_code:-000}"

  ready_body=''
  IFS= read -r -d '' ready_body < "$READY_BODY" || true
  ready_body="${ready_body//$'\t'/ }"
  ready_body="${ready_body//$'\r'/}"
  ready_body="${ready_body//$'\n'/ }"
  probe_body=''
  IFS= read -r -d '' probe_body < "$PROBE_BODY" || true
  case "$probe_body" in
    *'temporarily unavailable'*) kind=page ;;
    *'"type":"urn:networkcanvas:studio:problem:maintenance"'*) kind=problem-maintenance ;;
    *) kind=other ;;
  esac

  printf '%s\t%s\t%s\t%s\t%s\n' "$ts" "$ready_code" "${ready_body:--}" "$probe_code" "$kind" >> "$LOG"
  sleep 0.25
done
