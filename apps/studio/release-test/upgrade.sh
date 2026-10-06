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
# its commands is run as written; its backup comment is replaced by the
# `<!-- backup-take -->` block of docs/self-host/backup.md, also as written.
# Nothing in either block is edited, so a change to the guide changes what
# this runs, and a guide that stops parsing fails here.
#
# What the guide asks for before the sequence — the new digests in `.env` —
# is done first, as an operator does it. What it asks for after — `/readyz`
# answering 200 — is waited for, bounded.
#
# Around the sequence:
#   - observe.sh records /readyz and a probe four times a second, and
#     window.mjs then decides whether the instance was closed throughout;
#   - right after `maintenance on`, one `protocol-store-gc` job is enqueued as
#     the application role; it must still be `created` after `migrate` and
#     must be worked once the instance reopens.
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
PROBE_JOB_FILE="$RUN_DIR/probe-job"
READY_BOUND=180
rm -f "$EVENTS" "$OBSERVED" "$PROBE_JOB_FILE"

now_ms() { perl -MTime::HiRes=time -e 'printf "%d\n", time * 1000'; }

# The fenced bash block between `<!-- <name> start -->` and
# `<!-- <name> end -->` in a guide page.
guide_block() { # file name
  awk -v start="<!-- $2 start -->" -v end="<!-- $2 end -->" '
    $0 == start { marked = 1; next }
    $0 == end { marked = 0 }
    marked && /^```bash$/ { fenced = 1; next }
    marked && /^```$/ { fenced = 0; next }
    marked && fenced { print }
  ' "$1"
}

SEQUENCE="$(guide_block "$STUDIO_DIR/docs/self-host/upgrade.md" upgrade-sequence)"
BACKUP="$(guide_block "$STUDIO_DIR/docs/self-host/backup.md" backup-take)"
[ -n "$SEQUENCE" ] || die 'docs/self-host/upgrade.md has no <!-- upgrade-sequence --> bash block'
[ -n "$BACKUP" ] || die 'docs/self-host/backup.md has no <!-- backup-take --> bash block'
grep -q '^# take your backup' <<< "$SEQUENCE" \
  || die "the upgrade sequence no longer has its '# take your backup' line, which is where backup.md's block runs"

psql_() { # sql on stdin; prints rows
  docker compose exec -T postgres \
    sh -c 'psql -X -q -v ON_ERROR_STOP=1 -At -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
}

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

# The worker reads the flag through a one-second cache on a one-second poll,
# so it stops claiming up to about two seconds after `maintenance on` returns,
# and says so in its log. The probe job is enqueued after that line: a job
# enqueued before it may be claimed, which is the documented lag and not what
# this proof is about. The lag is recorded in pause-lag-ms.
wait_for_worker_pause() { # since-epoch-seconds
  local started
  started="$(now_ms)"
  for _ in $(seq 1 40); do
    if docker compose logs --no-color --since "$1" worker 2> /dev/null \
      | grep -q 'the job worker has stopped claiming jobs'; then
      echo $(($(now_ms) - started)) > "$RUN_DIR/pause-lag-ms"
      say "  the worker reported its pause $(cat "$RUN_DIR/pause-lag-ms") ms after maintenance on returned"
      return 0
    fi
    sleep 0.25
  done
  fail 'the worker never reported that it stopped claiming jobs, 10 s after maintenance on'
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

# ── The new digests, as the guide's step 3 asks ───────────────────────────
sed -i.bak \
  -e "s|^STUDIO_API_IMAGE=.*|STUDIO_API_IMAGE=$TO_API|" \
  -e "s|^STUDIO_WEB_IMAGE=.*|STUDIO_WEB_IMAGE=$TO_WEB|" \
  "$DEPLOY_DIR/.env"
rm -f "$DEPLOY_DIR/.env.bak"

# ── The observer ──────────────────────────────────────────────────────────
"$RELEASE_TEST_DIR/observe.sh" "$URL" "$OBSERVED" &
OBSERVER=$!
trap 'kill "$OBSERVER" 2> /dev/null || true' EXIT
for _ in $(seq 1 40); do
  [ -s "$OBSERVED" ] && break
  sleep 0.25
done
[ -s "$OBSERVED" ] || die 'the observer recorded nothing'

# ── The sequence ──────────────────────────────────────────────────────────
index=0
run_step() { # label command…
  local label="$1" code=0
  shift
  index=$((index + 1))
  printf '%s\tstart\t%s\t%s\n' "$(now_ms)" "$index" "$label" >> "$EVENTS"
  say "step $index: $label"
  # stdin from /dev/null: `docker compose run` reads it, and would otherwise
  # swallow the rest of the sequence this loop is reading.
  (cd "$DEPLOY_DIR" && "$@") < /dev/null || code=$?
  printf '%s\tend\t%s\t%s\n' "$(now_ms)" "$index" "$code" >> "$EVENTS"
  [ "$code" -eq 0 ] || {
    fail "step $index ($label) exited $code"
    return 1
  }
}

while IFS= read -r line; do
  case "$line" in
    '' | ' '*) continue ;;
    '# take your backup'*)
      run_step 'backup (docs/self-host/backup.md)' bash -eo pipefail -c "$BACKUP" || break
      ;;
    '#'*) continue ;;
    *)
      step_since="$(date +%s)"
      run_step "$line" bash -eo pipefail -c "$line" || break
      case "$line" in
        *'maintenance on'*) wait_for_worker_pause "$((step_since - 1))" && enqueue_probe ;;
        *'run --rm migrate'*)
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

# ── The probe job is worked ───────────────────────────────────────────────
state=''
if [ -n "$ready" ] && [ -f "$PROBE_JOB_FILE" ]; then
  for _ in $(seq 1 120); do
    state="$(job_state)"
    [ "$state" = completed ] && break
    sleep 1
  done
fi
if [ "$state" = completed ]; then
  say "probe job $(cat "$PROBE_JOB_FILE") completed after the upgrade"
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
