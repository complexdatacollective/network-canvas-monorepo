#!/usr/bin/env bash
# Resolves and validates the Architect release tag an archive run was handed,
# emitting version/major/sha for the workflow.
#
# Run TWICE by .github/workflows/architect-archive-release.yml: once up front so
# a bad tag fails before a build is spent, and again inside the deploy job while
# it holds the concurrency lock. The second run is not redundant — every archived
# major line shares one host, so a newer release on the same line tagged between
# the first check and the lock would otherwise let the older run publish last and
# roll the host backwards. The repository makes the same argument for
# app-release-guard.sh: only mutual exclusion across the whole check-then-deploy
# sequence closes that window.
#
# Reads TAG and (optionally) FORCE from the environment. Runs against whatever
# git repository is the working directory, which must have the release tags
# fetched.
set -euo pipefail

: "${TAG:?TAG is required}"
FORCE="${FORCE:-false}"
PKG='@codaco/architect'

# The tag must be this app's release tag. Comparing only the text after the last
# `@` would accept another independently versioned product's tag whose suffix
# happens to equal Architect's version at that commit, and archive an unrelated
# tree — one that can carry unreleased Architect changes.
case "$TAG" in
  "$PKG"@*) ;;
  *)
    echo "::error::$TAG is not a $PKG release tag"
    exit 1
    ;;
esac

sha="$(git rev-parse --verify "${TAG}^{commit}")"

# Read the manifest out of the tag rather than checking the tag out: the caller
# may be running from a different revision, and this needs no working tree.
version="$(git show "${TAG}:apps/architect/package.json" \
  | node -p "JSON.parse(require('fs').readFileSync(0, 'utf8')).version")"

# The tag names a version; the tree is the authority on what it actually is.
if [ "$TAG" != "${PKG}@${version}" ]; then
  echo "::error::$TAG disagrees with the version in its own tree (${PKG}@${version})"
  exit 1
fi

major="${version%%.*}"
case "$major" in
  '' | *[!0-9]*)
    echo "::error::cannot read a major version from $version"
    exit 1
    ;;
esac

# One host per major line means a later archive run overwrites an earlier one.
#
# Only plain x.y.z releases are candidates for "newest on the line". `sort -V`
# orders a prerelease AFTER its stable release — verified on both GNU and BSD
# sort, `8.3.0-beta.1` sorts after `8.3.0` — which is the opposite of semver.
# Left unfiltered, dispatching a beta would sail past this check as the newest
# tag while the stable release it precedes was refused, quietly replacing a
# line's stable archive with a prerelease.
# `|| true` because a line with no stable release yet — a brand-new major whose
# only tags are prereleases — makes grep exit 1, and under `pipefail` that would
# kill the script with no message rather than leaving `newest` empty for the
# check below to handle.
newest="$(
  git tag --list "${PKG}@${major}.*" \
    | sed "s|^${PKG}@||" \
    | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' \
    | sort -V \
    | tail -1 \
    || true
)"

case "$version" in
  *-*)
    # A prerelease is never the newest release on a line, so putting one on the
    # shared host is always a deliberate act rather than a routine archive.
    if [ "$FORCE" != 'true' ]; then
      echo "::error::$version is a prerelease; archiving one onto the ${major}.x host needs force."
      exit 1
    fi
    echo "::warning::forcing prerelease $version onto the ${major}.x host"
    ;;
  *)
    if [ -n "$newest" ] && [ "$newest" != "$version" ]; then
      if [ "$FORCE" != 'true' ]; then
        echo "::error::$version is not the newest release on the ${major}.x line ($newest). Archive that instead, or re-run with force."
        exit 1
      fi
      echo "::warning::forcing $version over newer ${major}.x release $newest"
    fi
    ;;
esac

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "version=$version"
    echo "major=$major"
    echo "sha=$sha"
  } >>"$GITHUB_OUTPUT"
fi

echo "resolved $TAG -> $version (v${major}) at $sha"
