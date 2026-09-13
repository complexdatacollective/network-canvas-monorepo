#!/bin/sh
set -eu
# Readiness is bounded. Expected startup retries print no URLs or credentials.
attempt=0
until mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1 && mc ready local >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 60 ] || { echo 'Object store did not become ready.' >&2; exit 1; }
  sleep 1
done
mc mb --ignore-existing local/studio >/dev/null
mc anonymous set none local/studio >/dev/null
mc admin user add local "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY" >/dev/null
mc admin policy create local studio-assets /deployment/minio-policy.json >/dev/null
mc admin policy attach local studio-assets --user "$S3_ACCESS_KEY_ID" >/dev/null
