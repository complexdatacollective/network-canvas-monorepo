# Studio release test

The upgrade lane (#1901). It deploys Studio, fills it with seeded data, and
upgrades it with the commands in
[`docs/self-host/upgrade.md`](../docs/self-host/upgrade.md), exactly as
written, then rolls the upgrade back with the backup page's restore, also as
written. It fails if the instance served anything while it was meant to be
closed, if a row changed that nothing explains, if a job queued during the
upgrade was lost or worked before the instance reopened, or if the rollback
did not bring back the instance as it was.

CI runs it as the `studio-upgrade` job, on every Studio release PR and on any
change to what performs or describes an upgrade. The job runs `run.sh` and
nothing else, so a run that passes here passes there.

```bash
apps/studio/release-test/run.sh                # build, then every run
apps/studio/release-test/run.sh --skip-build   # reuse the last build
apps/studio/release-test/run.sh --runs B       # one run
```

It needs Docker with Compose 2.24 or newer, `curl`, `perl`, `openssl`, Node,
and this checkout with its dependencies installed: the seed and the
migration generator are checkout tools. A self-hoster needs none of that. The
upgrade itself runs only Docker commands. Ports 80, 443, 5005 and 55433 must
be free.

## The runs

Each run starts a fresh stack under the Compose project `studio-upgrade` and
tears it down afterwards.

| Run | From                                | To                                                       | What it shows                                                                                       |
| --- | ----------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| A   | the candidate images                | the same images plus one label: new digests, same schema | A code-only release. `migrate` applies nothing, and the guide's `up -d` really replaces containers. |
| B   | the candidate images                | an api image carrying a generated migration `0002`       | A release with a migration: a new column, a backfill over seeded rows, and a changed sidecar.       |
| C   | the newest published Studio release | the candidate images                                     | The upgrade a self-hoster will actually run. Added and required as soon as a release is tagged.     |

### What run C needs from a release

A Studio release is identified by a **git tag**, and by nothing else:
`@codaco/studio-api@<x.y.z>`, on the commit the release was built from.
`previous-release.mjs` reads the repository's tags and takes the newest
`x.y.z` (a prerelease does not count). The publisher (#1910) must therefore,
for every Studio release:

- push the tag `@codaco/studio-api@<x.y.z>`, where `<x.y.z>` is
  `@codaco/studio-api`'s version;
- publish `ghcr.io/complexdatacollective/studio-api:<x.y.z>` and
  `ghcr.io/complexdatacollective/studio-web:<x.y.z>` — both images under the
  studio-api version, even when studio-web's own version differs.

With no such tag the lane says "no migration-era release is published" and
asks GHCR nothing at all, so a registry that refuses an unpublished or private
package cannot turn the lane red. With one, the lane adds run C and fails if C
did not run and pass: it checks the tag out to seed the release from its own
commit, logs in to `ghcr.io` (in CI with the job's `GITHUB_TOKEN`, which has
`packages: read`; locally with whatever `docker login ghcr.io` the machine
has), and pulls both images. Any failure there fails the lane — a tag whose
images cannot be pulled is a broken release, not a missing one. Under GitHub
Actions the previous release, each run's result and the run C line are written
to the job's step summary.

Run B's migration is built in a temporary copy of this checkout and never
committed. `build-next.sh` applies `next.patch` (a nullable column with a
default on `protocols`, and a comment added to a sidecar), runs the real
generator, adds `next-backfill.sql` as the migration's backfill, seals it, and
builds the api image from that copy. The patch fails loudly once it no longer
applies.

## Each run

1. Start the stack with the "from" images, run `migrate`, seed it, complete
   first-run setup, and export every row.
2. `upgrade.sh`: put the "to" digests in `.env`, then run each line of the
   guide's `upgrade-sequence` block as written, each bounded so a wait that
   never ends fails rather than hangs. The two comments are carried out as the
   guide words them: the readiness comment by waiting (up to 10 seconds) for
   `/readyz` to name maintenance mode, and the backup comment by the backup
   page's `backup-take` block, also as written. When the backup starts, no
   `api` or `worker` container may be running, and the two the guide's
   `stop api worker` stopped must have exited through their own shutdown
   (exit code 130) rather than been killed at the end of their stop grace
   period (`stopped.json`).
3. Export every row again, compare, and check what the run expects: which
   images are running, which migrations the history records, and, for run B,
   that the backfill reached every seeded row, the changed sidecar is
   installed, and the new worker waited for the migration.
4. Roll back as the guide says: the "from" digests back in `.env`, then the
   backup page's `backup-restore` block as written, from the backup step 2
   took. Its last line is `maintenance off`, because that backup carries the
   flag. The instance must answer `/readyz` with 200, run the "from" images
   and history, have maintenance off, and export the same rows as in step 1
   (`diff-restored.json`).

Everything a run produces lands in `$RUNNER_TEMP/studio-release-test` (or
`$TMPDIR/studio-release-test` locally; set `STUDIO_RELEASE_TEST_WORK` to move
it). It is outside the checkout because the backup it takes holds a copy of
the keyring. `summary.json` there is the lane's verdict; each `run-<name>/`
holds that run's evidence.

## What fails a run

**The window.** `observe.sh` reads `/readyz` and one API route four times a
second throughout the sequence, and as fast as its requests allow while
`migrate` runs. `window.mjs` then requires that:

- the instance closed within 3 seconds of `maintenance on` finishing, and
  `/readyz` was seen naming maintenance mode before `stop api worker` started:
  once `api` is stopped Traefik answers for it, so those readings are the only
  ones that show the release being replaced closed by its own gate. The lane
  waits for the observer to take one after the guide's `/readyz` wait, before
  the stop;
- between then and `maintenance off`, nothing answered 200, every API answer
  was the maintenance page, and `/readyz` named only maintenance mode or a
  server still starting — never a migration or a schema, which would mean the
  flag was not what kept it closed;
- at least one reading during `migrate` named maintenance mode (about a dozen
  are taken; it is a sample, not a continuous watch);
- no stretch of the window, from the closing reading to `maintenance off`
  starting, went longer than 5 seconds without a reading;
- the instance reopened after `maintenance off`.

While `api` is stopped — from `stop api worker` until the new one answers —
the API route gets the page from Traefik with 503 and `/readyz` gets
Traefik's own bare 502, which the rules above already accept; it needs no
allowance. The one allowance: while `up -d` replaces `web`, the API route may
answer a bare 503 without the page, or not answer at all, because the
container that serves the page is the one being replaced. Any other status there — a 500, a
401, a 404 — fails like it would anywhere in the window, and nothing in the
window may answer 200.

**The data.** `export.mjs` writes every row of every table in `public` and
`studio_jobs`, except the migration history and the fingerprint stamp, which
an upgrade changes by design. `diff-export.mjs` compares the two exports. A
lost table, row or column, or a changed value, fails the run unless one of
the masks in `diff-export.mjs` explains it. Each mask names the rows it
covers, gives its reason, and records the run that showed it is needed. A new
column is compared from the next upgrade on.

**The queued job.** Once the guide's `stop api worker` has returned, so no
worker of the old release is left to claim it, the lane creates one
`protocol-store-gc` job as the application role. It must
still be waiting after `migrate`; it must still be waiting once the new
worker — the one `up -d` started — is running; and its `completed_at` must be
later than the moment `maintenance off` cleared the flag
(`deployment_state.updated_at`).

Before `maintenance off` the lane waits (up to two minutes) for that new
worker to log that it started, and requires it to have logged its pause: the
worker logs "started" only after its schema is current and its maintenance
gate has read the flag. This is the one wait the lane adds to the guide, and
the guide does not need it: a worker still starting when `maintenance off`
runs simply starts open, as it should. The proof needs it: without it the new worker
starts after `maintenance off`, and a new build whose worker ignores the flag
would pass. `new-worker.json` records what it logged.

## Cleaning up

A run tears down its own stack, including after a failure. The local registry
the builds push to stays up between runs. Remove it with:

```bash
docker rm -f studio-upgrade-registry
```
