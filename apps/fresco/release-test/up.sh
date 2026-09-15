#!/usr/bin/env bash
# Stands up one release-test stack (Fresco + Postgres + MinIO) and blocks until
# the app is healthy. Four lanes exist, each a compose project of its own on
# its own ports, so they can run side by side:
#
#   up.sh --lane upgrade   --image ghcr.io/complexdatacollective/fresco:latest
#   up.sh --lane upgrade   --image fresco-release-test:pending --keep-data
#   up.sh --lane fresh     --image fresco-release-test:pending
#   up.sh --lane analytics --image fresco-release-test:pending
#   up.sh --lane twofactor --image fresco-release-test:pending
#
# The lane is also the deployment configuration. `upgrade` and `fresh` are the
# disabled-analytics deployment every other check assumes; `analytics` is the
# one lane that runs with analytics ENABLED, against a sink that terminates TLS
# and records the payloads (the only way to see what an enabled deployment
# actually sends); `twofactor` sets REQUIRE_TWO_FACTOR. Each switch lives here
# rather than in the compose file so that a lane cannot be started in another
# lane's configuration by accident.
#
# --keep-data recreates only the app container against the live volumes (the
# upgrade swap: the new image's migrate-and-start.sh runs against the seeded
# database). Without it, the stack is torn down (volumes included) first, so
# the run starts from the unconfigured setup wizard.
#
# Prints a JSON line with the base URL, the image id docker reports for the
# Fresco container, and the health response on success. The image id is what
# binds a lane to a build: /api/health names no version, on purpose.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

LANE=""
IMAGE=""
KEEP_DATA="false"
while [ $# -gt 0 ]; do
  case "$1" in
    --lane) LANE="$2"; shift 2 ;;
    --image) IMAGE="$2"; shift 2 ;;
    --keep-data) KEEP_DATA="true"; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

# Deployment defaults: the configuration the release ships and most lanes
# test. Only the lane that needs a switch flipped flips it, below.
FRESCO_DISABLE_ANALYTICS="true"
FRESCO_REQUIRE_TWO_FACTOR="false"
FRESCO_NODE_TLS_REJECT_UNAUTHORIZED="1"
RELAY_SINK_SCRIPT="relay-sink.mjs"

case "$LANE" in
  upgrade)
    PROJECT="fresco-release-test-upgrade"
    FRESCO_PORT=3210 POSTGRES_PORT=5533 MINIO_PORT=9310
    SINK_HTTPS_PORT=9440 SINK_HTTP_PORT=9450
    ;;
  fresh)
    PROJECT="fresco-release-test-fresh"
    FRESCO_PORT=3211 POSTGRES_PORT=5534 MINIO_PORT=9311
    SINK_HTTPS_PORT=9441 SINK_HTTP_PORT=9451
    ;;
  analytics)
    PROJECT="fresco-release-test-analytics"
    FRESCO_PORT=3212 POSTGRES_PORT=5535 MINIO_PORT=9312
    SINK_HTTPS_PORT=9442 SINK_HTTP_PORT=9452
    # The one enabled-analytics deployment. Its sink terminates TLS with a
    # certificate minted below, which the container would otherwise refuse —
    # see the compose file for why that only changes verification.
    FRESCO_DISABLE_ANALYTICS="false"
    FRESCO_NODE_TLS_REJECT_UNAUTHORIZED="0"
    RELAY_SINK_SCRIPT="relay-payload-sink.mjs"
    ;;
  twofactor)
    PROJECT="fresco-release-test-twofactor"
    FRESCO_PORT=3213 POSTGRES_PORT=5536 MINIO_PORT=9313
    SINK_HTTPS_PORT=9443 SINK_HTTP_PORT=9453
    FRESCO_REQUIRE_TWO_FACTOR="true"
    ;;
  *) echo "Usage: up.sh --lane upgrade|fresh|analytics|twofactor --image <ref> [--keep-data]" >&2; exit 1 ;;
esac
[ -n "$IMAGE" ] || { echo "Missing --image" >&2; exit 1; }

# Bind-mount targets. Created here so docker does not create them as root, and
# emptied for a lane that is starting fresh so one run's captures can never be
# read as another's.
CAPTURE_DIR="$SCRIPT_DIR/artifacts/relay-capture"
TLS_DIR="$SCRIPT_DIR/artifacts/relay-tls"
mkdir -p "$CAPTURE_DIR" "$TLS_DIR"
if [ "$KEEP_DATA" != "true" ]; then
  rm -f "$CAPTURE_DIR/$LANE.jsonl"
fi

# The payload sink's certificate. Minted per run into a git-ignored directory
# rather than committed: a checked-in private key is a liability even when it
# only ever serves a name that resolves to a container on this machine.
if [ "$RELAY_SINK_SCRIPT" = "relay-payload-sink.mjs" ]; then
  # The name the certificate has to carry is the relay constant's own host,
  # read from it rather than repeated: a certificate for the wrong name would
  # make the container refuse the sink and the lane observe nothing.
  RELAY_HOST="$(node -e "
    const { readFileSync } = require('node:fs');
    const src = readFileSync('$SCRIPT_DIR/../../../packages/shared-consts/src/posthog.ts', 'utf8');
    process.stdout.write(new URL(/POSTHOG_HOST = '([^']+)'/.exec(src)[1]).hostname);
  ")"
  openssl req -x509 -newkey rsa:2048 -nodes -days 30     -subj "/CN=$RELAY_HOST"     -addext "subjectAltName=DNS:$RELAY_HOST,DNS:localhost,IP:127.0.0.1"     -keyout "$TLS_DIR/key.pem" -out "$TLS_DIR/cert.pem" 2>/dev/null
  chmod 644 "$TLS_DIR/key.pem"
fi

export LANE FRESCO_IMAGE="$IMAGE" FRESCO_PORT POSTGRES_PORT MINIO_PORT \
  SINK_HTTPS_PORT SINK_HTTP_PORT FRESCO_DISABLE_ANALYTICS \
  FRESCO_REQUIRE_TWO_FACTOR FRESCO_NODE_TLS_REJECT_UNAUTHORIZED \
  RELAY_SINK_SCRIPT
compose() {
  docker compose -p "$PROJECT" -f "$SCRIPT_DIR/docker-compose.yml" "$@"
}

if [ "$KEEP_DATA" = "true" ]; then
  # The upgrade swap. Remove the app container and the analytics sink together,
  # so the log the release gate reads covers the pending image's lifetime and
  # nothing before it: this stack ran the RELEASED image until now, and that
  # image predates the guarantee the gate checks — failing the candidate for
  # its predecessor's traffic would be as wrong as missing its own.
  #
  # Both, and in one command, because removing only the sink would leave the
  # released app running while `up` starts the replacement and waits for it to
  # be healthy. A delayed or background analytics connection made in that
  # window would land in the new log and be read as the pending image's.
  #
  # Only the containers: the named volumes stay, which is what makes this a
  # swap rather than a fresh install, and `up` recreates the app from the
  # pending image so its migrate-and-start.sh runs against the seeded data.
  compose rm -sf fresco relay-sink
else
  compose down -v --remove-orphans
fi

compose up -d --wait --wait-timeout 300 || {
  echo "[release-test] stack failed to become healthy; recent fresco logs:" >&2
  compose logs --tail 100 fresco >&2 || true
  exit 1
}

BASE_URL="http://localhost:$FRESCO_PORT"
HEALTH="$(curl -fsS "$BASE_URL/api/health")"
# The container's .Image, not what the tag resolves to: the upgrade lane's
# baseline container is replaced by the swap, so this is the only record of
# the image the upgrade actually started from.
IMAGE_ID="$(docker inspect --format '{{.Image}}' "$(compose ps -q fresco)")"
printf '{"lane":"%s","project":"%s","baseUrl":"%s","image":"%s","imageId":"%s","sinkHttpsPort":%s,"sinkHttpPort":%s,"analytics":%s,"requireTwoFactor":%s,"health":%s}\n' \
  "$LANE" "$PROJECT" "$BASE_URL" "$IMAGE" "$IMAGE_ID" \
  "$SINK_HTTPS_PORT" "$SINK_HTTP_PORT" \
  "$([ "$FRESCO_DISABLE_ANALYTICS" = "false" ] && echo true || echo false)" \
  "$FRESCO_REQUIRE_TWO_FACTOR" "$HEALTH"
