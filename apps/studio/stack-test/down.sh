#!/usr/bin/env bash
# Tears a variant down: every container the stack declares, the stubs the
# variant added, both networks and all of the volumes (#1909).
#
#   apps/studio/stack-test/down.sh --variant reference
#
# `--profile migrate` is not optional. `migrate` depends on `garage-init` — and
# on the external-bucket variant's own one-shot — so Compose creates those as
# ordinary containers rather than `--rm` ones, and a plain `down` leaves them
# behind holding the network. The next `up` then fails against a container
# attached to a network that no longer exists. They are not orphans either
# (the files still declare them), so `--remove-orphans` does not reach them.
# See the same note on `down` in server/scripts/dev-stack.ts.
#
# Volumes always go: a variant cycle must start from an empty database, or the
# first-run setup this suite asserts would already be spent.
set -euo pipefail

# shellcheck source=./lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

parse_variant "$@"

# Compose interpolates the files for every command, teardown included, so the
# environment file has to exist even here. `down.sh` in a checkout where `up.sh`
# never ran — a CI job whose `up.sh` failed before writing it — gets a minimal
# one rather than an interpolation error on top of the original failure.
if [ ! -f "$ENV_FILE" ]; then
  mkdir -p "$WORK_DIR"
  cat > "$ENV_FILE" <<ENV
# Written by down.sh: up.sh never got as far as writing this file. The values
# are placeholders — `down` reads only the names.
STUDIO_HOSTNAME=$HOSTNAME_
ACME_EMAIL=nobody@localhost
STUDIO_API_IMAGE=$API_IMAGE
STUDIO_WEB_IMAGE=$WEB_IMAGE
STACK_SUBNET=$STACK_SUBNET
POSTGRES_USER=studio
POSTGRES_DB=studio
BETTER_AUTH_SECRET=unused
S3_REGION=garage
S3_BUCKET=studio
S3_ACCESS_KEY_ID=unused
S3_SECRET_ACCESS_KEY=unused
GARAGE_RPC_SECRET=unused
GARAGE_ADMIN_TOKEN=unused
DATABASE_URL=
S3_ENDPOINT=
REDIS_URL=
SMTP_URL=
EMAIL_FROM=
EXTERNAL_GARAGE_RPC_SECRET=unused
EXTERNAL_GARAGE_ADMIN_TOKEN=unused
EXTERNAL_NETWORK=$EXTERNAL_NETWORK
EXTERNAL_SUBNET=$EXTERNAL_SUBNET
ENV
fi

# Saved first, because this is the last moment they exist. A CI job tears every
# variant down whatever happened, so without this the containers a failure
# needs explaining are gone before the run can upload anything — and locally
# they are what turns "it failed twenty minutes ago" into something readable.
mkdir -p "$WORK_DIR"
compose ps --all > "$WORK_DIR/$VARIANT-ps.txt" 2>&1 || true
compose logs --no-color > "$WORK_DIR/$VARIANT-logs.txt" 2>&1 || true

# The stubs are services of the variant's own override rather than containers
# started beside the project, so this one command reaches them, their network
# and their volumes. Nothing this suite starts is outside the project.
compose --profile migrate --profile unused down --remove-orphans --volumes

# The token and the cookie jar are spent, and leaving them would let a later
# `assert.sh` run against a stack that never issued them. Everything else in
# .work is diagnostic and is cleared by the next `up.sh` instead.
rm -f "$TOKEN_FILE" "$WORK_DIR/cookies"

say "down: variant '$VARIANT' (project $PROJECT)"
say "kept $VARIANT-ps.txt and $VARIANT-logs.txt in $(basename "$WORK_DIR")"
