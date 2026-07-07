#!/usr/bin/env bash
# Decides whether a PWA app (architect / interviewer) should be released.
# Writes `version` and `released` to $GITHUB_OUTPUT.
#
# A release fires when the app's package.json is at a beta version
# (X.Y.Z-beta.N, N > 0) whose git tag <PKG_NAME>@<version> does not exist yet.
#
# This is deliberately tag-driven rather than diff-driven (prev HEAD^ vs HEAD):
#   * idempotent  — an already-tagged version is never re-released, so workflow
#                   re-runs and every subsequent push to main are no-ops.
#   * self-healing — a release whose CI run was dropped before the release job
#                   ran (e.g. the push run was cancelled by concurrency during a
#                   burst of merges) is picked up on the NEXT push to main. A
#                   diff-only check lost the release forever once the bump commit
#                   scrolled into history (prev == curr => released=false).
#
# It deliberately does NOT fire on the initial X.Y.Z-beta.0 seed (N == 0) or a
# non-beta version — those are setup states, not releases.
#
# This tag check is only a preflight — parallel main-push runs could each see the
# same untagged version. The authoritative guard against a duplicate release is
# on the apps-release-<app> jobs (per-<PKG_NAME>@<version> concurrency group +
# a re-check of the tag before deploy) in .github/workflows/ci-and-release.yml.
#
# Inputs (env):
#   PKG_JSON   path to the app's package.json
#   PKG_NAME   the app's package name (used for the git tag <PKG_NAME>@<version>)
#
# Requires tags to be present in the checkout (actions/checkout fetch-tags: true).
set -euo pipefail

beta_re='^([0-9]+\.[0-9]+\.[0-9]+)-beta\.([0-9]+)$'

current=$(node -p "require('./$PKG_JSON').version")
echo "version=$current" >> "$GITHUB_OUTPUT"

released=false
reason="not a releasable beta (version=$current)"
if [[ "$current" =~ $beta_re ]] && [[ "${BASH_REMATCH[2]}" -gt 0 ]]; then
  if git rev-parse -q --verify "refs/tags/$PKG_NAME@$current" >/dev/null; then
    reason="tag $PKG_NAME@$current already exists"
  else
    released=true
    reason="beta $current has no release tag yet"
  fi
fi

echo "released=$released" >> "$GITHUB_OUTPUT"
echo "[$PKG_NAME] version=$current released=$released ($reason)"
