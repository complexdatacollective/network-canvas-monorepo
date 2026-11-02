#!/usr/bin/env bash
# Installs the pinned Playwright browsers and their system packages, with a
# time limit on each attempt.
#
# `playwright install --with-deps` runs `apt-get update` and `apt-get install`,
# and apt against the runner's Ubuntu mirror sometimes crawls rather than
# fails. Of 652 browser installs in the CI runs of 12 October to 2 November
# 2026, 45 took over five minutes and 30 over ten; in eight merged pull
# requests the first attempt sat in this step for 22 to 45 minutes until it
# was cancelled or hit the job's limit, and had to be re-run by hand. An
# install from a warm cache takes about 25 seconds, and 607 of the 652 finished
# within five minutes, so an attempt still running then is stuck.
#
# Each later attempt first clears what a killed attempt leaves behind (apt and
# dpkg processes holding the locks, a half-configured dpkg) and moves apt from
# the runner's Azure mirror to Ubuntu's own archive, in case the mirror is the
# slow part.
#
# Inputs (environment): BROWSERS, space-separated; PACKAGE, the workspace
# package whose Playwright CLI runs the install.

set -uo pipefail

: "${BROWSERS:?BROWSERS is required}"
: "${PACKAGE:?PACKAGE is required}"

readonly ATTEMPTS=3
readonly ATTEMPT_SECONDS=300

read -r -a browsers <<<"$BROWSERS"

# apt's own retry and stall limits: a connection that delivers nothing for 30
# seconds fails and is retried by apt, instead of holding the attempt open
# until the time limit below.
sudo tee /etc/apt/apt.conf.d/80-ci-network >/dev/null <<'EOF'
Acquire::Retries "3";
Acquire::http::Timeout "30";
Acquire::https::Timeout "30";
EOF

for attempt in $(seq 1 "$ATTEMPTS"); do
  echo "::group::playwright install ${browsers[*]} (attempt $attempt of $ATTEMPTS)"
  # `timeout` signals its whole process group, and sudo relays the TERM to the
  # apt-get it runs; `--kill-after` follows up with SIGKILL, and the cleanup
  # below catches anything that outlives both.
  timeout --kill-after=20 "$ATTEMPT_SECONDS" \
    pnpm --filter "$PACKAGE" exec playwright install --with-deps "${browsers[@]}"
  status=$?
  echo "::endgroup::"

  if [[ $status -eq 0 ]]; then
    exit 0
  fi
  if [[ $status -eq 124 || $status -eq 137 ]]; then
    echo "::warning::Playwright browser install attempt $attempt of $ATTEMPTS ran past ${ATTEMPT_SECONDS}s and was stopped"
  else
    echo "::warning::Playwright browser install attempt $attempt of $ATTEMPTS exited $status"
  fi
  if [[ $attempt -eq $ATTEMPTS ]]; then
    break
  fi

  sudo pkill -9 -x apt-get || true
  sudo pkill -9 -f '^/usr/lib/apt/methods/' || true
  sudo pkill -9 -x dpkg || true
  sudo dpkg --configure -a || true
  sudo sed -i 's|http://azure\.archive\.ubuntu\.com/|http://archive.ubuntu.com/|g' \
    /etc/apt/sources.list /etc/apt/sources.list.d/*.sources 2>/dev/null || true
done

echo "::error::Playwright could not install ${browsers[*]} in $ATTEMPTS attempts of up to ${ATTEMPT_SECONDS}s each"
exit 1
