#!/usr/bin/env bash
# Resolves the pinned Playwright version and the key of the shared browser
# cache, and writes both to $GITHUB_OUTPUT as `version` and `cache-key`.
#
# The one job that writes the cache (`warm-playwright-cache`) and every job
# that reads it run this script, so the two cannot disagree about the key.
#
# The key names the platform the browsers were downloaded for: the OS release
# and the CPU architecture. Playwright downloads a different WebKit for each
# Ubuntu release, linked against that release's system libraries, into a
# directory named only by the build number. It treats a directory that exists
# as installed, so a cache entry restored on another release is used as it
# is. On 2026-11-18 `ubuntu-latest` moved from 24.04 to 26.04 while the key
# held only the runner's OS family and the Playwright version: every WebKit
# launch failed on `libicudata.so.74`, which 26.04 does not ship, until the
# key changed.
#
# A platform with no entry yet is a cache miss, and the install step then
# downloads the browsers. Main writes an entry for the platform its own
# `warm-playwright-cache` job runs on.
#
# Run from the repository root. OS_RELEASE_FILE names another os-release file,
# for the tests.

set -euo pipefail

version="$(grep -oE '@playwright/test@[0-9]+\.[0-9]+\.[0-9]+' pnpm-lock.yaml |
  grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | sort -uV | tail -1 || true)"
if [ -z "$version" ]; then
  echo "::error::could not resolve @playwright/test from pnpm-lock.yaml"
  exit 1
fi

os_release_file="${OS_RELEASE_FILE:-/etc/os-release}"
os_release=''
if [ -r "$os_release_file" ]; then
  # A subshell, so the file's other variables stay out of this script.
  os_release="$(
    set +u
    # shellcheck disable=SC1090
    . "$os_release_file"
    if [ -n "$ID" ] && [ -n "$VERSION_ID" ]; then
      printf '%s%s' "$ID" "$VERSION_ID"
    fi
  )"
fi
# No guess when the release is unknown: a key shared between two releases is
# the failure this script exists to prevent.
if ! [[ "$os_release" =~ ^[a-z0-9._-]+$ ]]; then
  echo "::error::could not read the OS release from $os_release_file, so the Playwright browser cache has no safe key"
  exit 1
fi

{
  echo "version=$version"
  echo "cache-key=playwright-$os_release-$(uname -m)-$version"
} >>"$GITHUB_OUTPUT"
