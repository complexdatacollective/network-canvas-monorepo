#!/usr/bin/env bash
# The Studio release test (#1901): upgrades a seeded instance with the guide's
# own sequence and proves the upgrade kept every row and kept the instance
# closed while it ran.
#
#   apps/studio/release-test/run.sh              # build, then runs A and B (and C)
#   apps/studio/release-test/run.sh --skip-build # reuse .work/images.env
#   apps/studio/release-test/run.sh --runs A     # one run
#
# Runs, each on a fresh stack torn down afterwards:
#
#   A  code-only       candidate → the candidate relabelled (new digests,
#                      same schema): `migrate` is a no-op
#   B  schema-bearing  candidate → candidate-next (build-next.sh): migration
#                      0002 with a delta, a backfill under RLS and a changed
#                      sidecar, against seeded rows
#   C  from a release  the previous PUBLISHED studio-api/studio-web → the
#                      candidate. Runs whenever previous-release.mjs finds a
#                      published release, and the lane fails if it then did not
#                      run and pass. Until one is published the summary says
#                      `previousRelease: none` — there is no migration-era
#                      release to upgrade from — and A and B are the proof.
#
# Each run: up with the "from" images, migrate, seed, first-run setup, export;
# upgrade.sh (the guide's sequence under the observer); export again; diff;
# then the run's own checks. Everything lands in $WORK_DIR/run-<name>/ and
# $WORK_DIR/summary.json.
#
# Requires Docker with Compose 2.24+, curl, perl, openssl, node, and this
# checkout with its dependencies installed — the seed and the candidate-next
# generator are checkout tools. Ports 80, 443, 5005 and 55433 must be free.
set -euo pipefail

# shellcheck source=./lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

RUNS="A,B"
SKIP_BUILD=0
while [ $# -gt 0 ]; do
  case "$1" in
    --runs)
      [ $# -ge 2 ] || die '--runs needs a value'
      RUNS="$2"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    *) die "Unknown argument: $1" ;;
  esac
done

hex() { openssl rand -hex "$1"; }
SUMMARY="$WORK_DIR/summary.json"
RESULTS=()

# ── Preflight ─────────────────────────────────────────────────────────────
command -v perl > /dev/null || die 'perl is required (the observer clock)'
docker compose version > /dev/null || die 'Docker Compose v2 is required'
for port in 80 443 "$DB_PORT"; do
  if (exec 3<> "/dev/tcp/127.0.0.1/$port") 2> /dev/null; then
    die "port $port is already in use on this host; the reference stack needs it"
  fi
done
mkdir -p "$WORK_DIR"

# ── The two file secrets ──────────────────────────────────────────────────
# Written only when absent, exactly as stack-test/up.sh writes them, so a
# developer's existing values are kept. Directory private, files readable by
# the unprivileged containers (stack-test/up.sh says why 644).
mkdir -p "$STUDIO_DIR/secrets" && chmod 700 "$STUDIO_DIR/secrets"
if [ ! -f "$STUDIO_DIR/secrets/postgres-password" ]; then
  hex 32 > "$STUDIO_DIR/secrets/postgres-password"
  chmod 644 "$STUDIO_DIR/secrets/postgres-password"
fi
if [ ! -f "$STUDIO_DIR/secrets/studio-secrets-key" ]; then
  echo "k1:$(openssl rand -base64 32)" > "$STUDIO_DIR/secrets/studio-secrets-key"
  chmod 644 "$STUDIO_DIR/secrets/studio-secrets-key"
fi

# ── Which release is the previous one ─────────────────────────────────────
previous="$(node "$RELEASE_TEST_DIR/previous-release.mjs")" \
  || die 'cannot tell whether a Studio release is published (see above); refusing to report an upgrade it did not check'
previous_status="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).status)' "$previous")"
previous_newest="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).newest ?? "")' "$previous")"
say "previous release: $previous"
if [ "$previous_status" = published ]; then
  case ",$RUNS," in
    *,C,*) ;;
    *) RUNS="$RUNS,C" ;;
  esac
fi

# ── Images ────────────────────────────────────────────────────────────────
if [ "$SKIP_BUILD" -eq 0 ]; then
  "$RELEASE_TEST_DIR/build.sh"
  case ",$RUNS," in *,B,*) "$RELEASE_TEST_DIR/build-next.sh" ;; esac
else
  [ -f "$IMAGES_ENV" ] || die "--skip-build needs $IMAGES_ENV from an earlier build"
  curl -fsS "http://$REGISTRY/v2/" > /dev/null 2>&1 \
    || die "--skip-build needs the registry build.sh started on $REGISTRY"
fi
CANDIDATE_API="$(image_var "$IMAGES_ENV" CANDIDATE_API)"
CANDIDATE_WEB="$(image_var "$IMAGES_ENV" CANDIDATE_WEB)"
CODE_API="$(image_var "$IMAGES_ENV" CODE_API)"
CODE_WEB="$(image_var "$IMAGES_ENV" CODE_WEB)"
NEXT_API="$(image_var "$IMAGES_ENV" NEXT_API)"
NEXT_VERSION="$(image_var "$IMAGES_ENV" NEXT_VERSION)"

# ── One run ───────────────────────────────────────────────────────────────
psql_() {
  docker compose exec -T postgres \
    sh -c 'psql -X -q -v ON_ERROR_STOP=1 -At -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
}

teardown() {
  [ -n "${DEPLOY_DIR:-}" ] && [ -f "$DEPLOY_DIR/.env" ] || return 0
  compose_all ps --all > "$RUN_DIR/ps.txt" 2>&1 || true
  compose_all logs --no-color > "$RUN_DIR/logs.txt" 2>&1 || true
  compose_all down --volumes --remove-orphans > /dev/null 2>&1 || true
}

# Anything a previous, interrupted run left under this project.
clear_project() {
  local leftovers
  leftovers="$(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT")"
  [ -z "$leftovers" ] || docker rm -f $leftovers > /dev/null
  leftovers="$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT")"
  [ -z "$leftovers" ] || docker volume rm $leftovers > /dev/null
  leftovers="$(docker network ls -q --filter "label=com.docker.compose.project=$PROJECT")"
  [ -z "$leftovers" ] || docker network rm $leftovers > /dev/null
}

write_env() { # api-image web-image
  cat > "$DEPLOY_DIR/.env" <<ENV
# Generated by apps/studio/release-test/run.sh for run $RUN_NAME.
STUDIO_HOSTNAME=$HOSTNAME_
ACME_EMAIL=nobody@localhost
STUDIO_API_IMAGE=$1
STUDIO_WEB_IMAGE=$2
STACK_SUBNET=$STACK_SUBNET
POSTGRES_USER=studio
POSTGRES_DB=studio
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
S3_REGION=garage
S3_BUCKET=studio
S3_ACCESS_KEY_ID=GK$(hex 12)
S3_SECRET_ACCESS_KEY=$(hex 32)
GARAGE_RPC_SECRET=$(hex 32)
GARAGE_ADMIN_TOKEN=$(hex 32)
DATABASE_URL=
S3_ENDPOINT=
REDIS_URL=
STUDIO_OBJECT_STORE=s3
AZURE_STORAGE_ACCOUNT_URL=
AZURE_STORAGE_CONTAINER=
AZURE_STORAGE_CONNECTION_STRING=
AZURE_CLIENT_ID=
SMTP_URL=
EMAIL_FROM=
ENV
  chmod 600 "$DEPLOY_DIR/.env"
}

# Runs migrate and prints the first-run token it issued, if any.
migrate_for_token() {
  local log="$RUN_DIR/migrate-$1.log"
  docker compose run --rm migrate > "$log" 2>&1 < /dev/null || {
    cat "$log"
    return 1
  }
  awk '
    /FIRST-RUN SETUP TOKEN/ { seen = 1; next }
    seen {
      candidate = $0
      gsub(/[[:space:]]/, "", candidate)
      if (candidate ~ /^[A-Za-z0-9_-]+$/ && length(candidate) >= 16) { print candidate; exit }
    }' "$log"
}

wait_ready() { # bound-seconds
  for _ in $(seq 1 "$1"); do
    [ "$(curl -k -s -o /dev/null -w '%{http_code}' --max-time 5 "$URL/readyz" || true)" = 200 ] && return 0
    sleep 1
  done
  return 1
}

seed() { # checkout root
  local password
  password="$(cat "$STUDIO_DIR/secrets/postgres-password")"
  # A clean environment: a developer's own STUDIO_* or DATABASE_URL must not
  # decide which database is wiped and reseeded, or under which keyring.
  (cd "$1/apps/studio/api" && env -i PATH="$PATH" HOME="$HOME" \
    DATABASE_URL="postgres://studio:$password@127.0.0.1:$DB_PORT/studio" \
    STUDIO_SECRETS_KEY_FILE="$STUDIO_DIR/secrets/studio-secrets-key" \
    BETTER_AUTH_SECRET="$(image_var "$DEPLOY_DIR/.env" BETTER_AUTH_SECRET)" \
    PUBLIC_URL="$URL" \
    node scripts/seed.ts) > "$RUN_DIR/seed.log" 2>&1 || {
    cat "$RUN_DIR/seed.log"
    return 1
  }
}

complete_setup() { # token
  local frame="$RUN_DIR/setup-frame" body
  printf '{"_tag":"Request","id":1,"tag":"setup.complete","payload":{"token":"%s","instanceName":"Release test %s","owner":{"name":"Release Test Owner","email":"owner@release-test.invalid","password":"release-test-not-for-production"}},"headers":[]}\n' \
    "$1" "$RUN_NAME" > "$frame"
  body="$(curl -k -s --max-time 30 -X POST "$URL/rpc" \
    -H 'Content-Type: application/ndjson' -H "Origin: $ORIGIN" \
    --data-binary "@$frame")"
  rm -f "$frame"
  case "$body" in
    *'"exit":{"_tag":"Success"'*) return 0 ;;
    *)
      echo "$body" | cut -c1-500
      return 1
      ;;
  esac
}

running_image_is() { # service image-reference
  local running wanted
  running="$(docker inspect --format '{{.Image}}' "$(docker compose ps -q "$1")")"
  wanted="$(docker image inspect --format '{{.Id}}' "$2")"
  [ "$running" = "$wanted" ]
}

history_versions() {
  echo 'SELECT string_agg(version, $$,$$ ORDER BY ordinal) FROM studio_migrations;' | psql_
}

# run_one <name> <from-api> <from-web> <to-api> <to-web> <seed-checkout>
run_one() {
  RUN_NAME="$1"
  local from_api="$2" from_web="$3" to_api="$4" to_web="$5" checkout="$6"
  RUN_DIR="$WORK_DIR/run-$RUN_NAME"
  local started checks=() problems=() diff_ok=false window_ok=false
  started="$(date +%s)"
  rm -rf "$RUN_DIR"
  mkdir -p "$RUN_DIR/deploy"
  ln -s "$STUDIO_DIR/secrets" "$RUN_DIR/deploy/secrets"
  use_deployment "$RUN_DIR/deploy"
  clear_project
  write_env "$from_api" "$from_web"
  trap teardown EXIT

  say "── run $RUN_NAME: $from_api → $to_api"
  docker compose up -d > "$RUN_DIR/up.log" 2>&1 || {
    cat "$RUN_DIR/up.log"
    die "run $RUN_NAME: the stack did not start"
  }
  migrate_for_token initial > /dev/null || die "run $RUN_NAME: the first migrate failed"
  wait_ready 120 || die "run $RUN_NAME: the 'from' stack never became ready"
  seed "$checkout" || die "run $RUN_NAME: the seed failed"
  # The seed replaces the instance's rows, the installation among them. A
  # second migrate is a no-op on the schema and issues a setup token only if
  # the instance still has no owner; when it does, setup is what the
  # instance needs next, through the API, as a self-hoster does it.
  local token owned
  token="$(migrate_for_token after-seed)" || die "run $RUN_NAME: migrate after the seed failed"
  if [ -n "$token" ]; then
    complete_setup "$token" || die "run $RUN_NAME: first-run setup failed"
  fi
  owned="$(echo 'SELECT count(*) FROM installation WHERE owner_user_id IS NOT NULL;' | psql_)"
  [ "$owned" = 1 ] || die "run $RUN_NAME: the seeded instance has no owner (and migrate issued no token to make one)"
  local history_before
  history_before="$(history_versions)"
  say "seeded and set up; migration history: $history_before"

  node "$RELEASE_TEST_DIR/export.mjs" "$RUN_DIR/before"

  local upgrade_ok=true
  "$RELEASE_TEST_DIR/upgrade.sh" "$RUN_DIR" "$to_api" "$to_web" || upgrade_ok=false
  [ -f "$RUN_DIR/window.json" ] && node -e 'process.exit(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).ok?0:1)' "$RUN_DIR/window.json" && window_ok=true
  $upgrade_ok || problems+=('the upgrade sequence failed (upgrade.sh above)')

  node "$RELEASE_TEST_DIR/export.mjs" "$RUN_DIR/after"
  local probe=''
  [ -f "$RUN_DIR/probe-job" ] && probe="$(cat "$RUN_DIR/probe-job")"
  if node "$RELEASE_TEST_DIR/diff-export.mjs" "$RUN_DIR/before" "$RUN_DIR/after" \
    "$RUN_DIR/diff.json" ${probe:+--probe-job "$probe"}; then
    diff_ok=true
  else
    problems+=('the export diff found unmasked differences (diff.json)')
  fi

  # The containers are the release's, not the ones that were running.
  for service in api worker; do
    if running_image_is "$service" "$to_api"; then
      checks+=("$service runs $to_api")
    else
      problems+=("$service is not running $to_api")
    fi
  done
  running_image_is web "$to_web" && checks+=("web runs $to_web") || problems+=("web is not running $to_web")

  local history_after
  history_after="$(history_versions)"
  case "$RUN_NAME" in
    A)
      [ "$history_after" = "$history_before" ] \
        && checks+=("migrate applied nothing: history is still $history_after") \
        || problems+=("a code-only release changed the migration history: $history_before → $history_after")
      ;;
    B)
      [ "$history_after" = "$history_before,$NEXT_VERSION" ] \
        && checks+=("migrate applied $NEXT_VERSION: history is $history_after") \
        || problems+=("expected history $history_before,$NEXT_VERSION, saw $history_after")
      local rows reached comment
      rows="$(echo 'SELECT count(*) FROM protocols;' | psql_)"
      reached="$(echo "SELECT count(*) FROM protocols WHERE release_test_probe = 'backfilled:' || id;" | psql_)"
      if [ "$rows" -gt 0 ] && [ "$reached" = "$rows" ]; then
        checks+=("the backfill reached all $rows seeded protocols rows under FORCE RLS")
      else
        problems+=("the backfill reached ${reached:-0} of $rows protocols rows")
      fi
      comment="$(echo "SELECT obj_description('public.deployment_state'::regclass, 'pg_class');" | psql_)"
      [ "$comment" = release-test-next ] \
        && checks+=('the changed sidecar statement is installed') \
        || problems+=("the changed sidecar was not re-run (comment: '${comment}')")
      ;;
  esac

  teardown
  trap - EXIT
  local ok=true
  $window_ok || problems+=('the maintenance window did not hold (window.json)')
  [ "${#problems[@]}" -eq 0 ] || ok=false

  node - "$RUN_DIR" "$RUN_NAME" "$from_api" "$to_api" "$ok" "$(($(date +%s) - started))" \
    "$(printf '%s\n' "${checks[@]:-}")" "$(printf '%s\n' "${problems[@]:-}")" > "$RUN_DIR/summary.json" <<'NODE'
const fs = require('node:fs');
const [dir, name, from, to, ok, seconds, checks, problems] = process.argv.slice(2);
const read = (file) => (fs.existsSync(`${dir}/${file}`) ? JSON.parse(fs.readFileSync(`${dir}/${file}`, 'utf8')) : null);
const window = read('window.json');
const diff = read('diff.json');
const lines = (text) => text.split('\n').filter((line) => line !== '');
console.log(JSON.stringify({
  run: name, from, to, ok: ok === 'true', seconds: Number(seconds),
  window: window && { ok: window.ok, failures: window.failures, ...window.evidence },
  diff: diff && { ok: diff.ok, tables: diff.tables, rowsBefore: diff.rowsBefore, unmasked: diff.differences.length, masked: diff.masked },
  checks: lines(checks), problems: lines(problems),
}, null, 2));
NODE
  RESULTS+=("$RUN_DIR/summary.json")
  if $ok; then
    say "run $RUN_NAME passed in $(($(date +%s) - started))s"
  else
    printf '[release-test] run %s FAILED:\n' "$RUN_NAME" >&2
    printf '  - %s\n' "${problems[@]}" >&2
  fi
}

# ── The runs ──────────────────────────────────────────────────────────────
ran_c=false
IFS=',' read -r -a selected <<< "$RUNS"
for run in "${selected[@]}"; do
  case "$run" in
    A) run_one A "$CANDIDATE_API" "$CANDIDATE_WEB" "$CODE_API" "$CODE_WEB" "$REPO_ROOT" ;;
    B)
      [ -n "$NEXT_API" ] || die "run B needs NEXT_API in $IMAGES_ENV — run build-next.sh"
      run_one B "$CANDIDATE_API" "$CANDIDATE_WEB" "$NEXT_API" "$CODE_WEB" "$REPO_ROOT"
      ;;
    C)
      [ "$previous_status" = published ] || die 'run C needs a published release, and previous-release.mjs found none'
      # The previous release's own seed, from its own commit.
      previous_tree="$WORK_DIR/previous-tree"
      git -C "$REPO_ROOT" worktree remove --force "$previous_tree" > /dev/null 2>&1 || true
      git -C "$REPO_ROOT" worktree add --detach "$previous_tree" "@codaco/studio-api@$previous_newest" \
        || die "no tag @codaco/studio-api@$previous_newest to seed the previous release from"
      (cd "$previous_tree" && pnpm install --frozen-lockfile --prefer-offline > "$WORK_DIR/previous-install.log" 2>&1) \
        || die "could not install the previous release's checkout (see $WORK_DIR/previous-install.log)"
      run_one C "ghcr.io/complexdatacollective/studio-api:$previous_newest" \
        "ghcr.io/complexdatacollective/studio-web:$previous_newest" \
        "$CANDIDATE_API" "$CANDIDATE_WEB" "$previous_tree"
      git -C "$REPO_ROOT" worktree remove --force "$previous_tree" > /dev/null 2>&1 || true
      ran_c=true
      ;;
    *) die "unknown run '$run' (A, B or C)" ;;
  esac
done

# ── Summary ───────────────────────────────────────────────────────────────
node - "$SUMMARY" "$previous" "$ran_c" "${RESULTS[@]}" <<'NODE'
const fs = require('node:fs');
const [out, previous, ranC, ...files] = process.argv.slice(2);
const runs = files.map((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
const release = JSON.parse(previous);
const summary = {
  previousRelease: release.status === 'published' ? release.newest : 'none',
  previousReleaseDetail: release.detail,
  runC: release.status === 'published'
    ? (ranC === 'true' ? 'ran' : 'did not run')
    : 'not applicable: no migration-era release is published, so there is no published upgrade path to test',
  ok: runs.length > 0 && runs.every((run) => run.ok) && (release.status !== 'published' || ranC === 'true'),
  runs,
};
fs.writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`\n[release-test] previousRelease: ${summary.previousRelease} — ${summary.previousReleaseDetail}`);
console.log(`[release-test] run C: ${summary.runC}`);
for (const run of runs) {
  console.log(`[release-test] run ${run.run}: ${run.ok ? 'passed' : 'FAILED'} in ${run.seconds}s`);
}
console.log(`[release-test] ${summary.ok ? 'PASSED' : 'FAILED'} — ${out}`);
process.exit(summary.ok ? 0 : 1);
NODE
