#!/usr/bin/env bash
# Signs one capture slot in the lane's Garage, under `_captures/<name>`, so
# page JavaScript can PUT a captured blob (UI export zip, downloaded CSV) out
# of the browser and the host can curl it back. The in-app browser aborts real
# file downloads, so this is the only reliable capture path. Garage has no
# anonymous access, so each slot is a pair of presigned URLs rather than a
# public prefix; run this once per capture name.
#
# Usage: enable-captures.sh --lane upgrade|fresh|analytics|twofactor --name <capture name>
# Prints one JSON line: {"putUrl":"<page PUTs the blob here>","getUrl":"<host curls it from here>"}
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

LANE=""
NAME=""
while [ $# -gt 0 ]; do
  case "$1" in
    --lane) LANE="$2"; shift 2 ;;
    --name) NAME="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done
case "$LANE" in
  upgrade|fresh|analytics|twofactor) ;;
  *) echo "Usage: enable-captures.sh --lane upgrade|fresh|analytics|twofactor --name <capture name>" >&2; exit 1 ;;
esac
[ -n "$NAME" ] || { echo "Missing --name <capture name>" >&2; exit 1; }

exec node "$SCRIPT_DIR/scripts/storage-urls.mjs" capture \
  --lane "$LANE" --name "$NAME"
