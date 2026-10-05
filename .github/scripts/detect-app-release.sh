#!/usr/bin/env bash
# Decides whether a gated release product should be released.
# Writes `version` and `released` to $GITHUB_OUTPUT.
#
# A self-healing stable release fires when package.json contains a stable semver
# whose git tag <PKG_NAME>@<version> does not exist yet. The Architect and
# Interviewer production jobs use this mode so a failed or dropped deploy is
# retried on the next main push. A diff-driven stable release fires only when
# its package version changed in the current main push; Documentation and
# Website use that narrower mode.
#
# Stable-tagged releases are tag-driven so they self-heal when a prior release
# run was dropped. Stable website releases are intentionally diff-driven so
# only a generated release PR's version bump can trigger production deployment.
#
# This tag check is only a preflight — parallel main-push runs could each see the
# same untagged version, or different untagged versions of the same app. The
# authoritative guard is on the apps-release-<app> jobs in
# .github/workflows/ci-and-release.yml: one concurrency group per app plus
# .github/scripts/app-release-guard.sh, which re-checks the tag under that lock
# and refuses an older version or a tree missing the newest released commit.
#
# Inputs (env):
#   PKG_JSON   path to the app's package.json
#   PKG_NAME   the app's package name (used for the git tag <PKG_NAME>@<version>)
#   RELEASE_CHANNEL stable-tagged (default) or stable
#
# Requires tags to be present in the checkout (actions/checkout fetch-tags: true).
set -euo pipefail

stable_re='^[0-9]+\.[0-9]+\.[0-9]+$'
release_channel="${RELEASE_CHANNEL:-stable-tagged}"

current=$(node -p "require('./$PKG_JSON').version")
echo "version=$current" >> "$GITHUB_OUTPUT"

released=false
reason="not a releasable $release_channel version (version=$current)"
if [[ "$release_channel" == 'stable-tagged' ]] && [[ "$current" =~ $stable_re ]]; then
  if git rev-parse -q --verify "refs/tags/$PKG_NAME@$current" >/dev/null; then
    reason="tag $PKG_NAME@$current already exists"
  else
    released=true
    reason="stable version $current has no release tag yet"
  fi
elif [[ "$release_channel" == 'stable' ]] && [[ "$current" =~ $stable_re ]]; then
  previous=$(git show "HEAD^:$PKG_JSON" 2>/dev/null | node -p "JSON.parse(require('fs').readFileSync(0, 'utf8')).version" || true)
  if git rev-parse -q --verify "refs/tags/$PKG_NAME@$current" >/dev/null; then
    reason="tag $PKG_NAME@$current already exists"
  elif [[ "$current" != "$previous" ]]; then
    released=true
    reason="stable version changed from ${previous:-missing} to $current"
  else
    reason="stable version unchanged from previous main commit"
  fi
elif [[ "$release_channel" != 'stable-tagged' ]] && [[ "$release_channel" != 'stable' ]]; then
  echo "Unsupported RELEASE_CHANNEL: $release_channel" >&2
  exit 1
fi

echo "released=$released" >> "$GITHUB_OUTPUT"
echo "[$PKG_NAME] version=$current released=$released ($reason)"
