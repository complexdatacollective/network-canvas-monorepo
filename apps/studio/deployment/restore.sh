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
command -v jq >/dev/null 2>&1 || { echo 'Restore requires jq on the host.' >&2; exit 2; }
compose() { docker compose --profile worker "$@"; }
test -f "$backup/COMPLETE"
test -s "$backup/studio.dump"
test -s "$backup/minio.tar"
test -s "$backup/client-assets.tar"
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

# Inspect the effective target before loading an image or replacing any local
# configuration. Compose resolves project-name precedence and custom/external
# network/volume names for us. Keep rendered credentials only in this host process.
inspection_failed() {
  echo 'Restore refused: unable to verify a new Compose project and unused named volumes.' >&2
  exit 1
}
target_config=$(COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}:$backup/deployment/recovery-images.yml" \
  docker compose --profile '*' config --format json) || inspection_failed
target_metadata=$(printf '%s\n' "$target_config" | jq -cer '
  def named_data_volume($service; $path):
    [.services[$service].volumes[]? | select(.target == $path)] as $mounts |
    ($mounts | length) == 1 and
    $mounts[0].type == "volume" and
    ($mounts[0].source | type) == "string" and
    (.volumes[$mounts[0].source].name | type) == "string";
  if (.name | type) != "string" or
     (.name | test("^[a-z0-9][a-z0-9_-]*$")) == false or
     (.volumes | type) != "object" or (.volumes | length) == 0 or
     any(.volumes[]; (.name | type) != "string" or
       (.name | test("^[a-zA-Z0-9][a-zA-Z0-9_.-]*$")) == false or
       (.driver // "local") != "local" or (.driver_opts // {}) != {}) or
     (.networks | type) != "object" or (.networks | length) == 0 or
     any(.networks[]; (.name | type) != "string" or
       (.name | test("^[a-zA-Z0-9][a-zA-Z0-9_.-]*$")) == false or
       (.driver // "bridge") != "bridge" or (.driver_opts // {}) != {}) or
     (named_data_volume("postgres"; "/var/lib/postgresql") | not) or
     (named_data_volume("minio"; "/data") | not) or
     (named_data_volume("client-assets"; "/retained-assets") | not) or
     (named_data_volume("studio"; "/retained-assets") | not) or
     ([.services["client-assets"].volumes[] | select(.target == "/retained-assets")][0].source !=
      [.services.studio.volumes[] | select(.target == "/retained-assets")][0].source)
  then error("Unsupported recovery target metadata")
  else {project: .name, volumes: [.volumes[].name], networks: [.networks[].name]} end
') || inspection_failed
unset target_config
target_project=$(printf '%s\n' "$target_metadata" | jq -er .project) || inspection_failed
target_volumes=$(printf '%s\n' "$target_metadata" | jq -er '.volumes[]') || inspection_failed
target_networks=$(printf '%s\n' "$target_metadata" | jq -er '.networks[]') || inspection_failed
existing_containers=$(docker ps --all --quiet \
  --filter "label=com.docker.compose.project=$target_project") || inspection_failed
existing_networks=$(docker network ls --format '{{.ID}}' \
  --filter "label=com.docker.compose.project=$target_project") || inspection_failed
network_names=$(docker network ls --format '{{.Name}}') || inspection_failed
project_volumes=$(docker volume ls --format '{{.Name}}' \
  --filter "label=com.docker.compose.project=$target_project") || inspection_failed
# A failed inspect is not proof that a volume is absent. Require a successful
# inventory, including volumes without this project's labels, then match exact
# resolved names. Stopped containers and orphaned project resources also refuse.
existing_volumes=$(docker volume ls --format '{{.Name}}') || inspection_failed
target_exists() {
  echo 'Restore refused: target Compose project or named volumes already exist.' >&2
  exit 1
}
if [ -n "$existing_containers$existing_networks$project_volumes" ]; then
  target_exists
fi
# A fresh project name can still join an existing custom/external network and
# resolve another deployment's postgres/minio aliases. Labels alone miss it.
while IFS= read -r network; do
  while IFS= read -r existing; do
    if [ "$network" = "$existing" ]; then
      echo 'Restore refused: target Compose network already exists.' >&2
      exit 1
    fi
  done <<EOF
$network_names
EOF
done <<EOF
$target_networks
EOF
while IFS= read -r volume; do
  while IFS= read -r existing; do
    if [ "$volume" = "$existing" ]; then target_exists; fi
  done <<EOF
$existing_volumes
EOF
done <<EOF
$target_volumes
EOF

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
compose run --rm --no-deps -T --entrypoint sh client-assets \
  -c 'test -z "$(ls -A /retained-assets)"'
compose exec -T postgres pg_restore -U postgres -d studio \
  --exit-on-error --single-transaction < "$backup/studio.dump"
# Reapply the reviewed administrator-only capability boundary to the restored
# database before any operator verification or runtime connection can proceed.
compose exec -T postgres psql -X -v ON_ERROR_STOP=1 -U postgres -d studio \
  < deployment/postgres-privileges.sql
compose run --rm --no-deps -T --entrypoint tar minio -C /data -xf - \
  < "$backup/minio.tar"
compose run --rm --no-deps -T --entrypoint tar client-assets -C /retained-assets -xf - \
  < "$backup/client-assets.tar"
compose run --rm --no-deps -T client-assets verify --directory /retained-assets
compose up -d minio-init
printf '%s\n' 'Data restored. Keep admission closed; verify all keys and run recovery smoke checks in quarantine before starting the proxy or workers.'
