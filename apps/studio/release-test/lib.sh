# Shared by the release-test scripts (#1901): where things are, the one
# Compose project every run uses, the local registry the images go through,
# and the few helpers each script needs.
#
# Sourced, never executed. Every caller sets `set -euo pipefail` itself.

RELEASE_TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STUDIO_DIR="$(cd "$RELEASE_TEST_DIR/.." && pwd)"
REPO_ROOT="$(cd "$STUDIO_DIR/../.." && pwd)"
# Everything a run generates, OUTSIDE the checkout: a run's backup holds a copy
# of the keyring and a database dump, and anything under the repository root is
# in the next image build's context. Cleared per run by run.sh rather than on
# teardown, so a failed run stays explainable after its containers are gone.
_tmp="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
WORK_DIR="${STUDIO_RELEASE_TEST_WORK:-${_tmp%/}/studio-release-test}"

# One project, distinct from the stack test's `studio-ci` and from a
# self-hoster's `studio`, so this lane can never tear down either. Every
# container, network and volume it creates carries this label, and teardown
# removes exactly those.
PROJECT="studio-upgrade"
# The stack's network, and therefore TRUSTED_PROXIES. .245 rather than the
# stack test's .243/.244, `dev:stack`'s .242, `pnpm dev`'s .241 or
# `.env.example`'s .240, so the lanes can coexist on one host.
STACK_SUBNET="172.31.245.0/24"
HOSTNAME_="localhost"
URL="https://$HOSTNAME_"
ORIGIN="https://$HOSTNAME_"

# The images reach the stack by digest through this registry, so the guide's
# `docker compose pull` runs verbatim against real digests, as it does in
# production. Loopback, which the Docker daemon treats as an insecure registry
# by default — no TLS and no daemon configuration needed.
REGISTRY_CONTAINER="studio-upgrade-registry"
REGISTRY="127.0.0.1:5005"
REGISTRY_IMAGE="registry:2@sha256:a3d8aaa63ed8681a604f1dea0aa03f100d5895b6a58ace528858a7b332415373"

# compose.upgrade.yml publishes Postgres here for the seed and nothing else.
DB_PORT=55433

IMAGES_ENV="$WORK_DIR/images.env"

say() { echo "[release-test] $*"; }

die() {
  echo "[release-test] $*" >&2
  exit 1
}

# The three files every command of a run applies, in the order Compose
# layers them. The guide's commands are run verbatim with these exported as
# COMPOSE_FILE (and the project and environment file beside them), which is
# how a self-hoster's `docker compose …` from the directory holding
# docker-compose.yml becomes this lane's project without editing a command.
#
# `docker-compose.local.yml` for the reason the stack test applies it: it
# points Traefik at a certificate authority that does not answer, so the
# stack serves its own certificate for `localhost`.
compose_files() {
  printf '%s:%s:%s' \
    "$STUDIO_DIR/docker-compose.yml" \
    "$STUDIO_DIR/docker-compose.local.yml" \
    "$RELEASE_TEST_DIR/compose.upgrade.yml"
}

# Sets the Compose environment for a run whose deployment directory is $1.
# After this, a bare `docker compose …` in that directory addresses the run's
# stack. Requires Compose 2.24 or newer for COMPOSE_ENV_FILES.
use_deployment() {
  DEPLOY_DIR="$1"
  export COMPOSE_PROJECT_NAME="$PROJECT"
  export COMPOSE_FILE
  COMPOSE_FILE="$(compose_files)"
  export COMPOSE_ENV_FILES="$DEPLOY_DIR/.env"
  export COMPOSE_PATH_SEPARATOR=':'
}

# `docker compose` with every profile, for teardown: `migrate` depends on
# `garage-init`, which Compose creates as an ordinary container, and a
# plain `down` leaves it holding the network (stack-test/down.sh says why).
compose_all() {
  docker compose --profile migrate "$@"
}

# The value of one variable in an images.env-shaped file.
image_var() { # file name
  sed -n "s/^$2=//p" "$1" | tail -n 1
}
