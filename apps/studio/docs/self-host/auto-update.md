# Automatic updates

`auto-update.sh` deploys each new Studio release to the stack as soon as it is
published. Run it from cron, hourly. Each run:

1. Takes a lock, so a run that starts while the last one is still upgrading
   skips.
2. Stops if `.auto-update-halted` exists (see [When a run halts](#when-a-run-halts)).
3. Finds the newest published release tagged `studio@<version>` and downloads
   its `studio-release.json`, which names both images by digest.
4. Stops if `.env` already runs those two images.
5. Checks with cosign that both images were signed by the Studio release
   workflow on `main`. If either is not, it changes nothing.
6. Records a GitHub deployment for the release's commit, marks it in progress,
   and runs [`upgrade.sh`](./upgrade.md#the-upgrade-script) with the two
   images.
7. Marks the deployment with how `upgrade.sh` ended.

| `upgrade.sh` result   | Deployment status | Later runs |
| --------------------- | ----------------- | ---------- |
| `upgraded` (0)        | `success`         | continue   |
| `rolled-back` (3)     | `failure`         | halt       |
| `not-started` (2)     | `error`           | halt       |
| `rollback-failed` (4) | `error`           | halt       |
| `fix-forward` (5)     | `error`           | halt       |

The deployments show on the repository's Deployments page under the
`staging` environment. Set `STUDIO_AUTO_UPDATE_ENVIRONMENT` to record them
under another name.

Like `upgrade.sh`, it takes no backup, and it is written for the stack
`docker-compose.yml` defines.

## Install

The host needs `curl`, `jq`, `flock` (part of util-linux) and
[cosign](https://docs.sigstore.dev/cosign/system_config/installation/), and
outbound HTTPS to `api.github.com`, `github.com`,
`release-assets.githubusercontent.com` and `ghcr.io`, plus the Sigstore hosts
cosign checks signatures against (`tuf-repo-cdn.sigstore.dev`).

Put both scripts beside `docker-compose.yml` and `.env`:

```bash
curl -O https://raw.githubusercontent.com/complexdatacollective/network-canvas-monorepo/main/apps/studio/scripts/upgrade.sh
curl -O https://raw.githubusercontent.com/complexdatacollective/network-canvas-monorepo/main/apps/studio/scripts/auto-update.sh
chmod +x upgrade.sh auto-update.sh
```

Create a fine-grained personal access token with access to the
`complexdatacollective/network-canvas-monorepo` repository and the
**Deployments: Read and write** permission, and keep it in a file only the
account running cron can read:

```bash
install -m 600 /dev/null /etc/network-canvas/studio/github-token
echo 'github_pat_…' > /etc/network-canvas/studio/github-token
```

Then add the hourly run to that account's crontab (`crontab -e`), logging to a
file:

```cron
17 * * * * cd /etc/network-canvas/studio && GITHUB_TOKEN="$(cat github-token)" ./auto-update.sh >> auto-update.log 2>&1
```

The account needs to run `docker compose` without `sudo`. If Compose is not
installed as `docker compose`, add `COMPOSE=<command>` to the line, as
[the upgrade script](./upgrade.md#the-upgrade-script) describes.

Nothing stops a run partway through `upgrade.sh`, so do not wrap it in
`timeout`: a killed upgrade leaves maintenance mode on.

## When a run halts

Any upgrade that does not end in `upgraded` writes `.auto-update-halted`,
naming the release and the result, and every later run stops there. Read
`auto-update.log` and the upgrade guide's
[exit codes](./upgrade.md#the-upgrade-script) to see what state the instance is
in, put it right, then resume:

```bash
rm .auto-update-halted
```

The next hourly run tries the newest release again.

A run that fails before `upgrade.sh` starts — the release list cannot be read,
an image is not signed, the deployment cannot be recorded — changes nothing
and does not halt; the next run tries again.
