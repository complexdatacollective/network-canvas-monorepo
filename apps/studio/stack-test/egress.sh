#!/usr/bin/env bash
set -euo pipefail

. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

parse_variant "$@"
egress_variant || die "egress.sh runs the telemetry-off and telemetry-on variants, not '$VARIANT'"

URL="$(ingress_url)"
ORIGIN="$(origin_url)"
COOKIE_JAR="$WORK_DIR/cookies"
OWNER_EMAIL="owner@stack-test.invalid"
OWNER_PASSWORD="stack-test-not-for-production"
INVITEE_EMAIL="invitee@stack-test.invalid"
TELEMETRY_HOST="us.i.posthog.com"
UPDATE_HOST="releases.networkcanvas.com"
ACME_HOST="acme-v02.api.letsencrypt.org"
CANARY_HOST="canary.egress-sink.test"
OBSERVATION_SECONDS=60
CAPTURE="$WORK_DIR/$VARIANT-egress.jsonl"
TAB="stack-test-egress-tab"

rm -f "$COOKIE_JAR" "$CAPTURE"

. "$STACK_TEST_DIR/checks.sh"

capture() {
  compose logs --no-color --no-log-prefix egress-sink 2>/dev/null | grep '^{' > "$CAPTURE" || true
}

seen_within() {
  local label="$1" pattern="$2" seconds="$3" waited
  for waited in $(seq 1 "$seconds"); do
    capture
    if grep -q -- "$pattern" "$CAPTURE"; then
      pass "$label" "after ${waited}s"
      return 0
    fi
    sleep 1
  done
  fail "$label" "nothing matching $pattern reached the sink within ${seconds}s"
}

builder() {
  RPC_ROUTE=/rpc/protocol-builder
  rpc "$1" "$2" -b "$COOKIE_JAR" -H "x-studio-client-session: $TAB"
  RPC_ROUTE=
}

psql_value() {
  compose exec -T postgres psql -U studio -d studio -v ON_ERROR_STOP=1 -tAq -c "$1" 2>/dev/null | tr -d '\r'
}

dns_names() {
  sed -n 's/.*"kind":"dns","name":"\([^"]*\)".*/\1/p' "$CAPTURE" | sort -u
}

named_connections() {
  {
    sed -n 's/.*"kind":"tls","port":[0-9]*,"sni":"\([^"]*\)".*/\1/p' "$CAPTURE"
    sed -n 's/.*"kind":"http","port":[0-9]*,"host":"\([^"]*\)".*/\1/p' "$CAPTURE"
  } | sort -u
}

echo "[stack-test] proving what leaves the machine for variant '$VARIANT' through $URL"

section 'the sink'
seen_within 'the egress sink is listening' '"kind":"ready"' 30
containers="$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT")"
differs 'the stack is running' '' "$containers"
for container in $containers; do
  service="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' "$container")"
  for network in $(docker inspect -f '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}} {{end}}' "$container"); do
    internal="$(docker network inspect -f '{{.Internal}}' "$network")"
    equals "$service is on $network, which has no route off the machine" true "$internal"
  done
  [ "$service" = egress-sink ] && continue
  resolvers="$(docker inspect -f '{{range .HostConfig.Dns}}{{.}} {{end}}' "$container" | sed 's/ *$//')"
  equals "$service resolves names off the machine through the sink" "$EGRESS_SINK_ADDRESS" "$resolvers"
done

section 'a researcher signs in'
[ -f "$TOKEN_FILE" ] || fail 'the setup token was captured' "no $TOKEN_FILE — run up.sh first"
rpc 'setup.complete' "{\"token\":\"$(cat "$TOKEN_FILE")\",\"instanceName\":\"Stack test ($VARIANT)\",\"owner\":{\"name\":\"Stack Test Owner\",\"email\":\"$OWNER_EMAIL\",\"password\":\"$OWNER_PASSWORD\"}}"
equals 'first-run setup creates the owner' Success "$RPC_VERDICT"
request -X POST "$URL/api/auth/sign-in/email" \
  -H 'Content-Type: application/json' \
  -H "Origin: $ORIGIN" \
  -c "$COOKIE_JAR" \
  --data-binary "{\"email\":\"$OWNER_EMAIL\",\"password\":\"$OWNER_PASSWORD\"}"
equals 'the owner signs in with a password' 200 "$STATUS"
signed_in_at="$(date +%s)"
rpc me null -b "$COOKIE_JAR"
equals 'the session is accepted by `me`' Success "$RPC_VERDICT"
contains '`me` is the owner' "$OWNER_EMAIL" "$RPC_EXIT"
user_id="$(printf '%s' "$RPC_EXIT" | sed -n 's/.*"userId":"\([^"]*\)".*/\1/p')"
differs 'the owner has a user id' '' "$user_id"

section 'an invitation is sent'
owner_team "$user_id"
rpc team.createInvitation "{\"teamId\":\"$TEAM_ID\",\"email\":\"$INVITEE_EMAIL\",\"role\":\"member\"}" -b "$COOKIE_JAR"
equals 'the owner invites a member' Success "$RPC_VERDICT"
contains 'the invitation is pending' '"status":"pending"' "$RPC_EXIT"

section 'the editor'
protocol_id="$(uuid)"
rpc protocols.create \
  "{\"teamId\":\"$TEAM_ID\",\"name\":\"Egress\",\"protocolId\":\"$protocol_id\",\"draftId\":\"$(uuid)\"}" \
  -b "$COOKIE_JAR"
equals 'a protocol is created' Success "$RPC_VERDICT"
builder AcquireLock "{\"protocolId\":\"$protocol_id\",\"sectionId\":\"settings\"}"
equals 'the editor takes the settings section' Success "$RPC_VERDICT"
contains 'and holds its lock' '"lock":"held"' "$RPC_EXIT"
document="$(printf '%s' "$RPC_EXIT" | sed -n 's/.*"document":\(.*\),"revision":{.*/\1/p')"
revision="$(printf '%s' "$RPC_EXIT" \
  | sed -n 's/.*"revision":\({"sequence":"[0-9]*","contentHash":"[^"]*"}\).*/\1/p')"
differs 'the lock came with the section document' '' "$document"
differs 'and with its revision' '' "$revision"
edited="${document/\"name\":\"Egress\"/\"name\":\"Egress, edited\"}"
differs 'the editor changes the document' "$document" "$edited"
builder Submit \
  "{\"protocolId\":\"$protocol_id\",\"requestId\":\"$(uuid)\",\"sectionId\":\"settings\",\"document\":$edited,\"revision\":$revision}"
equals 'the editor saves' Success "$RPC_VERDICT"

section 'background jobs'
seen_within 'the invitation email reaches the SMTP sink' '"kind":"smtp","port":25,"recipients":1' 120
jobs_schema="$(psql_value "select table_schema from information_schema.tables where table_name = 'job_schedules' limit 1")"
differs 'the job queue has a schema' '' "$jobs_schema"
delivery_state=''
for _ in $(seq 1 30); do
  delivery_state="$(psql_value "select state from $jobs_schema.jobs where queue = 'invitation-delivery' order by created_at desc limit 1")"
  [ "$delivery_state" = completed ] && break
  sleep 1
done
equals 'the invitation-delivery job completed' completed "$delivery_state"
due="$(psql_value "update $jobs_schema.job_schedules set next_run_at = now() where queue = 'update-check' returning name")"
equals 'the update check is due now' update-check "$due"
seen_within 'the update check reaches its sink' "\"sni\":\"$UPDATE_HOST\"" 120

if [ "$VARIANT" = telemetry-on ]; then
  section 'telemetry'
  seen_within "telemetry reaches the sink standing in for $TELEMETRY_HOST" "\"sni\":\"$TELEMETRY_HOST\"" 120
fi

remaining=$((OBSERVATION_SECONDS - ($(date +%s) - signed_in_at)))
if [ "$remaining" -gt 0 ]; then
  say "watching for ${remaining}s more, so the stack has been observed for ${OBSERVATION_SECONDS}s since sign-in"
  sleep "$remaining"
fi

section 'the sink saw to the end'
compose exec -T api node -e "require('node:dns').lookup('$CANARY_HOST', () => {})" >/dev/null 2>&1 || true
seen_within 'a lookup made last still reaches the sink' "\"name\":\"$CANARY_HOST\"" 30

section 'what left the machine'
capture
allowed="$(sed -e 's/#.*//' -e 's/[[:space:]]//g' "$STUDIO_DIR/docs/self-host/outbound-hosts.txt" | grep -v '^$')"
allowed="$(printf '%s\n%s\n' "$allowed" "$EGRESS_SMTP_HOST" | sort -u)"
contacted="$(printf '%s\n%s\n' "$(dns_names)" "$(named_connections)" | grep -v '^$' | grep -vxF "$CANARY_HOST" | sort -u)"
say "hosts contacted: $(printf '%s' "$contacted" | tr '\n' ' ')"
contains 'the update-check host was contacted' "$UPDATE_HOST" "$contacted"
contains 'the SMTP host was contacted' "$EGRESS_SMTP_HOST" "$contacted"
contains 'the ACME host was contacted' "$ACME_HOST" "$contacted"
unlisted="$(printf '%s\n' "$contacted" | grep -vxF -f <(printf '%s\n' "$allowed") || true)"
equals 'every host contacted is in outbound-hosts.txt or is the SMTP host' '' "$unlisted"
unnamed="$(grep -c '"sni":null' "$CAPTURE" || true)"
equals 'every TLS connection named its host' 0 "${unnamed:-0}"
telemetry_hosts="$(printf '%s\n' "$contacted" \
  | grep -vxF -f <(printf '%s\n' "$allowed" | grep -vxF "$TELEMETRY_HOST") || true)"
if [ "$VARIANT" = telemetry-on ]; then
  equals "$TELEMETRY_HOST is the only telemetry or analytics host contacted" "$TELEMETRY_HOST" "$telemetry_hosts"
else
  equals 'no telemetry or analytics host was contacted' '' "$telemetry_hosts"
fi

echo ''
echo "[stack-test] variant '$VARIANT' passed: nothing left the machine but $(printf '%s' "$contacted" | tr '\n' ' ')"
