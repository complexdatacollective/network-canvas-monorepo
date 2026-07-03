#!/usr/bin/env bash
# Decides whether a PWA app (architect-web / interviewer-v8) should be released.
# Writes `version` and `released` to $GITHUB_OUTPUT.
#
# A release fires ONLY on a Release-apps-PR bot increment: the same X.Y.Z base
# with the -beta.N counter advanced (beta.M -> beta.N, N > M). It deliberately
# does NOT fire on the initial 8.0.0-beta.0 seed or a manual base change (e.g.
# 8.x -> 9.0.0-beta.0) — those are setup edits, not releases. Comparing the
# package.json versions (rather than a commit-message marker) makes this robust
# to the PR merge strategy (merge / squash / rebase).
#
# Inputs (env):
#   PKG_JSON   path to the app's package.json
#   PKG_NAME   the app's package name (used for the git tag <PKG_NAME>@<version>)
set -euo pipefail

beta_re='^([0-9]+\.[0-9]+\.[0-9]+)-beta\.([0-9]+)$'

current=$(node -p "require('./$PKG_JSON').version")
echo "version=$current" >> "$GITHUB_OUTPUT"

if git cat-file -e "HEAD^:$PKG_JSON" 2>/dev/null; then
  previous=$(git show "HEAD^:$PKG_JSON" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).version")
else
  previous=""
fi

released=false
reason="not a beta increment (prev=${previous:-<none>} curr=$current)"
if [[ "$previous" =~ $beta_re ]]; then
  prev_base="${BASH_REMATCH[1]}"
  prev_n="${BASH_REMATCH[2]}"
  if [[ "$current" =~ $beta_re ]] &&
    [[ "${BASH_REMATCH[1]}" == "$prev_base" && "${BASH_REMATCH[2]}" -gt "$prev_n" ]]; then
    released=true
    reason="beta increment $previous -> $current"
  fi
fi

# Idempotency: never re-release an existing tag (workflow re-runs).
if [[ "$released" == "true" ]] && git rev-parse -q --verify "refs/tags/$PKG_NAME@$current" >/dev/null; then
  released=false
  reason="tag $PKG_NAME@$current already exists"
fi

echo "released=$released" >> "$GITHUB_OUTPUT"
echo "[$PKG_NAME] version=$current released=$released ($reason)"
