#!/usr/bin/env bash
# Decides whether a push-triggered job may still act for the commit it was
# started for. Writes `current` to $GITHUB_OUTPUT: `true` when EXPECTED_SHA is
# still the tip of REF on REMOTE, `false` once the branch has moved past it.
#
# Why this exists: push-to-main runs deliberately never cancel each other (see
# the concurrency block at the top of ci-and-release.yml), so the runs for two
# consecutive main commits execute in parallel and finish in either order. A
# job that spends minutes building before it acts can therefore reach its
# release step after a newer main commit has already released. On 2026-09-02
# the run for cd9040bcf did exactly that: eight minutes after the merge of the
# Version Packages PR (751296a13) had published to npm and released, its stale
# tree still held the eleven consumed changesets, so changesets/action
# regenerated changeset-release/main and opened #1597 — a byte-identical
# duplicate of the release that had just merged.
#
# Skipping is safe because every decision downstream is state-driven, not
# event-driven: the run for the newer commit reads a tree that contains
# everything this one does, publishes whatever is still unpublished, and
# regenerates or closes the release PR from current state. Nothing this run
# would have done is lost by leaving it to that run.
#
# Failing is not: an unresolvable REF means a broken remote or checkout, and a
# release lane that silently never acts is worse than a red job. The script
# therefore exits non-zero rather than guessing when it cannot see the branch.
#
# The check is deliberately a runtime query of the remote rather than a
# concurrency setting. Cancelling superseded runs would kill an npm publish
# mid-flight, and serialising the jobs in one group would only order the stale
# run before the current one — it would still act. A remote query leaves a
# window of a few seconds between the answer and the action's own push; a run
# superseded inside that window regenerates the PR the newer run then updates,
# which is the same benign outcome the tip run produces anyway.
#
# Inputs (env): EXPECTED_SHA (full sha), REF (a full ref, e.g. refs/heads/main),
# REMOTE (remote name or URL; default origin), GITHUB_OUTPUT.
set -euo pipefail

remote="${REMOTE:-origin}"

if [[ "${REF:-}" != refs/* ]]; then
  echo "::error::REF must be a full ref such as refs/heads/main, got '${REF:-}'" >&2
  exit 1
fi
if [[ ! "${EXPECTED_SHA:-}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "::error::EXPECTED_SHA must be a full commit sha, got '${EXPECTED_SHA:-}'" >&2
  exit 1
fi

# ls-remote matches patterns against the tail of ref names, so pick the exact
# ref out of the listing rather than trusting its first line.
if ! listing=$(git ls-remote "$remote" "$REF"); then
  echo "::error::Could not list $REF on $remote — refusing to guess whether $EXPECTED_SHA is still its tip" >&2
  exit 1
fi
tip=$(printf '%s\n' "$listing" | awk -v ref="$REF" '$2 == ref { print $1; exit }')
if [[ -z "$tip" ]]; then
  echo "::error::$REF does not exist on $remote — refusing to guess whether $EXPECTED_SHA is still its tip" >&2
  exit 1
fi

if [[ "$tip" == "$EXPECTED_SHA" ]]; then
  echo "current=true" >> "$GITHUB_OUTPUT"
  echo "$EXPECTED_SHA is still the tip of $REF"
else
  echo "current=false" >> "$GITHUB_OUTPUT"
  echo "::warning::Skipping: this run was started for $EXPECTED_SHA, but $REF has moved on to $tip. The run for that commit covers everything this one would have done."
fi
