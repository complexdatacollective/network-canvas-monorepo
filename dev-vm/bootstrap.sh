#!/bin/bash
# Guest-side bootstrap for the Network Canvas dev VM.
#
# Invoked by `dev-vm/vm bootstrap` (piped through `limactl shell`), after the
# instance is up. Clones the repository if needed, installs the pinned
# toolchain and dependencies, and prepares Playwright. Idempotent.
#
# Arguments: <remote-url> <repo-path> [git-name] [git-email]
set -eu -o pipefail

REMOTE_URL="${1:?remote url}"
REPO="${2:?repository path}"
GIT_NAME="${3:-}"
GIT_EMAIL="${4:-}"

export PATH="$HOME/.local/bin:$HOME/.local/share/mise/shims:$PATH"

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

if [ -n "$GIT_NAME" ]; then git config --global user.name "$GIT_NAME"; fi
if [ -n "$GIT_EMAIL" ]; then git config --global user.email "$GIT_EMAIL"; fi
git config --global init.defaultBranch main

if [ ! -d "$REPO/.git" ]; then
  step "Cloning $REMOTE_URL into $REPO"
  install -d "$(dirname "$REPO")"
  git clone "$REMOTE_URL" "$REPO"
fi
cd "$REPO"

step "Installing Node $(cat .nvmrc) through mise"
mise install --yes
# Also the global default, so `ssh lima-nc node …` works outside a repo with
# its own .nvmrc (a repo's pin still wins inside it).
mise use --global "node@$(cat .nvmrc)"

step "Enabling corepack for the pinned pnpm"
corepack enable --install-directory "$HOME/.local/bin"
corepack install

step "Installing workspace dependencies"
pnpm install --frozen-lockfile

step "Installing Playwright browsers and their system libraries"
pnpm --filter @codaco/interviewer exec playwright install --with-deps

step "Ready: $REPO"
node --version
pnpm --version
docker --version
gh --version | head -1
claude --version 2>/dev/null || true
