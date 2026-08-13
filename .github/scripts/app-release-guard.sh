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
#      claim the newer "latest" release for it.
#   3. This tree does not contain the newest released commit. A higher version
#      number is not the same as a superset of what is live: main can be
#      numerically ahead of a hotfix while missing the fix itself, and
#      deploying it would quietly take that fix off production. The hotfix lane
#      applies the same rule in the opposite direction.
#
# Both skips mean the same thing — main has not caught up with a hotfix — and
# have the same remedy: merge the hotfix branch into main (see the app's
# RELEASING.md). Skipping rather than failing keeps the lane self-healing: the
# push that lands the merge releases normally.
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
    echo "::warning::$VERSION is older than the released $newest — refusing to deploy it over production. Merge the hotfix branch into main (see the app's RELEASING.md)."
    exit 0
  fi

  # Numerically ahead is not the same as containing what is live: main can be
  # on 8.2.0 while a hotfixed 8.1.3 is missing from its history, and deploying
  # it would take that fix off production behind a higher version number.
  if ! git merge-base --is-ancestor "$PKG_NAME@$newest" HEAD 2>/dev/null; then
    echo "skip=true" >> "$GITHUB_OUTPUT"
    echo "::warning::This tree does not contain $PKG_NAME@$newest — refusing to deploy $VERSION over it. Merge the hotfix branch into main (see the app's RELEASING.md)."
    exit 0
  fi
fi

# `newest` feeds release-notes.mjs --since: a release queued behind others on
# this app's concurrency group can be dropped while pending, so the body must
# carry every CHANGELOG section released since the last tag, not just its own.
{
  echo "skip=false"
  echo "newest=$newest"
} >> "$GITHUB_OUTPUT"
echo "$tag is clear to release (newest released: ${newest:-none})"
