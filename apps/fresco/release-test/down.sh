#!/usr/bin/env bash
# Tears down release-test stacks (containers, network, volumes). With no
# arguments both lanes are removed; pass --lane upgrade|fresh for one.
# --purge also removes the locally built pending image.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

LANES=""
PURGE="false"
while [ $# -gt 0 ]; do
  case "$1" in
    --lane) LANES="$2"; shift 2 ;;
    --purge) PURGE="true"; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done
[ -n "$LANES" ] || LANES="upgrade fresh"

for lane in $LANES; do
  # Interpolation values are irrelevant for `down`, but compose warns on unset
  # variables — provide the defaults.
  FRESCO_IMAGE="unused" docker compose \
    -p "fresco-release-test-$lane" -f "$SCRIPT_DIR/docker-compose.yml" \
    down -v --remove-orphans
done

if [ "$PURGE" = "true" ]; then
  docker image rm -f fresco-release-test:pending >/dev/null 2>&1 || true
fi

echo "[release-test] down: $LANES"
