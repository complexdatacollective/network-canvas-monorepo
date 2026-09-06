#!/bin/sh
set -eu

case "${1:-serve}" in
  serve)
    [ "$#" -eq 0 ] || shift
    [ "$#" -eq 0 ] || { echo 'Usage: serve | migrate | encryption <verify|rotate|migrate-legacy> | configure <options> | diagnostics' >&2; exit 2; }
    exec node dist/index.js
    ;;
  migrate)
    shift
    [ "$#" -eq 0 ] || { echo 'Usage: serve | migrate | encryption <verify|rotate|migrate-legacy> | configure <options> | diagnostics' >&2; exit 2; }
    exec node dist/migrate.js
    ;;
  encryption)
    shift
    exec node dist/encryption.js "$@"
    ;;
  diagnostics)
    shift
    exec node dist/diagnostics.js "$@"
    ;;
  configure)
    shift
    exec node dist/configure.js "$@"
    ;;
  *) echo 'Usage: serve | migrate | encryption <verify|rotate|migrate-legacy> | configure <options> | diagnostics' >&2; exit 2 ;;
esac
