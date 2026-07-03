#!/usr/bin/env bash
# Decides whether a PWA app (architect-web / interviewer-v8) should be released.
# Writes `version` and `released` to $GITHUB_OUTPUT.
#
# Inputs (env):
#   PKG_JSON   path to the app's package.json
#   PKG_NAME   the app's package name (used for the git tag <PKG_NAME>@<version>)
set -euo pipefail

current=$(node -p "require('./$PKG_JSON').version")
echo "version=$current" >> "$GITHUB_OUTPUT"

released=false
reason=""

# Version changed since the previous commit (i.e. the Release apps PR just merged).
if git cat-file -e "HEAD^:$PKG_JSON" 2>/dev/null; then
  previous=$(git show "HEAD^:$PKG_JSON" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).version")
else
  previous=""
fi
if [[ -n "$current" && "$current" != "$previous" ]]; then
  released=true
  reason="version changed ${previous:-<none>} -> $current"
fi

# Idempotency: if the tag already exists (a rerun), do not re-release.
if [[ "$released" == "true" ]] && git rev-parse -q --verify "refs/tags/$PKG_NAME@$current" >/dev/null; then
  released=false
  reason="tag $PKG_NAME@$current already exists"
fi

echo "released=$released" >> "$GITHUB_OUTPUT"
echo "[$PKG_NAME] version=$current released=$released ${reason:+($reason)}"
