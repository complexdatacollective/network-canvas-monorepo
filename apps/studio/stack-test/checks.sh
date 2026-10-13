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
  CSP="$(tr -d '\r' < "$header_file" \
    | awk 'tolower($1) == "content-security-policy:" { $1 = ""; sub(/^ /, ""); print; exit }')"
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

section() {
  echo ''
  echo "[$VARIANT] $1"
}

# A version-4 UUID from openssl, which this suite already needs.
uuid() {
  local h
  h="$(openssl rand -hex 16)"
  printf '%s-%s-4%s-8%s-%s' "${h:0:8}" "${h:8:4}" "${h:13:3}" "${h:17:3}" "${h:20:12}"
}

owner_team() {
  TEAM_ID="$(uuid)"
  compose exec -T postgres psql -U studio -d studio -v ON_ERROR_STOP=1 -q \
    -c "insert into teams (id, name, slug) values ('$TEAM_ID', 'Stack test team', 'stack-test-team'); insert into team_members (id, team_id, user_id, role) values ('$(uuid)', '$TEAM_ID', '$1', 'owner');" \
    >/dev/null 2>&1 || fail 'the owner has a team' 'the insert into teams failed'
  pass 'the owner has a team' "$TEAM_ID"
}
