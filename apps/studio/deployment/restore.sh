#!/bin/sh
# Run from a copy of the backup configuration in a NEW Compose project.
set -eu
umask 077
if [ "$#" -ne 2 ]; then
  echo 'Usage: sh deployment/restore.sh /absolute/data-backup /independent/keys.env' >&2
  exit 2
fi
case "$1" in /*) backup=$1 ;; *) echo 'Backup path must be absolute.' >&2; exit 2 ;; esac
case "$2" in /*) custody=$2 ;; *) echo 'Key custody path must be absolute.' >&2; exit 2 ;; esac
cd "$(dirname "$0")/.."
. ./deployment/checksum.sh
compose() { docker compose --profile worker "$@"; }
test -f "$backup/COMPLETE"
test -s "$backup/studio.dump"
test -s "$backup/minio.tar"
test -s "$backup/images.tar"
test -s "$backup/images.txt"
test -s "$backup/images.ids"
test -s "$backup/deployment/recovery-images.yml"
test -s "$custody"
# Compose must parse its narrow env_file even for operator services. Point it
# at the independently held file; it is not copied into the data backup.
export STUDIO_ENCRYPTION_FILE="$custody"
# Verify custody binding and the artifact using host tools: no retained
# image need be loaded and no registry credential need be available yet.
key_checksum=$(studio_checksum "$custody")
if [ "${key_checksum%% *}" != "$(cat "$backup/encryption.sha256")" ]; then
  echo 'Restore refused: independent key custody does not match this backup.' >&2
  exit 1
fi
(cd "$backup" && studio_checksum -c SHA256SUMS)
loaded=$(docker image load --input "$backup/images.tar")
printf '%s\n' "$loaded"
loaded_references=$(printf '%s\n' "$loaded" | sed -n 's/^Loaded image: //p; s/^Loaded image ID: //p')
test -n "$loaded_references"
loaded_ids=$(
  while IFS= read -r reference; do
    docker image inspect --format '{{.Id}}' "$reference" || exit 1
  done <<EOF
$loaded_references
EOF
)
if [ "$(printf '%s\n' "$loaded_ids" | sort -u)" != "$(sort -u "$backup/images.ids")" ]; then
  echo 'Restore refused: retained image archive is incomplete or mismatched.' >&2
  exit 1
fi
# An inspect of the old registry name could pass from a warm local cache.
# Only IDs that this load actually supplied may run; never pull during recovery.
cp "$backup/deployment/recovery-images.yml" deployment/recovery-images.yml
export COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}:deployment/recovery-images.yml"
cp "$custody" deployment/encryption.env
chmod 600 deployment/encryption.env
compose up -d --wait postgres
# Refuse populated targets and live writers before the first restore write.
compose exec -T postgres psql -X -v ON_ERROR_STOP=1 -U postgres -d studio <<'SQL'
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r', 'p', 'S'))
    OR EXISTS (SELECT 1 FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_backend_pid()) THEN
    RAISE EXCEPTION 'Restore requires an empty database without other connections';
  END IF;
END $$;
SQL
compose run --rm --no-deps -T --entrypoint sh minio \
  -c 'test -z "$(ls -A /data)"'
compose exec -T postgres pg_restore -U postgres -d studio \
  --exit-on-error --single-transaction < "$backup/studio.dump"
compose run --rm --no-deps -T --entrypoint tar minio -C /data -xf - \
  < "$backup/minio.tar"
compose up -d minio-init
printf '%s\n' 'Data restored. Keep admission closed; verify all keys and run recovery smoke checks in quarantine before starting the proxy or workers.'
