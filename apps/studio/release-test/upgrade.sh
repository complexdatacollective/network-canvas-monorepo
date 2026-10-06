#!/usr/bin/env bash
# Upgrades a running deployment by executing the guide's upgrade sequence
# verbatim, under the maintenance-window observer (#1901).
#
#   apps/studio/release-test/upgrade.sh <run-dir> <to-api-image> <to-web-image>
#
# <run-dir>/deploy is the deployment directory run.sh prepared: `.env`, the
# `secrets` the stack reads, and the place the backup lands — the directory a
# self-hoster runs `docker compose` from. The sequence is read from the
# `<!-- upgrade-sequence -->` block of docs/self-host/upgrade.md and each of
# its commands is run as written. Its two comments are instructions, and each
# is carried out as the guide words it: the backup comment by the
# `<!-- backup-take -->` block of docs/self-host/backup.md, also as written,
# and the readiness comment by waiting for /readyz to name maintenance mode.
# Nothing in either block is edited, so a change to the guide changes what
# this runs, and a guide that stops parsing fails here.
#
# What the guide asks for before the sequence — the new digests in `.env` —
# is done first, as an operator does it. What it asks for after — `/readyz`
# answering 200 — is waited for, bounded. Every step is bounded too, so a
# wait the guide asks for that never ends fails the run rather than hanging it.
#
# Around the sequence:
#   - observe.sh records /readyz and a probe four times a second (faster while
#     `migrate` runs), and window.mjs then decides whether the instance was
#     closed throughout;
#   - once the guide's own wait says the worker has paused, one
#     `protocol-store-gc` job is enqueued as the application role. It must
#     still be `created` after `migrate`, and still `created` once the NEW
#     worker — the one `up -d` started — is running with the flag on, and it
#     must be completed after `maintenance off` cleared the flag;
#   - before `maintenance off`, the lane waits for that new worker to start,
#     and for the new api to answer /readyz naming maintenance mode, so the
#     new build's own maintenance gates are live inside the window. The
#     guide does not need these waits (the flag keeps a late process closed
#     either way); the proof does, or on a fast `migrate` the new processes
#     would only ever start after the window and their gates would go
#     untested.
set -euo pipefail

# shellcheck source=./lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

[ $# -eq 3 ] || die "usage: upgrade.sh <run-dir> <to-api-image> <to-web-image>"
RUN_DIR="$1"
TO_API="$2"
TO_WEB="$3"
use_deployment "$RUN_DIR/deploy"

EVENTS="$RUN_DIR/events.tsv"
OBSERVED="$RUN_DIR/observe.tsv"
FAST="$RUN_DIR/observe-fast"
PROBE_JOB_FILE="$RUN_DIR/probe-job"
NEW_WORKER_FILE="$RUN_DIR/new-worker.json"
READY_BOUND=180
STEP_BOUND=900
WAIT_STEP_BOUND=30
NEW_WORKER_BOUND=120
rm -f "$EVENTS" "$OBSERVED" "$FAST" "$PROBE_JOB_FILE" "$NEW_WORKER_FILE" "$RUN_DIR/pause-lag-ms"

now_ms() { perl -MTime::HiRes=time -e 'printf "%d\n", time * 1000'; }

SEQUENCE="$(guide_block "$STUDIO_DIR/docs/self-host/upgrade.md" upgrade-sequence)"
BACKUP="$(guide_block "$STUDIO_DIR/docs/self-host/backup.md" backup-take)"
[ -n "$SEQUENCE" ] || die 'docs/self-host/upgrade.md has no <!-- upgrade-sequence --> bash block'
[ -n "$BACKUP" ] || die 'docs/self-host/backup.md has no <!-- backup-take --> bash block'
grep -q '^# take your backup' <<< "$SEQUENCE" \
  || die "the upgrade sequence no longer has its '# take your backup' line, which is where backup.md's block runs"
grep -q '^# wait until /readyz names maintenance mode' <<< "$SEQUENCE" \
  || die "the upgrade sequence no longer has its '# wait until /readyz names maintenance mode' line"
grep -q '^until .*stopped claiming jobs' <<< "$SEQUENCE" \
  || die "the upgrade sequence no longer waits for the worker's pause before the backup"

job_state() {
  [ -f "$PROBE_JOB_FILE" ] || return 0
  echo "SELECT state FROM studio_jobs.jobs WHERE id = '$(cat "$PROBE_JOB_FILE")';" | psql_
}

# A failure after the observer starts is recorded rather than fatal, so the
# window is still analysed: what /readyz said while the sequence went wrong is
# the most useful evidence a failed run has.
FAILURES=()
fail() {
  echo "[release-test] FAIL: $*" >&2
  FAILURES+=("$*")
}

# Runs a command and kills it after <seconds>. Not a sleep: the command ends
# the moment it is done, and the bound only turns a wait that never ends into
# a failed step.
bounded() { # seconds command…
  local seconds="$1" pid watchdog code=0
  shift
  "$@" &
  pid=$!
  (
    sleep "$seconds"
    kill -TERM "$pid" 2> /dev/null
  ) &
  watchdog=$!
  wait "$pid" || code=$?
  kill "$watchdog" 2> /dev/null || true
  wait "$watchdog" 2> /dev/null || true
  return "$code"
}

# The guide's readiness comment, as it words it: /readyz names maintenance
# mode. Bounded at 10 s; window.mjs separately requires it within 3.
wait_readyz_maintenance() {
  for _ in $(seq 1 40); do
    case "$(curl -k -s --max-time 1 "$URL/readyz" || true)" in
      *'"maintenance":"failed: maintenance mode is on'*) return 0 ;;
    esac
    sleep 0.25
  done
  echo '/readyz did not name maintenance mode within 10 s' >&2
  return 1
}

enqueue_probe() {
  local id
  id="$(node "$RELEASE_TEST_DIR/enqueue-probe.mjs" | psql_ | tail -n 1)"
  if [ -z "$id" ]; then
    # The queue is a singleton: a job already waiting (the hourly cron's) is
    # the one this proof follows instead — queued before the upgrade either way.
    id="$(echo "SELECT id FROM studio_jobs.jobs WHERE queue = 'protocol-store-gc' AND state = 'created' ORDER BY created_at LIMIT 1;" | psql_)"
  fi
  [ -n "$id" ] || die 'could not enqueue the probe job, and none was waiting'
  echo "$id" > "$PROBE_JOB_FILE"
  say "  probe job $id enqueued as studio_app (state: $(job_state))"
}

worker_container() { docker compose ps -q worker; }

# The api `up -d` started has taken its first reading of the flag: /readyz
# names maintenance mode. Only the new api is running by now (`up -d`
# replaced the old one), so any api answer is its. Until it has read the flag
# it says it is starting, or Traefik answers for it.
wait_for_new_api() { # since-ms
  local deadline=$((SECONDS + NEW_WORKER_BOUND))
  while [ "$SECONDS" -lt "$deadline" ]; do
    case "$(curl -k -s --max-time 1 "$URL/readyz" || true)" in
      *'"maintenance":"failed: maintenance mode is on'*)
        say "  the new api named maintenance mode by $(($(now_ms) - $1)) ms after up -d returned"
        return 0
        ;;
    esac
    sleep 0.25
  done
  fail "the new api did not answer /readyz naming maintenance mode within ${NEW_WORKER_BOUND}s of up -d"
  return 1
}

# The worker `up -d` started has come up with the flag on: it logged that it
# started, which it does only once its schema is current and its maintenance
# gate has taken its first reading — and that reading paused it. A worker
# that ignores the flag logs no pause. One that started before `migrate`
# moved the schema logged "Database schema current." when it saw the change.
wait_for_new_worker() { # container since-ms
  local log started_ms paused schema_current
  for _ in $(seq 1 $((NEW_WORKER_BOUND * 2))); do
    log="$(docker logs "$1" 2>&1 || true)"
    if grep -q 'Network Canvas Studio worker .* started' <<< "$log"; then
      started_ms="$(now_ms)"
      paused=false
      schema_current=false
      grep -q 'the job worker has stopped claiming jobs' <<< "$log" && paused=true
      grep -q 'Database schema current\.' <<< "$log" && schema_current=true
      printf '{"container":"%s","seenStartedMsAfterUp":%s,"paused":%s,"loggedSchemaCurrent":%s}\n' \
        "$1" "$((started_ms - $2))" "$paused" "$schema_current" > "$NEW_WORKER_FILE"
      say "  the new worker had started by $((started_ms - $2)) ms after up -d returned (paused: $paused; logged 'Database schema current.': $schema_current)"
      $paused || fail 'the new worker started with maintenance mode on and did not pause'
      return 0
    fi
    sleep 0.5
  done
  fail "the new worker did not start within ${NEW_WORKER_BOUND}s of migrate (docker logs $1)"
  return 1
}

# ── The new digests, as the guide's step 3 asks ───────────────────────────
set_images "$TO_API" "$TO_WEB"

# ── The observer ──────────────────────────────────────────────────────────
"$RELEASE_TEST_DIR/observe.sh" "$URL" "$OBSERVED" "$FAST" &
OBSERVER=$!
trap 'kill "$OBSERVER" 2> /dev/null || true; rm -f "$FAST"' EXIT
for _ in $(seq 1 40); do
  [ -s "$OBSERVED" ] && break
  sleep 0.25
done
[ -s "$OBSERVED" ] || die 'the observer recorded nothing'

# ── The sequence ──────────────────────────────────────────────────────────
index=0
run_step() { # bound-seconds label command…
  local bound="$1" label="$2" code=0
  shift 2
  index=$((index + 1))
  printf '%s\tstart\t%s\t%s\n' "$(now_ms)" "$index" "$label" >> "$EVENTS"
  say "step $index: $label"
  # stdin from /dev/null: `docker compose run` reads it, and would otherwise
  # swallow the rest of the sequence this loop is reading.
  (cd "$DEPLOY_DIR" && bounded "$bound" "$@") < /dev/null || code=$?
  printf '%s\tend\t%s\t%s\n' "$(now_ms)" "$index" "$code" >> "$EVENTS"
  [ "$code" -eq 0 ] || {
    fail "step $index ($label) exited $code"
    return 1
  }
}

on_returned_ms=''
old_worker=''
new_worker=''
up_returned_ms=''
while IFS= read -r line; do
  case "$line" in
    '' | ' '*) continue ;;
    '# take your backup'*)
      run_step "$STEP_BOUND" 'backup (docs/self-host/backup.md)' bash -eo pipefail -c "$BACKUP" || break
      ;;
    '# wait until /readyz names maintenance mode'*)
      run_step "$WAIT_STEP_BOUND" 'wait until /readyz names maintenance mode (upgrade.md step 2)' \
        wait_readyz_maintenance || break
      ;;
    '#'*) continue ;;
    *)
      bound="$STEP_BOUND"
      case "$line" in
        'until '*) bound="$WAIT_STEP_BOUND" ;;
        *'up -d'*) old_worker="$(worker_container)" ;;
        *'run --rm migrate'*) touch "$FAST" ;;
        *'maintenance off'*)
          # The new worker's gate, live inside the window: it started with
          # the flag on, paused, and has not claimed the job queued before
          # the upgrade.
          if [ -n "$new_worker" ]; then
            wait_for_new_worker "$new_worker" "$up_returned_ms" || true
          fi
          if [ -n "$up_returned_ms" ]; then
            wait_for_new_api "$up_returned_ms" || true
          fi
          state="$(job_state)"
          if [ "$state" = created ]; then
            say "  probe job still created with the new worker running, immediately before maintenance off"
          else
            fail "the probe job is '${state:-not enqueued}' immediately before maintenance off, with the new worker running; a job queued during the window must wait for the flag to clear"
          fi
          ;;
      esac
      run_step "$bound" "$line" bash -eo pipefail -c "$line" || break
      case "$line" in
        *'maintenance on'*) on_returned_ms="$(now_ms)" ;;
        'until '*'stopped claiming jobs'*)
          # The guide's own wait for the worker's pause has returned, so a
          # job queued now must wait out the window.
          echo $(($(now_ms) - on_returned_ms)) > "$RUN_DIR/pause-lag-ms"
          say "  the guide's wait saw the worker's pause $(cat "$RUN_DIR/pause-lag-ms") ms after maintenance on returned"
          enqueue_probe
          ;;
        *'up -d'*)
          up_returned_ms="$(now_ms)"
          new_worker="$(worker_container)"
          if [ -z "$new_worker" ] || [ "$new_worker" = "$old_worker" ]; then
            fail "up -d did not replace the worker container (${old_worker:-none} → ${new_worker:-none})"
            new_worker=''
          fi
          ;;
        *'run --rm migrate'*)
          rm -f "$FAST"
          state="$(job_state)"
          if [ "$state" = created ]; then
            say "  probe job still created after migrate"
          else
            fail "the probe job is '${state:-not enqueued}' after migrate; a job queued during the window must wait for it"
          fi
          ;;
      esac
      ;;
  esac
done <<< "$SEQUENCE"
rm -f "$FAST"

# ── Readiness, as the guide's last line asks ──────────────────────────────
ready=''
for second in $(seq 1 "$READY_BOUND"); do
  if [ "$(curl -k -s -o /dev/null -w '%{http_code}' --max-time 5 "$URL/readyz" || true)" = 200 ]; then
    ready="$second"
    break
  fi
  sleep 1
done
if [ -n "$ready" ]; then
  say "/readyz answered 200 ${ready}s after the sequence ended"
else
  fail "/readyz did not answer 200 within ${READY_BOUND}s of the sequence ending: $(curl -k -s --max-time 5 "$URL/readyz" || true)"
fi

# Let the observer see the reopened instance — a tick taken after this point
# — then stop it.
reopened_at="$(now_ms)"
for _ in $(seq 1 60); do
  awk -F'\t' -v after="$reopened_at" '$1 > after && $2 == 200 && $4 == 200 { found = 1 } END { exit !found }' "$OBSERVED" && break
  sleep 0.25
done
kill "$OBSERVER" 2> /dev/null || true
wait "$OBSERVER" 2> /dev/null || true
trap - EXIT

# ── The probe job is worked, and only after the flag cleared ──────────────
state=''
if [ -n "$ready" ] && [ -f "$PROBE_JOB_FILE" ]; then
  for _ in $(seq 1 120); do
    state="$(job_state)"
    [ "$state" = completed ] && break
    sleep 1
  done
fi
if [ "$state" = completed ]; then
  # `updated_at` is when `maintenance off` cleared the flag, by the
  # database's clock, inside that command's own transaction.
  worked="$(echo "SELECT (j.completed_at > d.updated_at AND NOT d.maintenance)::text || ' ' || j.completed_at || ' / ' || d.updated_at FROM studio_jobs.jobs j, deployment_state d WHERE j.id = '$(cat "$PROBE_JOB_FILE")' AND d.id = 1;" | psql_)"
  case "$worked" in
    'true '*) say "probe job $(cat "$PROBE_JOB_FILE") completed after maintenance off cleared the flag (completed / cleared: ${worked#true })" ;;
    *) fail "the probe job completed before maintenance off cleared the flag (completed / cleared: ${worked#* })" ;;
  esac
elif [ -z "$ready" ]; then
  fail 'the probe job was not checked: the instance never reopened'
elif [ ! -f "$PROBE_JOB_FILE" ]; then
  fail 'the probe job was never enqueued'
else
  fail "the probe job queued during the window is '${state:-gone}' after the instance reopened"
fi

# ── The window ────────────────────────────────────────────────────────────
node "$RELEASE_TEST_DIR/window.mjs" "$OBSERVED" "$EVENTS" "$RUN_DIR/window.json" \
  || fail 'the maintenance window did not hold (window.json says how)'

[ "${#FAILURES[@]}" -eq 0 ] || die "the upgrade failed: ${#FAILURES[@]} problem(s) above"
say 'upgrade complete'
