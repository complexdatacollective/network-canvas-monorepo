#!/usr/bin/env bash
# Stands up one release-test stack (Fresco + Postgres + MinIO) and blocks until
# the app is healthy. Two lanes exist:
#
#   up.sh --lane upgrade --image ghcr.io/complexdatacollective/fresco:latest
#   up.sh --lane upgrade --image fresco-release-test:pending --keep-data
#   up.sh --lane fresh   --image fresco-release-test:pending
#
# --keep-data recreates only the app container against the live volumes (the
# upgrade swap: the new image's migrate-and-start.sh runs against the seeded
# database). Without it, the stack is torn down (volumes included) first, so
# the run starts from the unconfigured setup wizard.
#
# Prints a JSON line with the base URL and health response on success.
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

case "$LANE" in
  upgrade)
    PROJECT="fresco-release-test-upgrade"
    FRESCO_PORT=3210 POSTGRES_PORT=5533 MINIO_PORT=9310
    ;;
  fresh)
    PROJECT="fresco-release-test-fresh"
    FRESCO_PORT=3211 POSTGRES_PORT=5534 MINIO_PORT=9311
    ;;
  *) echo "Usage: up.sh --lane upgrade|fresh --image <ref> [--keep-data]" >&2; exit 1 ;;
esac
[ -n "$IMAGE" ] || { echo "Missing --image" >&2; exit 1; }

export FRESCO_IMAGE="$IMAGE" FRESCO_PORT POSTGRES_PORT MINIO_PORT
compose() {
  docker compose -p "$PROJECT" -f "$SCRIPT_DIR/docker-compose.yml" "$@"
}

if [ "$KEEP_DATA" = "true" ]; then
  # The upgrade swap. Drop the analytics sink with it, so the log the release
  # gate reads covers the pending image's lifetime and nothing before it: this
  # stack ran the RELEASED image until now, and that image predates the
  # guarantee the gate checks — failing the candidate for its predecessor's
  # traffic would be as wrong as missing its own. `up` below recreates the sink
  # and waits for it to be listening before it creates the new app container,
  # so the swap opens no window in which egress could be refused rather than
  # recorded.
  compose rm -sf relay-sink
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
printf '{"lane":"%s","project":"%s","baseUrl":"%s","image":"%s","health":%s}\n' \
  "$LANE" "$PROJECT" "$BASE_URL" "$IMAGE" "$HEALTH"
