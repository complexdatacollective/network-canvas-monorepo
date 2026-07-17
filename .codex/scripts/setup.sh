#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="${CODEX_WORKTREE_PATH:-$(git -C "$script_dir" rev-parse --show-toplevel)}"

cd "$repo_root"

required_node="$(sed -e 's/^v//' -e 's/[[:space:]]//g' .node-version)"
current_node="$(node --version 2>/dev/null | sed 's/^v//' || true)"

if [[ "$current_node" != "$required_node" ]]; then
  if command -v fnm >/dev/null 2>&1; then
    eval "$(fnm env --shell bash)"
    fnm use --install-if-missing --corepack-enabled "$required_node"
  else
    nvm_script="${NVM_DIR:-${HOME:-}/.nvm}/nvm.sh"
    if [[ -s "$nvm_script" ]]; then
      set +u
      # shellcheck source=/dev/null
      source "$nvm_script"
      set -u
      nvm install "$required_node"
      nvm use "$required_node"
    fi
  fi
fi

current_node="$(node --version 2>/dev/null | sed 's/^v//' || true)"
if [[ "$current_node" != "$required_node" ]]; then
  printf 'Network Canvas requires Node %s; found %s.\n' \
    "$required_node" "${current_node:-no Node installation}" >&2
  printf 'Install the version from .node-version with fnm or nvm, then retry.\n' >&2
  exit 1
fi

if ! command -v corepack >/dev/null 2>&1; then
  printf 'Corepack is required to install the pinned pnpm version.\n' >&2
  exit 1
fi

export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

required_pnpm="$(
  node -p "require('./package.json').packageManager.split('@')[1].split('+')[0]"
)"
current_pnpm="$(corepack pnpm --version)"

if [[ "$current_pnpm" != "$required_pnpm" ]]; then
  printf 'Network Canvas requires pnpm %s; Corepack selected %s.\n' \
    "$required_pnpm" "$current_pnpm" >&2
  exit 1
fi

printf 'Installing Network Canvas dependencies with Node %s and pnpm %s...\n' \
  "$current_node" "$current_pnpm"
corepack pnpm install --frozen-lockfile --prefer-offline
