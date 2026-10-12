---
'fresco': minor
---

The Docker deployment (`docker-compose.prod.yml`) now bundles
[Garage](https://garagehq.deuxfleurs.fr) for file storage instead of MinIO,
whose image is no longer published on Docker Hub. A new deployment needs two
values in `.env`, `GARAGE_ACCESS_KEY_ID` and `GARAGE_SECRET_ACCESS_KEY`, and
the compose file prints the commands that generate them. Garage creates the `assets` bucket and its access key itself when it
starts, so the setup wizard's storage step needs no manual preparation. The deployment needs Docker Engine
25 or later and Docker Compose 2.23.1 or later.

This release does not migrate existing files. A deployment that already runs
the bundled MinIO and switches to the new compose file loses its MinIO service;
the files stay in the `minio` Docker volume until the operator moves them.

Uploads now work with S3-compatible services that check upload checksums,
Garage among them. Fresco used to sign each upload URL with the checksum of an
empty file, before the browser had sent the real one, so those services
rejected the upload.
