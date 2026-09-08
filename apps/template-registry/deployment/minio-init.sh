#!/bin/sh
set -eu
# Administrative credentials belong only to this one-off provisioning service.
# Do not print the mc invocation or its provider diagnostics.
attempt=0
until mc alias set registry http://registry-minio:9000 "$REGISTRY_MINIO_ROOT_USER" "$REGISTRY_MINIO_ROOT_PASSWORD" >/dev/null 2>&1 && mc ready registry >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo 'Registry object-store readiness failed.' >&2
    exit 1
  fi
  sleep 1
done
if ! {
  mc mb --ignore-existing registry/registry &&
  mc anonymous set none registry/registry &&
  mc admin policy create registry registry-runtime /deployment/minio-policy.json &&
  mc admin user add registry "$REGISTRY_S3_ACCESS_KEY_ID" "$REGISTRY_S3_SECRET_ACCESS_KEY" &&
  mc admin policy attach registry registry-runtime --user "$REGISTRY_S3_ACCESS_KEY_ID"
} >/dev/null 2>&1; then
  echo 'Registry object-store provisioning failed.' >&2
  exit 1
fi
