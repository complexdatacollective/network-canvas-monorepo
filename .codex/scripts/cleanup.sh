#!/usr/bin/env bash

set -euo pipefail

# Codex runs this hook immediately before deleting the managed worktree. The
# setup script creates only worktree-local files, which Codex removes with the
# worktree itself. Shared pnpm and Turbo state must remain available to other
# Network Canvas worktrees that may still be running.
printf 'No external Network Canvas resources need cleanup.\n'
