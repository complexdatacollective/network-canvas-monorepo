#!/bin/sh
# Run with: sh deployment/backup.sh /absolute/data-backup /independent/keys.env
# Capture uses the dedicated SELECT-only backup identity, never a runtime role.
set -eu
umask 077
if [ "$#" -ne 2 ]; then
  echo 'Usage: sh deployment/backup.sh /absolute/new-data-backup /independent/new-keys.env' >&2
  exit 2
fi
case "$1" in /*) backup=$1 ;; *) echo 'Backup path must be absolute.' >&2; exit 2 ;; esac
case "$2" in /*) custody=$2 ;; *) echo 'Key custody path must be absolute.' >&2; exit 2 ;; esac
cd "$(dirname "$0")/.."
. ./deployment/checksum.sh
command -v jq >/dev/null 2>&1 || { echo 'Backup requires jq on the host.' >&2; exit 2; }
mkdir "$backup"
backup=$(cd "$backup" && pwd -P)
mkdir -p "$(dirname "$custody")"
custody="$(cd "$(dirname "$custody")" && pwd -P)/$(basename "$custody")"
case "$custody" in "$backup"/*) echo 'Key custody must be outside the data backup.' >&2; exit 2 ;; esac
# An exclusive copy protects a previous backup's keys. The data artifact never
# contains roots, even transiently. Keep this file in independent custody.
(set -C; cat deployment/encryption.env > "$custody")
compose() { docker compose --profile worker "$@"; }
key_checksum=$(studio_checksum "$custody")
printf '%s\n' "${key_checksum%% *}" > "$backup/encryption.sha256"
# Verify the exact retained key snapshot before stopping or capturing writers.
STUDIO_ENCRYPTION_FILE="$custody" compose -f docker-compose.yml -f deployment/encryption.yml run --rm --no-deps encryption-verify

# Stop admission first, then every replica of either service. One-off operator
# jobs are deliberately not terminated: the session check below refuses them.
compose stop traefik
compose stop studio worker
compose exec -T postgres psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
BEGIN;
ALTER ROLE studio_runtime NOLOGIN;
ALTER ROLE studio_maintenance_runtime NOLOGIN;
ALTER ROLE studio_migrator NOLOGIN;
COMMIT;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_stat_activity a WHERE a.datname = 'studio'
  ) THEN
    RAISE EXCEPTION 'Backup refused: an outside database session remains; stop its writer and retry under quarantine';
  END IF;
END $$;
SQL

# A failure intentionally leaves admission/logins closed and no complete
# marker. Never restart writers from an EXIT trap after a failed capture.
compose run --rm --no-deps backup-verify
compose exec -T postgres sh -c \
  'PGPASSWORD="$STUDIO_BACKUP_PASSWORD" exec pg_dump -h 127.0.0.1 -U studio_backup_login --role=studio_backup --enable-row-security -d studio --format=custom' \
  > "$backup/studio.dump"
test -s "$backup/studio.dump"
compose exec -T postgres sh -c \
  'PGPASSWORD="$STUDIO_BACKUP_PASSWORD" exec psql -X -qAt -v ON_ERROR_STOP=1 -h 127.0.0.1 -U studio_backup_login -d studio' \
  > "$backup/counts.json" <<'SQL'
SET ROLE studio_backup;
SELECT json_build_object('instance', (SELECT count(*) FROM studio_instance), 'audit', (SELECT count(*) FROM audit_events), 'credentialAudit', (SELECT count(*) FROM credential_audit_events), 'migrations', (SELECT count(*) FROM studio_migrations.history), 'assetReferences', (SELECT count(*) FROM asset_references));
SQL
compose stop minio
compose run --rm --no-deps -T --entrypoint tar minio -C /data -cf - . \
  > "$backup/minio.tar"
test -s "$backup/minio.tar"
# Lock and verify the complete retained generation while archiving it. Include
# no unfinished writer state and no historical shell/index from another image.
compose run --rm --no-deps -T client-assets archive --directory /retained-assets \
  > "$backup/client-assets.tar"
test -s "$backup/client-assets.tar"
# Preserve runnable bytes for every service, including infrastructure images.
# Restoring an independent copy must not require the primary registry account.
docker compose --profile '*' config --images | sort -u > "$backup/images.txt"
test -s "$backup/images.txt"
# Docker storage backends differ in whether loading preserves registry names.
# Record the exact local content IDs and a recovery-only Compose override; the
# restored stack must use retained bytes without contacting a registry.
mkdir "$backup/deployment"
printf '%s\n' 'services:' > "$backup/deployment/recovery-images.yml"
: > "$backup/images.ids"
# Compose's service-filtered --images output also includes dependencies.
# Select only image names locally; never send rendered operator secrets to a
# runtime container or retain them in the inventory.
service_images=$(docker compose --profile '*' config --format json | jq -er '
  .services | to_entries |
  if length == 0 or any(.[]; (.value.image | type) != "string") then
    error("Every recovery service requires an explicit image")
  else .[] | [.key, .value.image] | @tsv end
')
test -n "$service_images"
while IFS="$(printf '\t')" read -r service reference; do
  image_id=$(docker image inspect --format '{{.Id}}' "$reference")
  case "$image_id" in sha256:*) ;; *) echo 'Invalid retained image ID.' >&2; exit 1 ;; esac
  test "${#image_id}" -eq 71
  printf '%s\n' "$image_id" >> "$backup/images.ids"
  printf '  %s:\n    image: %s\n    pull_policy: never\n' "$service" "$image_id" >> "$backup/deployment/recovery-images.yml"
done <<EOF
$service_images
EOF
sort -u "$backup/images.ids" > "$backup/images.ids.tmp"
mv "$backup/images.ids.tmp" "$backup/images.ids"
set -f
set -- $(cat "$backup/images.txt")
docker image save "$@" > "$backup/images.tar"
test -s "$backup/images.tar"
cp .env docker-compose.yml SELF_HOSTING.md MIGRATIONS.md BACKUPS.md "$backup/"
for name in traefik.yml migrate.yml encryption.yml postgres-init.sql postgres-privileges.sql minio-init.sh minio-policy.json backup.sh restore.sh checksum.sh quarantine.yml; do
  cp "deployment/$name" "$backup/deployment/"
done
if [ -f release.json ]; then cp release.json "$backup/"; fi
if [ -f release.sigstore.json ]; then cp release.sigstore.json "$backup/"; fi
(cd "$backup" && studio_create_checksums) > "$backup/SHA256SUMS.tmp"
test -s "$backup/SHA256SUMS.tmp"
# Publish the completed file atomically; a reader must never see a partial list.
mv "$backup/SHA256SUMS.tmp" "$backup/SHA256SUMS"
sync
(cd "$backup" && studio_checksum -c SHA256SUMS)
printf '%s\n' 'Studio quiesced backup v1' > "$backup/COMPLETE"
printf '%s\n' 'Backup complete. Admission and database logins remain closed.'
