#!/usr/bin/env bash
# Makes a local file reachable by the browser page under test, so protocol
# uploads can be driven without a native file chooser (the in-app browser
# cannot operate one): the file is uploaded into the lane's Garage under the
# _fixtures/ prefix and a presigned GET URL for it is printed. Garage has no
# anonymous access, so the signature is what lets the page read it; the
# bucket's CORS rule admits the lane's app origin. Page JS then fetches the
# URL, wraps the body in a File, and dispatches a change on the import input.
#
# Usage: stage-fixture.sh --lane upgrade|fresh|analytics|twofactor --file <path> [--name <object name>]
# Prints the URL the page should fetch.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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
  upgrade|fresh|analytics|twofactor) ;;
  *) echo "Usage: stage-fixture.sh --lane upgrade|fresh|analytics|twofactor --file <path> [--name <object name>]" >&2; exit 1 ;;
esac
[ -f "$FILE" ] || { echo "No such file: $FILE" >&2; exit 1; }
[ -n "$NAME" ] || NAME="$(basename "$FILE")"

exec node "$SCRIPT_DIR/scripts/storage-urls.mjs" stage \
  --lane "$LANE" --file "$FILE" --name "$NAME"
