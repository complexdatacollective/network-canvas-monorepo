#!/usr/bin/env bash
# A participant's interview through the built images (#1899).
#
#   apps/studio/stack-test/participants.sh --variant reference
#
# Run after `up.sh --variant <same>`. Unlike the other scripts this one needs
# the checkout installed (`pnpm install` and Playwright's Chromium): the links
# are made by `api/scripts/e2e-participant-links.ts`, which publishes the lean
# e2e protocol through the server's own protocol store, and the walk is a
# Playwright spec. Postgres publishes no port, so the script runs in a Node
# container on the stack's network, reading the stack's own secrets.
set -euo pipefail

# shellcheck source=./lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

parse_variant "$@"

REPO_ROOT="$(cd "$STUDIO_DIR/../.." && pwd)"
NODE_IMAGE="node:$(tr -d 'v\n' < "$REPO_ROOT/.nvmrc")-slim"

say "creating a managed and an anonymous participant link"
links="$(docker run --rm \
  --network "${PROJECT}_default" \
  -v "$REPO_ROOT:/repo:ro" \
  -w /repo/apps/studio/api \
  -e DATABASE_URL=postgres://studio@postgres:5432/studio \
  -e DATABASE_PASSWORD_FILE=/repo/apps/studio/secrets/postgres-password \
  -e STUDIO_SECRETS_KEY_FILE=/repo/apps/studio/secrets/studio-secrets-key \
  "$NODE_IMAGE" node scripts/e2e-participant-links.ts | tail -n 1)"

say "walking both links through $(ingress_url)"
STUDIO_E2E_URL="$(ingress_url)" STUDIO_E2E_LINKS="$links" \
  pnpm --dir "$REPO_ROOT" --filter @codaco/studio-web test:e2e:stack
