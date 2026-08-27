#!/usr/bin/env bash
# Makes the lane's MinIO `_captures/` prefix anonymously readable AND writable,
# so page JavaScript can PUT captured blobs (UI export zips, downloaded CSVs)
# out of the browser, and the host can curl them back. The in-app browser
# aborts real file downloads, so this is the only reliable capture path.
#
# Usage: enable-captures.sh --lane upgrade|fresh
# Prints the capture base URL.
set -euo pipefail

LANE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --lane) LANE="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done
case "$LANE" in
  upgrade) MINIO_PORT=9310 ;;
  fresh) MINIO_PORT=9311 ;;
  *) echo "Usage: enable-captures.sh --lane upgrade|fresh" >&2; exit 1 ;;
esac

docker exec "fresco-release-test-$LANE-minio-1" sh -c "
  mc alias set local http://127.0.0.1:9000 minioadmin minioadmin >/dev/null &&
  mc anonymous set public local/fresco-test/_captures >/dev/null
"
echo "http://localhost:$MINIO_PORT/fresco-test/_captures"
