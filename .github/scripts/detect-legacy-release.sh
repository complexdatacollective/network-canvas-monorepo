#!/usr/bin/env bash
# Decides whether a legacy desktop app (Architect/Interviewer) should be released.
# Writes `version` and `released` to $GITHUB_OUTPUT.
#
# Inputs (env):
#   PKG_JSON       path to the app's package.json
#   EXTERNAL_REPO  owner/name of the app's standalone repo
#   FORCED         "true" when a workflow_dispatch explicitly selected this app
#   GH_TOKEN       token with read access to EXTERNAL_REPO (for the release check)
set -euo pipefail

current=$(node -p "require('./$PKG_JSON').version")
echo "version=$current" >> "$GITHUB_OUTPUT"

released=false
reason=""

# 1. Explicit manual trigger.
if [[ "${FORCED:-false}" == "true" ]]; then
  released=true
  reason="forced via workflow_dispatch"
fi

# 2. Version changed since the previous commit.
if [[ "$released" != "true" ]]; then
  if git cat-file -e "HEAD^:$PKG_JSON" 2>/dev/null; then
    previous=$(git show "HEAD^:$PKG_JSON" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).version")
  else
    previous=""
  fi
  if [[ -n "$current" && "$current" != "$previous" ]]; then
    released=true
    reason="version changed ${previous:-<none>} -> $current"
  fi
fi

# 3. Idempotent first-time check: release if the external repo has no published
#    release for this version yet. (A 404 also covers a pending draft, so a failed
#    run is retried until a published release exists.)
if [[ "$released" != "true" && -n "${GH_TOKEN:-}" ]]; then
  status=$(curl -sS -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer $GH_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$EXTERNAL_REPO/releases/tags/v$current" || echo "000")
  if [[ "$status" == "404" ]]; then
    released=true
    reason="no v$current release on $EXTERNAL_REPO yet"
  fi
fi

echo "released=$released" >> "$GITHUB_OUTPUT"
echo "[$EXTERNAL_REPO] version=$current released=$released ${reason:+($reason)}"
