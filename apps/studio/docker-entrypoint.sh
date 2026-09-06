#!/bin/sh
set -eu

case "${1:-serve}" in
  serve)
    [ "$#" -eq 0 ] || shift
    [ "$#" -eq 0 ] || { echo 'Usage: serve | migrate' >&2; exit 2; }
    exec node dist/index.js
    ;;
  migrate)
    shift
    [ "$#" -eq 0 ] || { echo 'Usage: serve | migrate' >&2; exit 2; }
    exec node dist/migrate.js
    ;;
  *) echo 'Usage: serve | migrate' >&2; exit 2 ;;
esac
