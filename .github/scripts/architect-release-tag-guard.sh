#!/usr/bin/env bash
# Resolves and validates an Architect release tag, emitting version/major/sha
# for the workflow.
#
# Run by .github/workflows/architect-subpath-dist.yml before it builds the
# tag's tree under its major's sub-path. The sub-path dist for a major line is
# the one tarball the next major pins, so the guard refuses anything but the
# newest stable release on that line: the pin is only ever moved forward.
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
# happens to equal Architect's version at that commit, and build an unrelated
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

# One sub-path dist per major line means only its newest release qualifies.
#
# Only plain x.y.z releases are candidates for "newest on the line". `sort -V`
# orders a prerelease AFTER its stable release — verified on both GNU and BSD
# sort, `8.3.0-beta.1` sorts after `8.3.0` — which is the opposite of semver.
# Left unfiltered, dispatching a beta would sail past this check as the newest
# tag while the stable release it precedes was refused, quietly replacing a
# line's stable release with a prerelease.
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
    # A prerelease is never the newest release on a line, so using one for the
    # line is always a deliberate act rather than a routine run.
    if [ "$FORCE" != 'true' ]; then
      echo "::error::$version is a prerelease; using one for the ${major}.x line needs FORCE=true."
      exit 1
    fi
    echo "::warning::forcing prerelease $version for the ${major}.x line"
    ;;
  *)
    if [ -n "$newest" ] && [ "$newest" != "$version" ]; then
      if [ "$FORCE" != 'true' ]; then
        echo "::error::$version is not the newest release on the ${major}.x line ($newest). Use that instead, or set FORCE=true."
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
