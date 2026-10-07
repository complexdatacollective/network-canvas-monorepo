#!/usr/bin/env bash
# What the stack must do, through whatever ingress the variant put in front of
# it (#1909).
#
#   apps/studio/stack-test/assert.sh --variant reference
#
# Run after `up.sh --variant <same>`. Every assertion prints what it checked and
# the value it saw, so a passing run is a readable description of the contract
# and a failing one names the value that broke it. A failure exits non-zero
# after printing `docker compose ps` and the last 200 lines of the logs.
#
# The list is the same for every variant, deliberately: a swapped element has
# to meet the contract the element it replaced met, so the swap is proved by
# the same assertions passing and not by a weaker set. What each variant adds
# is structural — that the replaced service is really gone.
set -euo pipefail

# shellcheck source=./lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

parse_variant "$@"

URL="$(ingress_url)"
ORIGIN="$(origin_url)"
COOKIE_JAR="$WORK_DIR/cookies"
OWNER_EMAIL="owner@stack-test.invalid"
OWNER_PASSWORD="stack-test-not-for-production"
INSTANCE_NAME="Stack test ($VARIANT)"
# What a client claims its own address is, in the `X-Forwarded-For` it writes
# itself. A documentation-range address (RFC 5737) nothing here can hold, so
# the API recording it would mean the claim was believed — see the own-proxy
# section at the end.
PROBE_FORWARDED_FOR="203.0.113.7"

rm -f "$COOKIE_JAR"

diagnostics() {
  local code=$?
  [ "$code" -eq 0 ] && return 0
  echo ''
  echo '--- docker compose ps ---'
  compose ps --all 2>&1 || true
  echo '--- docker compose logs (last 200 lines) ---'
  compose logs --tail 200 2>&1 || true
}
trap diagnostics EXIT

pass() { printf '  ok    %-52s %s\n' "$1" "$2"; }

fail() {
  printf '  FAIL  %-52s %s\n' "$1" "$2" >&2
  exit 1
}

equals() { # label expected actual
  if [ "$2" = "$3" ]; then pass "$1" "$3"; else fail "$1" "expected '$2', saw '$3'"; fi
}

differs() { # label unexpected actual
  if [ "$2" != "$3" ]; then pass "$1" "$3"; else fail "$1" "saw the value it must not be: '$3'"; fi
}

contains() { # label needle haystack
  case "$3" in
    *"$2"*) pass "$1" "contains '$2'" ;;
    *) fail "$1" "'$2' is not in: $(printf '%s' "$3" | tr '\n' ' ' | cut -c1-300)" ;;
  esac
}

excludes() { # label needle haystack
  case "$3" in
    *"$2"*) fail "$1" "'$2' is in: $(printf '%s' "$3" | tr '\n' ' ' | cut -c1-300)" ;;
    *) pass "$1" "does not contain '$2'" ;;
  esac
}

# Sets STATUS, BODY and CONTENT_TYPE from one request through the ingress.
request() {
  local body_file="$WORK_DIR/.response-body" header_file="$WORK_DIR/.response-headers"
  # `|| true`: a connection that never completes is a `000` this suite reports
  # as the status it saw, not an abort that hides which assertion was running.
  STATUS="$(curl -k -s -o "$body_file" -D "$header_file" -w '%{http_code}' \
    --max-time 30 "$@" || true)"
  BODY="$(cat "$body_file")"
  CONTENT_TYPE="$(tr -d '\r' < "$header_file" \
    | awk 'tolower($1) == "content-type:" { print $2; exit }')"
}

# The transport answers 200 whatever the call did, so assert on RPC_VERDICT.
# The frame goes through a file: command substitution strips the trailing
# newline ndjson framing needs.
rpc() { # tag payload-json [extra curl args...]
  local tag="$1" payload="$2" frame_file="$WORK_DIR/.rpc-request" exit_frame
  shift 2
  printf '{"_tag":"Request","id":1,"tag":"%s","payload":%s,"headers":[]}\n' \
    "$tag" "$payload" > "$frame_file"
  request -X POST "$URL${RPC_ROUTE:-/rpc}" \
    -H 'Content-Type: application/ndjson' \
    -H "Origin: $ORIGIN" \
    "$@" \
    --data-binary "@$frame_file"
  exit_frame="$(printf '%s\n' "$BODY" | grep -m1 '"_tag":"Exit"' || true)"
  if [ -n "$exit_frame" ]; then
    RPC_EXIT="${exit_frame#*\"exit\":}"
  else
    RPC_EXIT=''
  fi
  RPC_VERDICT="$(printf '%s' "$RPC_EXIT" \
    | sed -n 's/^{"_tag":"\([A-Za-z]*\)".*/\1/p')"
  RPC_ERROR="$(printf '%s' "$RPC_EXIT" \
    | sed -n 's/.*"error":{"_tag":"\([A-Za-z]*\)".*/\1/p')"
}

# The container id of one service in this project, empty when it does not
# exist. Read from Docker's labels rather than from `compose ps`, which is
# scoped to the services the enabled profiles select and so cannot answer
# "is the service this variant disabled really gone?".
container_id() {
  docker ps -aq \
    --filter "label=com.docker.compose.project=$PROJECT" \
    --filter "label=com.docker.compose.service=$1"
}

api_address() {
  docker inspect -f \
    "{{(index .NetworkSettings.Networks \"${PROJECT}_default\").IPAddress}}" \
    "$(container_id api)"
}

section() {
  echo ''
  echo "[$VARIANT] $1"
}

echo "[stack-test] asserting variant '$VARIANT' through $URL"

# ── What this variant replaced is really gone ─────────────────────────────
#
# A swap that left the stack's own service running would pass every functional
# assertion below while proving nothing.
section 'the swapped element'
case "$VARIANT" in
  reference)
    for service in traefik web api worker postgres valkey garage; do
      differs "the stack's $service container exists" '' "$(container_id "$service")"
    done
    ;;
  external-postgres)
    equals "the stack's postgres container is gone" '' "$(container_id postgres)"
    differs 'the stub database is running' '' "$(container_id external-postgres)"
    ;;
  external-bucket)
    equals "the stack's garage container is gone" '' "$(container_id garage)"
    equals "the stack's garage-init container is gone" '' "$(container_id garage-init)"
    differs 'the stub object store is running' '' "$(container_id external-garage)"
    ;;
  external-bucket-azure)
    equals "the stack's garage container is gone" '' "$(container_id garage)"
    equals "the stack's garage-init container is gone" '' "$(container_id garage-init)"
    differs 'the stub blob store is running' '' "$(container_id external-azurite)"
    ;;
  external-redis)
    equals "the stack's valkey container is gone" '' "$(container_id valkey)"
    # Exists, not runs: `container_id` reads Docker's labels, which is what can
    # answer "is the service this variant disabled really gone?" and therefore
    # counts a stopped container too. That the stub is actually SERVING is the
    # limiter section's to prove, and it does.
    differs 'the stub rate-limit store exists' '' "$(container_id external-valkey)"
    ;;
  own-proxy)
    equals "the stack's traefik container is gone" '' "$(container_id traefik)"
    differs 'the nginx ingress is running' '' "$(container_id own-proxy)"
    ;;
  two-api)
    # Nothing is gone here; something is added. A second replica that never
    # started would leave every assertion below passing against one.
    differs 'the first API replica exists' '' "$(container_id api)"
    differs 'the second API replica exists' '' "$(container_id api-b)"
    differs 'they are two containers' "$(container_id api)" "$(container_id api-b)"
    ;;
esac

# ── The routing table ─────────────────────────────────────────────────────
section 'the routing table'

request "$URL/"
equals '/ is served' 200 "$STATUS"
contains '/ is the client shell' 'text/html' "$CONTENT_TYPE"

request "$URL/rpc"
equals 'GET /rpc is not a route' 404 "$STATUS"
contains '/rpc answers problem JSON' 'application/problem+json' "$CONTENT_TYPE"
contains '/rpc says Not Found' '"title":"Not Found"' "$BODY"

rpc status null
equals 'POST /rpc is served' 200 "$STATUS"
contains 'POST /rpc answers ndjson' 'application/ndjson' "$CONTENT_TYPE"
equals 'the rpc plane serves a public procedure' Success "$RPC_VERDICT"

RPC_ROUTE=/rpc/protocol-builder
rpc ListSections '{"protocolId":"00000000-0000-4000-8000-000000000000"}'
RPC_ROUTE=
equals 'POST /rpc/protocol-builder refuses a caller with no session' 401 "$STATUS"
equals 'as a problem document' 'application/problem+json' "$CONTENT_TYPE"
contains 'naming the refusal' '"status":401' "$BODY"
equals 'before any procedure answered' '' "$RPC_VERDICT"

request "$URL/readyz"
equals '/readyz is served' 200 "$STATUS"
contains '/readyz reports the database' '"db":"ok"' "$BODY"
contains '/readyz reports the schema' '"schema":"ok"' "$BODY"
contains '/readyz reports the object store' '"objectStore":"ok"' "$BODY"
# `ok`, not merely present: the limiter fails OPEN and reports `degraded` when
# it cannot reach its store, and a stack whose Redis was unreachable would
# still serve every assertion below. `degraded` here is the swap silently not
# having worked.
contains '/readyz reports the limiter' '"limiter":"ok"' "$BODY"
contains '/readyz is ok overall' '"status":"ok"' "$BODY"

# `--http1.1` because a WebSocket handshake is an HTTP/1.1 upgrade and both
# ingresses offer h2 over TLS, where `Connection: Upgrade` is not a legal
# header. What is being proved is that the upgrade reaches the API rather than
# a proxy's own 404: a 101 is the API accepting it, and a 401 or 403 is the
# API's origin and principal gates refusing a request it received.
ws_status="$(curl -k -s -i --http1.1 --max-time 10 \
  -H 'Connection: Upgrade' \
  -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' \
  -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" \
  "$URL/ws" 2>/dev/null | head -1 | tr -d '\r' | awk '{ print $2 }')"
case "$ws_status" in
  101 | 401 | 403) pass '/ws upgrade reaches the API' "$ws_status" ;;
  *) fail '/ws upgrade reaches the API' "expected 101, 401 or 403, saw '${ws_status:-none}'" ;;
esac

# ── First-run setup ───────────────────────────────────────────────────────
section 'first-run setup'
[ -f "$TOKEN_FILE" ] || fail 'the setup token was captured' "no $TOKEN_FILE — run up.sh first"
TOKEN="$(cat "$TOKEN_FILE")"
pass 'the setup token was captured' "${#TOKEN} characters"

setup_body() {
  cat <<JSON
{"token":"$1","instanceName":"$INSTANCE_NAME","owner":{"name":"Stack Test Owner","email":"$OWNER_EMAIL","password":"$OWNER_PASSWORD"}}
JSON
}

rpc 'setup.complete' "$(setup_body "$TOKEN")" -c "$COOKIE_JAR"
equals 'setup completes with the printed token' Success "$RPC_VERDICT"
contains 'setup names the instance' "$INSTANCE_NAME" "$RPC_EXIT"
contains 'setup signed the browser in' '"signedIn":true' "$RPC_EXIT"

# `me` takes no payload, whose wire form is `null`; `{}` dies in the decode.
rpc me null -b "$COOKIE_JAR"
equals "the owner's session is accepted by \`me\`" Success "$RPC_VERDICT"
contains '`me` is the owner' "$OWNER_EMAIL" "$RPC_EXIT"

RPC_ROUTE=/rpc/protocol-builder
rpc ListSections '{"protocolId":"00000000-0000-4000-8000-000000000000"}' \
  -b "$COOKIE_JAR"
RPC_ROUTE=
equals 'the protocol-builder plane admits the owner' Failure "$RPC_VERDICT"
equals 'and answers a missing protocol as not found' ProtocolNotFound "$RPC_ERROR"

rpc 'setup.complete' "$(setup_body "$TOKEN")"
equals 'a replayed token is refused' Failure "$RPC_VERDICT"
equals 'and refused as not found' NotFound "$RPC_ERROR"

# ── The object store, end to end ──────────────────────────────────────────
#
# `/readyz` proves the bucket or container answers; this proves Studio can
# write bytes to it and read them back. For the two object-store swaps it is
# the swap's whole contract, exercised over the same routes the reference
# stack uses.
section 'the object store'
probe="stack-test $VARIANT $(date -u +%Y-%m-%dT%H:%M:%SZ) $RANDOM"
request -X POST "$URL/storage" \
  -H 'Content-Type: text/plain' \
  -H "Origin: $ORIGIN" \
  -b "$COOKIE_JAR" \
  --data-binary "$probe"
equals 'an asset is stored through /storage' 201 "$STATUS"
hash="$(printf '%s' "$BODY" | sed -n 's/.*"hash":"\([0-9a-f]\{64\}\)".*/\1/p')"
differs 'the stored asset has a content hash' '' "$hash"

request "$URL/storage/$hash"
equals 'the stored asset is readable again' 200 "$STATUS"
equals 'the bytes came back unchanged' "$probe" "$BODY"

# ── The rate limiter, end to end ──────────────────────────────────────────
#
# What the rate-limit store has to do is run the limiter's scripts, and the
# only way to see that from outside is to be refused by it. `/readyz` reporting
# `limiter: ok` is a PING and nothing more — the limiter fails open, so a store
# that answered PING and dropped every script would leave every other assertion
# in this file green.
#
# Against the limit the build ships, because that is the only limit there is:
# the rate limits are constants rather than settings, so there is nothing for
# this suite to turn down and nothing it would prove by doing so. Sign-in is
# 10/10m per client address, making the eleventh attempt the first refused —
# and asserting WHICH attempt is refused is what makes this more than "a 429
# happened". Every scope and its constant are tabulated in the self-host
# guide's rate-limit section.
#
# A different email every time, deliberately: the per-email scope is 5/10m and
# would otherwise refuse the sixth, proving a different limit from the one this
# is about. Each address is nonsense, so none of these can succeed and none
# touches the owner account created above.
section 'the rate limiter'
SIGN_IN_ADDRESS_LIMIT=10
attempts=0
signin_status=''
while [ "$attempts" -lt $((SIGN_IN_ADDRESS_LIMIT + 1)) ]; do
  attempts=$((attempts + 1))
  request -X POST "$URL/api/auth/sign-in/email" \
    -H 'Content-Type: application/json' \
    -H "Origin: $ORIGIN" \
    --data-binary "{\"email\":\"rate-limit-$attempts@stack-test.invalid\",\"password\":\"$OWNER_PASSWORD\"}"
  signin_status="$STATUS"
  [ "$signin_status" = '429' ] && break
done
equals 'the sign-in limit refuses an eleventh attempt' 429 "$signin_status"
equals 'it refuses exactly where the shipped constant says' \
  $((SIGN_IN_ADDRESS_LIMIT + 1)) "$attempts"
retry_after="$(tr -d '\r' < "$WORK_DIR/.response-headers" \
  | awk 'tolower($1) == "retry-after:" { print $2; exit }')"
differs 'the refusal carries Retry-After' '' "$retry_after"
contains 'the refusal is problem JSON' 'application/problem+json' "$CONTENT_TYPE"

# And the counters are in the store `REDIS_URL` names, which for the swap is
# the stub and for every other variant is the stack's own Valkey. `KEYS` rather
# than `SCAN` because this keyspace holds a handful of entries and the store
# exists only for the length of this run.
limiter_store="$(limiter_store_service)"
limiter_keys="$(compose exec -T "$limiter_store" \
  valkey-cli --raw KEYS 'studio:rl:*' 2>/dev/null \
  | grep -c '^studio:rl:' || true)"
if [ "${limiter_keys:-0}" -gt 0 ]; then
  pass "the limiter's counters are in $limiter_store" "$limiter_keys keys"
else
  fail "the limiter's counters are in $limiter_store" \
    'no studio:rl:* key — the refusal above came from somewhere else'
fi
if [ "$VARIANT" = 'external-redis' ]; then
  # There is no second store to have written them to: the service that held
  # them before the swap is gone, which the swapped-element section asserted.
  equals 'and the stack has no Valkey of its own left' '' "$(container_id valkey)"
fi

# ── The maintenance window ────────────────────────────────────────────────
#
# `stop`, not `down`. Docker may still move the address, and the guide's nginx
# block resolves upstreams once, so a moved API takes the documented reload.
#
# Every API replica stops: the window is the one in which nothing answers, and
# with a replica still serving there would be no window to assert on.
section 'the maintenance window'
stopped_at="$(api_address)"
# shellcheck disable=SC2046 # one word per service, deliberately
compose stop $(api_services) >/dev/null 2>&1

request "$URL/rpc"
equals '/rpc is 503 while the API is stopped' 503 "$STATUS"
contains '/rpc is the maintenance page' 'temporarily unavailable' "$BODY"

# 502, 503 or 504, not one of them: a container that is gone takes its address
# with it, so the ingress's connection attempt is refused on some runs and
# times out on others — and once Traefik's health check has marked the only
# server down, it answers 503 itself rather than trying it. Which of the three
# it is says nothing about the routing; that this path is NOT the maintenance
# page is the contract.
request "$URL/readyz"
case "$STATUS" in
  502 | 503 | 504) pass '/readyz bypasses the maintenance page' "$STATUS" ;;
  *) fail '/readyz bypasses the maintenance page' "expected a gateway error (502, 503 or 504), saw '$STATUS'" ;;
esac
excludes '/readyz is the real status, not the page' 'temporarily unavailable' "$BODY"

request "$URL/"
equals '/ still serves the client' 200 "$STATUS"

# shellcheck disable=SC2046 # one word per service, deliberately
compose start $(api_services) >/dev/null 2>&1
if [ "$VARIANT" = "own-proxy" ]; then
  started_health=''
  for _ in $(seq 1 90); do
    started_health="$(docker inspect -f '{{.State.Health.Status}}' \
      "$(container_id api)" 2>/dev/null || true)"
    [ "$started_health" = 'healthy' ] && break
    sleep 1
  done
  started_at="$(api_address)"
  if [ "$stopped_at" != "$started_at" ]; then
    compose exec -T own-proxy nginx -s reload >/dev/null 2>&1
    pass 'the restarted API moved, so the ingress was reloaded' \
      "$stopped_at -> $started_at"
  fi
fi
for _ in $(seq 1 90); do
  restored="$(curl -k -s -o /dev/null -w '%{http_code}' --max-time 5 "$URL/readyz" || true)"
  [ "$restored" = "200" ] && break
  sleep 1
done
equals '/readyz recovers once the API is back' 200 "${restored:-none}"

# ── own-proxy: the upgrade window, and the forwarded headers ──────────────
#
# The maintenance window above stops and starts one container, which usually
# keeps its address. An UPGRADE replaces it — `docker compose up -d web api worker`, step
# 4 of docs/self-host/upgrade.md — and the replacement usually has a new one.
# nginx resolved the name in its `upstream` block once, when it loaded, so it
# goes on addressing the container that is gone and answers 502 until it is
# reloaded: measured here at 172.31.243.8 becoming .7, and 502 for as long as
# it was left alone. The reload is a documented step of that sequence because
# of this, and this is what holds the sequence to it.
#
# Whether the address actually moves is Docker's to decide — a replacement is
# sometimes handed the one the old container has just released — so the hazard
# is asserted only on the runs where it did move, and the recovery on all of
# them. Then the forwarded headers, against the reloaded ingress.
if [ "$VARIANT" = "own-proxy" ]; then
  section 'the upgrade window'
  before="$(api_address)"
  compose up -d --force-recreate web api worker >/dev/null 2>&1

  # Healthy FIRST, and read from the container's own healthcheck rather than
  # through the ingress: a probe taken while the replacement is still booting
  # answers 502 whatever the proxy knows, and would let this section pass
  # without the reload having done anything.
  api_health=''
  for _ in $(seq 1 90); do
    api_health="$(docker inspect -f '{{.State.Health.Status}}' \
      "$(container_id api)" 2>/dev/null || true)"
    [ "$api_health" = 'healthy' ] && break
    sleep 1
  done
  equals 'the replacement API is healthy in itself' healthy "$api_health"

  after="$(api_address)"
  pass 'the API was replaced' "$before -> $after"
  stale="$(curl -k -s -o /dev/null -w '%{http_code}' --max-time 15 "$URL/readyz" || true)"
  if [ "$before" = "$after" ]; then
    # Docker handed the replacement the address the old container had just
    # released, so there is no stale address to be stuck on and nothing to
    # prove here. The reload below is still asserted.
    pass 'the API kept its address, so the ingress was never stale' "$stale"
  else
    # The address moved, so this is the hazard itself: a healthy API the
    # ingress cannot reach, because it resolved the name once.
    case "$stale" in
      502 | 504) pass 'a healthy API is unreachable until the ingress reloads' "$stale" ;;
      *) fail 'a healthy API is unreachable until the ingress reloads' \
        "expected a gateway error, saw '$stale' — did nginx start resolving per request?" ;;
    esac
  fi

  compose exec -T own-proxy nginx -s reload >/dev/null 2>&1
  for _ in $(seq 1 30); do
    reloaded="$(curl -k -s -o /dev/null -w '%{http_code}' --max-time 5 "$URL/readyz" || true)"
    [ "$reloaded" = "200" ] && break
    sleep 1
  done
  equals 'the documented reload restores the ingress' 200 "${reloaded:-none}"

  section 'the forwarded headers'
  # The ingress has an address on each network, and the two are used for
  # different things: the API sees the one on the stack's network as its socket
  # peer, and the client dials the one on its own.
  proxy_id="$(container_id own-proxy)"
  proxy_ip="$(docker inspect -f \
    "{{(index .NetworkSettings.Networks \"${PROJECT}_default\").IPAddress}}" \
    "$proxy_id")"
  pass "the nginx ingress, on the stack's network" "$proxy_ip"
  proxy_external_ip="$(docker inspect -f \
    "{{(index .NetworkSettings.Networks \"$EXTERNAL_NETWORK\").IPAddress}}" \
    "$proxy_id")"
  pass 'the nginx ingress, where a client reaches it' "$proxy_external_ip"
  client_ip="$(docker inspect -f \
    "{{(index .NetworkSettings.Networks \"$EXTERNAL_NETWORK\").IPAddress}}" \
    "$(container_id own-proxy-client)")"
  pass "the client's own address, outside TRUSTED_PROXIES" "$client_ip"

  # `--resolve`, so the request carries the deployment's own hostname rather
  # than the service name it dials, exactly as a browser's would.
  signin_status="$(compose exec -T own-proxy-client curl -k -s \
    -o /dev/null -w '%{http_code}' --max-time 30 \
    --resolve "$HOSTNAME_:443:$proxy_external_ip" \
    -X POST "$ORIGIN/api/auth/sign-in/email" \
    -H 'Content-Type: application/json' \
    -H "Origin: $ORIGIN" \
    -H "X-Forwarded-For: $PROBE_FORWARDED_FOR" \
    --data-binary "{\"email\":\"$OWNER_EMAIL\",\"password\":\"$OWNER_PASSWORD\"}" \
    | tr -d '\r')"
  equals 'signing in through the proxy from outside' 200 "$signin_status"

  recorded="$(compose exec -T postgres \
    psql -U studio -d studio -tAc \
    'select "ipAddress" from session order by "createdAt" desc limit 1' \
    | tr -d '\r' | tail -1)"
  differs "the recorded address is not the proxy's own" "$proxy_ip" "$recorded"
  differs 'the recorded address is not the one the client asked for' \
    "$PROBE_FORWARDED_FOR" "$recorded"
  equals 'the recorded address is where the proxy saw the client' \
    "$client_ip" "$recorded"
fi

# ── two-api: an editor's lock survives the replica that granted it ────────
#
# What running more than one API is for. An editor takes a section's lock on
# one replica; that replica is then stopped, as a deploy or a failed host would
# stop it; the other replica carries on serving the same editor, and the
# editor's next save is still written.
#
# Through the unary plane and `curl`, because that is the one a shell can speak
# and it holds the same lease as a socket does: every call an editor makes to a
# replica tells the replica the editor is still there, and a replica renews the
# leases of the editors it has heard from. The lease lasts 30 seconds and is
# renewed every 10, so a save made after 40 seconds with nobody renewing it is
# refused as `NotLockHolder`. A pass here means the second replica really did
# renew what the first had granted.
#
# No sleeps except the spacing of the calls the scenario itself makes. Every
# wait is a poll for the state it is waiting on.
if [ "$VARIANT" = "two-api" ]; then
  section 'an editor across a replica stop'
  TAB='stack-test-tab-1'

  # A version-4 UUID from openssl, which this suite already needs.
  uuid() {
    local h
    h="$(openssl rand -hex 16)"
    printf '%s-%s-4%s-8%s-%s' "${h:0:8}" "${h:8:4}" "${h:13:3}" "${h:17:3}" "${h:20:12}"
  }

  # One call on the protocol-builder plane, as the editor's tab.
  builder() { # tag payload-json
    RPC_ROUTE=/rpc/protocol-builder
    rpc "$1" "$2" -b "$COOKIE_JAR" -H "x-studio-client-session: $TAB"
    RPC_ROUTE=
  }

  # The ingress has to have stopped sending requests to a replica that is gone
  # before the scenario can say which replica served them. Traefik notices on
  # its next health check, and until then it alternates between a live replica
  # and a dead one, so a single answer proves nothing: a run of them does.
  served_in_a_row() { # label needed [tag payload-json]
    local label="$1" needed="$2" streak=0 attempt served
    shift 2
    for attempt in $(seq 1 90); do
      served=no
      if [ "$#" -eq 2 ]; then
        builder "$1" "$2"
        [ "$RPC_VERDICT" = 'Success' ] && served=yes
      else
        request "$URL/readyz"
        [ "$STATUS" = '200' ] && served=yes
      fi
      if [ "$served" = 'yes' ]; then
        streak=$((streak + 1))
        if [ "$streak" -ge "$needed" ]; then
          pass "$label" "$streak answers in a row after ${attempt}s"
          return 0
        fi
      else
        streak=0
      fi
      sleep 1
    done
    fail "$label" "no run of $needed answers within 90s (last status ${STATUS:-none})"
  }

  # 1. Only the first replica is up, so it is the one that grants the lock.
  compose stop api-b >/dev/null 2>&1
  served_in_a_row 'the ingress serves from the first replica alone' 10

  # 2. A team, a protocol, and a section to edit. There is no HTTP route that
  # creates a team (the instance's own routes are blocked until teams have an
  # audited command), so the owner's team is a row, exactly as `scripts/seed`
  # writes one.
  rpc me null -b "$COOKIE_JAR"
  user_id="$(printf '%s' "$RPC_EXIT" | sed -n 's/.*"userId":"\([^"]*\)".*/\1/p')"
  differs 'the owner has a user id' '' "$user_id"
  team_id="$(uuid)"
  compose exec -T postgres psql -U studio -d studio -v ON_ERROR_STOP=1 -q \
    -c "insert into teams (id, name, slug) values ('$team_id', 'Stack test team', 'stack-test-team'); insert into team_members (id, team_id, user_id, role) values ('$(uuid)', '$team_id', '$user_id', 'owner');" \
    >/dev/null 2>&1 || fail 'the owner has a team' 'the insert into teams failed'
  pass 'the owner has a team' "$team_id"

  protocol_id="$(uuid)"
  draft_id="$(uuid)"
  rpc protocols.create \
    "{\"teamId\":\"$team_id\",\"name\":\"Two replicas\",\"protocolId\":\"$protocol_id\",\"draftId\":\"$draft_id\"}" \
    -b "$COOKIE_JAR"
  equals 'a protocol is created' Success "$RPC_VERDICT"

  builder ListSections "{\"protocolId\":\"$protocol_id\"}"
  equals 'the new protocol lists its sections' Success "$RPC_VERDICT"
  contains 'one of them is the settings section' '"settings"' "$RPC_EXIT"
  SECTION=settings

  # 3. The tab takes the lock. Its owner is this user and this tab id, which is
  # what the lease is held under whichever replica serves the next call.
  builder AcquireLock "{\"protocolId\":\"$protocol_id\",\"sectionId\":\"$SECTION\"}"
  equals 'the first replica grants the lock' Success "$RPC_VERDICT"
  contains 'and the tab holds it' '"lock":"held"' "$RPC_EXIT"
  document="$(printf '%s' "$RPC_EXIT" | sed -n 's/.*"document":\(.*\),"revision":{.*/\1/p')"
  revision="$(printf '%s' "$RPC_EXIT" \
    | sed -n 's/.*"revision":\({"sequence":"[0-9]*","contentHash":"[^"]*"}\).*/\1/p')"
  sequence_before="$(printf '%s' "$revision" | sed -n 's/.*"sequence":"\([0-9]*\)".*/\1/p')"
  differs 'the lock came with the section document' '' "$document"
  differs 'and with its revision' '' "$revision"

  # 4. The second replica joins, and is open before anything is taken from the
  # first.
  compose start api-b >/dev/null 2>&1
  for _ in $(seq 1 120); do
    compose exec -T api-b node -e \
      "fetch('http://127.0.0.1:3000/readyz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" \
      >/dev/null 2>&1 && break
    sleep 1
  done
  compose exec -T api-b node -e \
    "fetch('http://127.0.0.1:3000/readyz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" \
    >/dev/null 2>&1 || fail 'the second replica opens' 'its /readyz did not answer 200 within 120s'
  pass 'the second replica opens' 'its /readyz answered 200'

  # 5. The replica that granted the lock stops. From here only the second
  # replica can renew it.
  compose stop api >/dev/null 2>&1
  stopped_epoch="$(date +%s)"
  served_in_a_row 'the second replica serves the editor alone' 5 \
    ListSections "{\"protocolId\":\"$protocol_id\"}"

  # 6. The editor goes on working for longer than the lease lasts: a call every
  # five seconds, until forty have passed since the first replica stopped.
  # Forty, not thirty-five, so the margin over the 30 second lease is the
  # renewal interval and not a rounding.
  while [ "$(($(date +%s) - stopped_epoch))" -lt 40 ]; do
    sleep 5
    builder ListSections "{\"protocolId\":\"$protocol_id\"}"
    equals 'the editor is still served' Success "$RPC_VERDICT"
  done

  # 7. The save. Under the lease it was granted, by the second replica.
  edited="${document/\"name\":\"Two replicas\"/\"name\":\"Two replicas, edited\"}"
  differs 'the saved document differs from the one taken' "$document" "$edited"
  builder Submit \
    "{\"protocolId\":\"$protocol_id\",\"requestId\":\"$(uuid)\",\"sectionId\":\"$SECTION\",\"document\":$edited,\"revision\":$revision}"
  if [ "$RPC_VERDICT" = 'Success' ]; then
    pass 'the save is written after the first replica stopped' "$RPC_VERDICT"
  else
    fail 'the save is written after the first replica stopped' \
      "refused with ${RPC_ERROR:-no answer}: the lock lapsed once the replica that granted it stopped"
  fi
  sequence_after="$(printf '%s' "$RPC_EXIT" | sed -n 's/.*"sequence":"\([0-9]*\)".*/\1/p')"
  differs 'the write made a new revision' "$sequence_before" "$sequence_after"

  builder GetSection "{\"protocolId\":\"$protocol_id\",\"sectionId\":\"$SECTION\"}"
  equals 'the section reads back' Success "$RPC_VERDICT"
  contains 'with the edited name' 'Two replicas, edited' "$RPC_EXIT"
fi

echo ''
echo "[stack-test] variant '$VARIANT' passed"
