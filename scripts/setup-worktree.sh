#!/usr/bin/env bash

set -euo pipefail

workspace_path="${1:-$(git rev-parse --show-toplevel)}"

cd "$workspace_path"

git fetch origin main >&2

if git merge-base --is-ancestor HEAD FETCH_HEAD; then
  git merge --ff-only FETCH_HEAD >&2
elif ! git merge-base --is-ancestor FETCH_HEAD HEAD; then
  printf 'Skipping main fast-forward because the workspace branch has diverged.\n' >&2
fi

pnpm install >&2
