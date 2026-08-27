#!/usr/bin/env bash
# Makes a local file reachable by the browser page under test, so protocol
# uploads can be driven without a native file chooser (the in-app browser
# cannot operate one): the file is copied into the lane's MinIO under the
# _fixtures/ prefix, which is made anonymously readable. Page JS then fetches
# it (MinIO CORS allows any origin), wraps it in a File, and dispatches a drop
# event on the import dropzone.
#
# Usage: stage-fixture.sh --lane upgrade|fresh --file <path> [--name <object name>]
# Prints the URL the page should fetch.
set -euo pipefail

LANE=""
FILE=""
NAME=""
while [ $# -gt 0 ]; do
  case "$1" in
    --lane) LANE="$2"; shift 2 ;;
    --file) FILE="$2"; shift 2 ;;
    --name) NAME="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done
case "$LANE" in
  upgrade) MINIO_PORT=9310 ;;
  fresh) MINIO_PORT=9311 ;;
  *) echo "Usage: stage-fixture.sh --lane upgrade|fresh --file <path> [--name <object name>]" >&2; exit 1 ;;
esac
[ -f "$FILE" ] || { echo "No such file: $FILE" >&2; exit 1; }
[ -n "$NAME" ] || NAME="$(basename "$FILE")"

CONTAINER="fresco-release-test-$LANE-minio-1"
docker cp "$FILE" "$CONTAINER:/tmp/fixture-upload"
docker exec "$CONTAINER" sh -c "
  mc alias set local http://127.0.0.1:9000 minioadmin minioadmin >/dev/null &&
  mc cp /tmp/fixture-upload 'local/fresco-test/_fixtures/$NAME' >/dev/null &&
  mc anonymous set download local/fresco-test/_fixtures >/dev/null &&
  rm /tmp/fixture-upload
"
echo "http://localhost:$MINIO_PORT/fresco-test/_fixtures/$NAME"
