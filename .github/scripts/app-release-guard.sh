#!/usr/bin/env bash
# Decides whether an app release job should still deploy, checked once the job
# is actually running (its concurrency lock held) rather than at detection time.
# Writes `skip` to $GITHUB_OUTPUT.
#
# Skips when:
#   1. The tag already exists — a parallel run released this version.
#   2. The version is older than the newest released tag for the app. Releases
#      no longer arrive from main alone: hotfix-release.yml can move an app's
#      released version out of band, and each app has a single production site,
#      so `netlify deploy --prod` would roll production back to older code and
#      claim the newer "latest" release for it. When this fires, main is behind
#      its own released version — record the hotfix on main (see the app's
#      RELEASING.md) and the next push releases normally.
#
# Inputs (env): PKG_NAME, VERSION, GITHUB_OUTPUT.
# Requires tags in the checkout (actions/checkout fetch-tags: true).
set -euo pipefail

tag="$PKG_NAME@$VERSION"

if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
  echo "skip=true" >> "$GITHUB_OUTPUT"
  echo "$tag already released — nothing to do"
  exit 0
fi

newest=$(
  git tag --list "$PKG_NAME@*" |
    sed "s|^$PKG_NAME@||" |
    grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' |
    sort -V |
    tail -1
) || true

if [[ -n "$newest" ]]; then
  highest=$(printf '%s\n%s\n' "$VERSION" "$newest" | sort -V | tail -1)
  if [[ "$highest" == "$newest" ]]; then
    echo "skip=true" >> "$GITHUB_OUTPUT"
    echo "::warning::$VERSION is older than the released $newest — refusing to deploy it over production. Record the newer release on main (see the app's RELEASING.md)."
    exit 0
  fi
fi

echo "skip=false" >> "$GITHUB_OUTPUT"
echo "$tag is clear to release (newest released: ${newest:-none})"
