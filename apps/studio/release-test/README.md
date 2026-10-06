# Studio release test

The upgrade lane (#1901). It deploys Studio, fills it with seeded data, and
upgrades it with the commands in
[`docs/self-host/upgrade.md`](../docs/self-host/upgrade.md), exactly as
written. It fails if the instance served anything while it was meant to be
closed, if a row changed that nothing explains, or if a job queued during the
upgrade was lost.

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
| C   | the newest published Studio release | the candidate images                                     | The upgrade a self-hoster will actually run. Added and required as soon as a release is published.  |

`previous-release.mjs` asks GHCR whether `studio-api` has a published `x.y.z`
tag. When it has, the lane adds run C and fails if C did not run and pass.
When it cannot tell, the lane stops rather than read that as "nothing
published". Under CI the query must carry a token (`GITHUB_TOKEN` with
`packages: read`), because an anonymous one cannot see a private package.

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
   guide's `upgrade-sequence` block as written. The backup comment is replaced
   by the backup page's `backup-take` block, also as written.
3. Export every row again, compare, and check what the run expects: which
   images are running, which migrations the history records, and, for run B,
   that the backfill reached every seeded row and the changed sidecar is
   installed.

Everything a run produces lands in `$RUNNER_TEMP/studio-release-test` (or
`$TMPDIR/studio-release-test` locally; set `STUDIO_RELEASE_TEST_WORK` to move
it). It is outside the checkout because the backup it takes holds a copy of
the keyring. `summary.json` there is the lane's verdict; each `run-<name>/`
holds that run's evidence.

## What fails a run

**The window.** `observe.sh` reads `/readyz` and one API route four times a
second throughout the sequence. `window.mjs` then requires that:

- the instance closed within 3 seconds of `maintenance on` finishing;
- between then and `maintenance off`, nothing answered 200, every API answer
  was the maintenance page, and `/readyz` named only maintenance mode or a
  server still starting — never a migration or a schema, which would mean the
  flag was not what kept it closed;
- at least one reading during `migrate` named maintenance mode;
- no gap between readings was longer than 5 seconds;
- the instance reopened after `maintenance off`.

The one allowance: while `up -d` replaces `web`, the API route can briefly
answer 503 without the page or not answer at all, because the container that
serves the page is the one being replaced. It still never answers 200.

**The data.** `export.mjs` writes every row of every table in `public` and
`studio_jobs`, except the migration history and the fingerprint stamp, which
an upgrade changes by design. `diff-export.mjs` compares the two exports. A
lost table, row or column, or a changed value, fails the run unless one of
the masks in `diff-export.mjs` explains it. Each mask names the rows it
covers, gives its reason, and records the run that showed it is needed. A new
column is compared from the next upgrade on.

**The queued job.** Right after `maintenance on`, once the worker has logged
that it stopped claiming jobs, the lane creates one `protocol-store-gc` job as
the application role. It must still be waiting after `migrate`, and it must be
worked after `maintenance off`.

## Cleaning up

A run tears down its own stack, including after a failure. The local registry
the builds push to stays up between runs. Remove it with:

```bash
docker rm -f studio-upgrade-registry
```
