#!/bin/sh
set -eu

case "${1:-serve}" in
  serve)
    [ "$#" -eq 0 ] || shift
    [ "$#" -eq 0 ] || { echo 'Usage: serve | migrate | encryption <verify|rotate|migrate-legacy>' >&2; exit 2; }
    exec node dist/index.js
    ;;
  migrate)
    shift
    [ "$#" -eq 0 ] || { echo 'Usage: serve | migrate | encryption <verify|rotate|migrate-legacy>' >&2; exit 2; }
    exec node dist/migrate.js
    ;;
  encryption)
    shift
    exec node dist/encryption.js "$@"
    ;;
  *) echo 'Usage: serve | migrate | encryption <verify|rotate|migrate-legacy>' >&2; exit 2 ;;
esac
