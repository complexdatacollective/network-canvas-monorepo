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

# One rpc call through the ingress, and the verdict that came back.
#
# Every procedure the client calls is on one route — `POST /rpc`, served by
# Effect's rpc server over ndjson — so a call names its tag in the envelope
# rather than in a path of its own. Sets everything `request` sets, and:
#
#   RPC_EXIT     the `exit` object of the response's one `Exit` frame
#   RPC_VERDICT  its `_tag`: `Success`, or `Failure` for a refusal or a defect
#   RPC_ERROR    the `_tag` of the declared error a `Fail` cause carries, and
#                empty for a success or for a defect
#
# The verdict is what an assertion has to read, because the transport answers
# 200 whatever the call did: a refusal is a 200 carrying a failing frame, and a
# payload the contract rejects is a 200 carrying a dying one. Delete the verdict
# assertions below and leave the status ones and this suite goes green against a
# server that refuses every call it is given.
#
# The frame goes through a file because its trailing newline is what ndjson
# framing means and command substitution strips one: a body without it leaves
# the frame sitting in the decoder's buffer, and the request is never answered.
rpc() { # tag payload-json [extra curl args...]
  local tag="$1" payload="$2" frame_file="$WORK_DIR/.rpc-request" exit_frame
  shift 2
  printf '{"_tag":"Request","id":1,"tag":"%s","payload":%s,"headers":[]}\n' \
    "$tag" "$payload" > "$frame_file"
  request -X POST "$URL/rpc" \
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
esac

# ── The routing table ─────────────────────────────────────────────────────
section 'the routing table'

request "$URL/"
equals '/ is served' 200 "$STATUS"
contains '/ is the client shell' 'text/html' "$CONTENT_TYPE"

# Two assertions about one path, because `/rpc` is one route now: the rpc
# plane's twenty procedures on POST, and nothing at all on GET.
#
# The GET is the assertion that was here before the plane collapsed onto this
# path, and it still says what it always said — that this path reaches the API
# and not the SPA shell. No GET route exists, so what answers is the shell's
# machine-surface 404 in problem JSON; nginx serving the client's HTML here
# instead would be a 200 and `text/html`, for every caller to cache.
request "$URL/rpc"
equals 'GET /rpc is not a route' 404 "$STATUS"
contains '/rpc answers problem JSON' 'application/problem+json' "$CONTENT_TYPE"
contains '/rpc says Not Found' '"title":"Not Found"' "$BODY"

# And the POST, which is the plane. `status` is the one procedure an instance
# answers before anybody has signed in — no payload, no session, no error
# channel — so it can be asked here, before setup has run, and asking it is
# what proves the route serves procedures rather than merely accepting a POST.
rpc status null
equals 'POST /rpc is served' 200 "$STATUS"
contains 'POST /rpc answers ndjson' 'application/ndjson' "$CONTENT_TYPE"
equals 'the rpc plane serves a public procedure' Success "$RPC_VERDICT"

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

# The procedure's payload, unwrapped: an rpc envelope carries the input as the
# handler's schema declares it.
setup_body() {
  cat <<JSON
{"token":"$1","instanceName":"$INSTANCE_NAME","owner":{"name":"Stack Test Owner","email":"$OWNER_EMAIL","password":"$OWNER_PASSWORD"}}
JSON
}

# `-c`, because the new owner's session leaves on this response: the procedure
# appends it through the `/rpc` route's `SetCookies` handler, and the jar is
# what carries it into `me` and `/storage` below.
rpc 'setup.complete' "$(setup_body "$TOKEN")" -c "$COOKIE_JAR"
equals 'setup completes with the printed token' Success "$RPC_VERDICT"
contains 'setup names the instance' "$INSTANCE_NAME" "$RPC_EXIT"
# The flag and the header have to agree: a response that set no cookie must not
# claim it signed anybody in, and the `me` call below is what settles which of
# the two was telling the truth.
contains 'setup signed the browser in' '"signedIn":true' "$RPC_EXIT"

# `null`, not `{}`: `me` declares no payload, whose wire form is `null`, and a
# value the schema refuses dies in the decode before the handler — inside a 200,
# like every other verdict here.
rpc me null -b "$COOKIE_JAR"
equals "the owner's session is accepted by \`me\`" Success "$RPC_VERDICT"
contains '`me` is the owner' "$OWNER_EMAIL" "$RPC_EXIT"

# Setup is closed once the instance has an owner, and the procedure says so as
# a typed refusal rather than as a status — `NotFound`, which is what `/setup`
# renders as its not-found screen. Both halves are asserted: `Failure` alone
# would also be the answer to a wrong token, and a suite that read only the
# status would see the same 200 it saw for the call that succeeded.
rpc 'setup.complete' "$(setup_body "$TOKEN")"
equals 'a replayed token is refused' Failure "$RPC_VERDICT"
equals 'and refused as not found' NotFound "$RPC_ERROR"

# ── The object store, end to end ──────────────────────────────────────────
#
# `/readyz` proves the bucket answers HeadBucket; this proves Studio can write
# bytes to it and read them back. For external-bucket it is the swap's whole
# contract, exercised over the same routes the reference stack uses.
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
# `stop`, not `down`: the same container is started again afterwards and gets
# its address back, which is what lets the nginx variant recover without a
# reload — the guide's block resolves its upstreams once, when nginx loads its
# configuration, so a REPLACED container would leave it pointing at an address
# that is no longer anybody's. That is an upgrade rather than a maintenance
# window, and it is the upgrade guide's to cover.
section 'the maintenance window'
compose stop api >/dev/null 2>&1

# `/rpc`, which is the whole of the rpc plane's surface now. What this asked
# for before, `/rpc/status`, was a procedure's own route and is not a path any
# more — and both ingresses match `/rpc` as a prefix, so the retired path would
# still answer the page. That is exactly why it changes: an assertion that goes
# on passing against a path nothing serves has stopped describing the
# deployment, and the next reader has no way to tell which of the two it was
# ever about.
#
# The contract is the ingress's rather than the API's, so any path routed to
# the API would do: while the API is down every one of them gets the page, and
# `/readyz` below gets it from neither ingress ever.
request "$URL/rpc"
equals '/rpc is 503 while the API is stopped' 503 "$STATUS"
contains '/rpc is the maintenance page' 'temporarily unavailable' "$BODY"

# 502 or 504, not one or the other: a container that is gone takes its address
# with it, so the ingress's connection attempt is refused on some runs and
# times out on others. Which of the two it is says nothing about the routing;
# that this path is NOT the maintenance page is the contract.
request "$URL/readyz"
case "$STATUS" in
  502 | 504) pass '/readyz bypasses the maintenance page' "$STATUS" ;;
  *) fail '/readyz bypasses the maintenance page' "expected a gateway error (502 or 504), saw '$STATUS'" ;;
esac
excludes '/readyz is the real status, not the page' 'temporarily unavailable' "$BODY"

request "$URL/"
equals '/ still serves the client' 200 "$STATUS"

compose start api >/dev/null 2>&1
for _ in $(seq 1 90); do
  restored="$(curl -k -s -o /dev/null -w '%{http_code}' --max-time 5 "$URL/readyz" || true)"
  [ "$restored" = "200" ] && break
  sleep 1
done
equals '/readyz recovers once the API is back' 200 "${restored:-none}"

# ── own-proxy: the upgrade window, and the forwarded headers ──────────────
#
# The maintenance window above stops and starts one container, which keeps its
# address. An UPGRADE replaces it — `docker compose up -d web api worker`, step
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
  api_address() {
    docker inspect -f \
      "{{(index .NetworkSettings.Networks \"${PROJECT}_default\").IPAddress}}" \
      "$(container_id api)"
  }
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

echo ''
echo "[stack-test] variant '$VARIANT' passed"
