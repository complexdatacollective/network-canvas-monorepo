#!/usr/bin/env bash

# Run one E2E suite directly on a native Linux ARM64 CI runner. Local visual
# snapshot regeneration remains containerized by each package's e2e/run.sh.
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <architect|interview|interviewer> [playwright arguments...]" >&2
  exit 1
fi

SUITE="$1"
shift

case "$SUITE" in
  architect | interview | interviewer) ;;
  *)
    echo "Error: unsupported E2E suite '$SUITE'." >&2
    exit 1
    ;;
esac

if [ "${GITHUB_ACTIONS:-}" != "true" ] \
  || [ "${RUNNER_OS:-}" != "Linux" ] \
  || [ "${RUNNER_ARCH:-}" != "ARM64" ]; then
  echo "Error: native E2E runs require a GitHub-hosted Linux ARM64 runner." >&2
  exit 1
fi

export CI=true

case "$SUITE" in
  architect)
    export VITE_DISABLE_ANALYTICS=true
    export VITE_DISABLE_ANIMATIONS=true
    pnpm turbo run build --filter=@codaco/architect
    pnpm --filter @codaco/architect exec playwright test \
      --config=e2e/playwright.config.ts "$@"
    ;;
  interview)
    pnpm turbo run build --filter=@codaco/interview
    pnpm --filter @codaco/interview exec vite build \
      --config e2e/host/vite.config.ts
    pnpm --filter @codaco/interview exec playwright test \
      --config=e2e/playwright.config.ts "$@"
    ;;
  interviewer)
    export VITE_DISABLE_ANALYTICS=true
    export VITE_DISABLE_ANIMATIONS=true
    pnpm turbo run build --filter=@codaco/interviewer
    pnpm --filter @codaco/interviewer exec playwright test \
      --config=e2e/playwright.config.ts "$@"
    ;;
esac
