#!/usr/bin/env bash
# Tears down release-test stacks (containers, network, volumes). With no
# arguments every lane is removed; pass --lane <name> (repeatable as a
# space-separated list) for a subset.
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
# Every lane up.sh can start. A lane missing from here survives a teardown
# that claims to have removed everything, and its published ports then break
# the next run.
[ -n "$LANES" ] || LANES="upgrade fresh analytics twofactor"

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
