#!/usr/bin/env bash
# Decides whether a gated release product should be released.
# Writes `version` and `released` to $GITHUB_OUTPUT.
#
# A beta release fires when the app's package.json is at a beta version
# (X.Y.Z-beta.N, N > 0) whose git tag <PKG_NAME>@<version> does not exist yet.
# A stable release fires when its package version changed in the current main
# push. The release job creates the matching tag after a successful deploy.
#
# Beta releases are tag-driven so they self-heal when a prior release run was
# dropped: an untagged beta is picked up on the next push. Stable documentation
# releases are intentionally diff-driven so only the generated release PR's
# version bump can trigger production deployment.
#
# Beta detection deliberately does NOT fire on the initial X.Y.Z-beta.0 seed
# (N == 0) or a non-beta version — those are setup states, not releases.
#
# This tag check is only a preflight — parallel main-push runs could each see the
# same untagged version. The authoritative guard against a duplicate release is
# on the apps-release-<app> jobs (per-<PKG_NAME>@<version> concurrency group +
# a re-check of the tag before deploy) in .github/workflows/ci-and-release.yml.
#
# Inputs (env):
#   PKG_JSON   path to the app's package.json
#   PKG_NAME   the app's package name (used for the git tag <PKG_NAME>@<version>)
#   RELEASE_CHANNEL beta (default) or stable
#
# Requires tags to be present in the checkout (actions/checkout fetch-tags: true).
set -euo pipefail

beta_re='^([0-9]+\.[0-9]+\.[0-9]+)-beta\.([0-9]+)$'
release_channel="${RELEASE_CHANNEL:-beta}"

current=$(node -p "require('./$PKG_JSON').version")
echo "version=$current" >> "$GITHUB_OUTPUT"

released=false
reason="not a releasable $release_channel version (version=$current)"
if [[ "$release_channel" == 'beta' ]] && [[ "$current" =~ $beta_re ]] && [[ "${BASH_REMATCH[2]}" -gt 0 ]]; then
  if git rev-parse -q --verify "refs/tags/$PKG_NAME@$current" >/dev/null; then
    reason="tag $PKG_NAME@$current already exists"
  else
    released=true
    reason="beta $current has no release tag yet"
  fi
elif [[ "$release_channel" == 'stable' ]]; then
  previous=$(git show "HEAD^:$PKG_JSON" 2>/dev/null | node -p "JSON.parse(require('fs').readFileSync(0, 'utf8')).version" || true)
  if git rev-parse -q --verify "refs/tags/$PKG_NAME@$current" >/dev/null; then
    reason="tag $PKG_NAME@$current already exists"
  elif [[ "$current" != "$previous" ]]; then
    released=true
    reason="stable version changed from ${previous:-missing} to $current"
  else
    reason="stable version unchanged from previous main commit"
  fi
elif [[ "$release_channel" != 'beta' ]]; then
  echo "Unsupported RELEASE_CHANNEL: $release_channel" >&2
  exit 1
fi

echo "released=$released" >> "$GITHUB_OUTPUT"
echo "[$PKG_NAME] version=$current released=$released ($reason)"
