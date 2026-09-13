#!/bin/sh
set -eu

usage='Usage: serve | migrate | encryption <verify|rotate|migrate-legacy> | configure <options> | diagnostics | recovery:reconcile-authorization | recovery:authorize-current'

case "${1:-serve}" in
  serve)
    [ "$#" -eq 0 ] || shift
    [ "$#" -eq 0 ] || { echo "$usage" >&2; exit 2; }
    exec node dist/index.js
    ;;
  migrate)
    shift
    [ "$#" -eq 0 ] || { echo "$usage" >&2; exit 2; }
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
  recovery:reconcile-authorization)
    shift
    [ "$#" -eq 0 ] || { echo "$usage" >&2; exit 2; }
    exec node dist/recovery-authorization.js
    ;;
  recovery:authorize-current)
    shift
    [ "$#" -eq 0 ] || { echo "$usage" >&2; exit 2; }
    exec node dist/recovery-authorize-current.js
    ;;
  *) echo "$usage" >&2; exit 2 ;;
esac
