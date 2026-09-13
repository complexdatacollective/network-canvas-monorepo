#!/bin/sh
# Source from backup/restore. Both supported host tools emit the same SHA-256
# check-file format; use the host filesystem for large retained image archives.
studio_checksum_files() {
  find . -type f ! -name 'SHA256SUMS*' ! -name COMPLETE "$@"
}
if command -v sha256sum >/dev/null 2>&1; then
  studio_checksum() { sha256sum "$@"; }
  studio_create_checksums() { studio_checksum_files -exec sha256sum {} +; }
elif command -v shasum >/dev/null 2>&1; then
  studio_checksum() { shasum -a 256 "$@"; }
  studio_create_checksums() { studio_checksum_files -exec shasum -a 256 {} +; }
else
  echo 'Recovery requires sha256sum or shasum on the host.' >&2
  exit 1
fi
