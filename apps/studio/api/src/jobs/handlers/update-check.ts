import { eq } from 'drizzle-orm';
import {
  Cause,
  Duration,
  Effect,
  Exit,
  MutableHashSet,
  Redacted,
} from 'effect';
import { FetchHttpClient, HttpClient, HttpClientResponse } from 'effect/http';
import type { SqlError } from 'effect/sql';

import type { DeploymentMode } from '@codaco/studio-contract/surfaces';

import { AUTH_TABLES } from '../../db/auth-schema.ts';
import type { MaintenanceDatabase } from '../../db/client.ts';
import {
  claimNotification,
  type NotificationClaim,
  type LatestRelease,
  recordUpdateCheck,
  releaseNotificationClaim,
} from '../../db/deployment-state.ts';
import { sqlErrorsOnly } from '../../db/errors.ts';
import { readVerifiedMigrations } from '../../db/migrate.ts';
import { readBundledMigrations } from '../../db/migrations-document.ts';
import { MaintenanceScope, Transaction } from '../../db/tenant.ts';
import { type MailFailed, Mailer } from '../../mail/mailer.ts';
import { SETUP_TABLES } from '../../setup/schema.ts';
import {
  isNewer,
  ReleaseManifest,
  UPDATE_MANIFEST_URL,
  upgradeAppliesMigration,
} from '../../update/manifest.ts';
import { STUDIO_VERSION } from '../../version.ts';
import type { HandledJob, JobOutcome } from '../worker.ts';

// The daily check for a newer Studio release (#1901). It reads one fixed
// manifest, records what it says, and — when the release is newer than the one
// running — emails the installation's owner once per version. It is registered
// whether or not the instance can send mail, because the in-app notice reads
// the row this writes and needs no transport.

const QUEUE = 'update-check';

const COMPLETED: JobOutcome = 'completed';

/**
 * The whole fetch. The queue's `expireInSeconds` is declared
 * above this plus the SMTP transport's own bounds, so a slow send is never
 * reaped while it is still running.
 */
export const MANIFEST_FETCH_BOUND = Duration.seconds(20);

const { installation } = SETUP_TABLES;
const { user } = AUTH_TABLES;

export type UpdateCheckOptions = {
  readonly deploymentMode: DeploymentMode;
  /** The version this process is; defaults to the build's own. */
  readonly runningVersion?: string | undefined;
  /**
   * The newest migration this process's build carries, `null` for one that
   * cannot be read; defaults to the newest in the migrations document beside
   * the bundle, read at each run.
   */
  readonly runningMigration?: string | null | undefined;
};

type Owner = {
  readonly email: Redacted.Redacted;
  readonly name: Redacted.Redacted;
};

/** What became of the one send this run was entitled to make. */
type Delivery = 'sent' | 'not-sent' | 'not-claimed';

/**
 * One GET of one fixed URL, carrying nothing about the instance: the only
 * header is `Accept`, there is no query, no body and no cookie. There is no
 * retry: a failed fetch settles the run as suppressed, and the next daily run
 * is the retry, so a run makes exactly one request.
 *
 * Trace propagation is switched off for the request. Effect's client adds
 * `traceparent` and `b3` to every request by default, and with telemetry on
 * that trace id would correlate this request with the instance's exported
 * traces. Redirects are refused rather than followed, because a redirect would
 * be a second host.
 */
const fetchManifest = Effect.gen(function* () {
  const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk);
  const response = yield* client.get(UPDATE_MANIFEST_URL, {
    headers: { accept: 'application/json' },
  });
  return yield* HttpClientResponse.schemaBodyJson(ReleaseManifest)(response);
}).pipe(
  Effect.timeout(MANIFEST_FETCH_BOUND),
  Effect.provideService(HttpClient.TracerPropagationEnabled, false),
  Effect.provideService(FetchHttpClient.RequestInit, { redirect: 'error' }),
);

/**
 * The newest migration of the running build, from the same document
 * `studio-api migrate` applies, verified as this build's. `null` when it
 * cannot be read — a process run from source has none beside it — which
 * `upgradeAppliesMigration` answers conservatively.
 */
const newestBundledMigration = (annotations: Record<string, unknown>) =>
  Effect.tryPromise(readBundledMigrations).pipe(
    Effect.flatMap((text) => readVerifiedMigrations(text)),
    Effect.map((verified) => verified.migrations.at(-1)?.version ?? null),
    Effect.catch((error) =>
      Effect.logInfo(
        "this build's migrations could not be read, so a newer release is reported as changing the database",
        Cause.fail(error),
      ).pipe(Effect.annotateLogs(annotations), Effect.as(null)),
    ),
  );

/**
 * What the check records. Whether the upgrade changes the database is decided
 * here, against the running build, because the manifest cannot know where
 * this instance starts from.
 */
const asRelease = (
  manifest: ReleaseManifest,
  runningMigration: string | null,
): LatestRelease => ({
  version: manifest.version,
  releasedAt: new Date(manifest.date),
  notesUrl: manifest.notes,
  schemaChange: upgradeAppliesMigration(manifest, runningMigration),
});

/** Every database touch of the check: one scope opener, so the inventory lists one site. */
const inMaintenance = <A, E>(
  effect: Effect.Effect<A, E, Transaction>,
): Effect.Effect<A, E | SqlError.SqlError, MaintenanceDatabase> =>
  MaintenanceScope.open(effect);

const readOwner = Effect.fn('job.update-check.readOwner')(function* () {
  const rows = yield* inMaintenance(
    Effect.gen(function* () {
      const { tx } = yield* Transaction;
      return yield* tx
        .select({ email: user.email, name: user.name })
        .from(installation)
        .innerJoin(user, eq(installation.ownerUserId, user.id))
        .where(eq(installation.id, 1));
    }).pipe(sqlErrorsOnly),
  );
  const row = rows[0];
  const owner: Owner | null =
    row === undefined
      ? null
      : { email: Redacted.make(row.email), name: Redacted.make(row.name) };
  return owner;
});

const record = (release: LatestRelease) =>
  inMaintenance(recordUpdateCheck(release));

const claim = (version: string) => inMaintenance(claimNotification(version));

const giveBack = (version: string, taken: NotificationClaim) =>
  inMaintenance(releaseNotificationClaim(version, taken));

export const updateCheck = (options: UpdateCheckOptions) => {
  const runningVersion = options.runningVersion ?? STUDIO_VERSION;
  // The versions this process has already said "no mail transport" about. The
  // claim is given back in that case (below), so the next daily run reaches the
  // same line again; this is what keeps it to one line per process per version.
  const mentionedWithoutMail = MutableHashSet.empty<string>();

  const mentionMissingTransport = (version: string) =>
    MutableHashSet.has(mentionedWithoutMail, version)
      ? Effect.void
      : Effect.suspend(() => {
          MutableHashSet.add(mentionedWithoutMail, version);
          return Effect.logInfo(
            'A newer Studio is available, but no mail transport is configured, so the owner was not emailed. The in-app notice still shows it, and the owner is emailed at the next daily check after mail is configured.',
          ).pipe(Effect.annotateLogs({ queue: QUEUE, version }));
        });

  const notifyOwner = Effect.fnUntraced(function* (
    owner: Owner,
    release: LatestRelease,
  ): Effect.fn.Return<
    JobOutcome,
    MailFailed | SqlError.SqlError,
    MaintenanceDatabase | Mailer
  > {
    const mailer = yield* Mailer;
    // The claim is what makes the email once per version, and it is taken
    // before the send so that a replay finds it taken. It is given back on
    // every way out that is not an email sent — a refused send, a defect, an
    // interruption, and an instance with no mail transport alike — because a
    // claim left standing after no email went out would mean the version is
    // never mailed at all, including after the operator configures SMTP.
    // Acquiring it inside `acquireUseRelease` is what keeps an interruption
    // from landing between the claim and the release that undoes it. The window
    // left open is the process being killed outright between the two; the
    // in-app notice is the durable channel for that.
    return yield* Effect.acquireUseRelease(
      claim(release.version),
      (taken): Effect.Effect<Delivery, MailFailed> =>
        taken !== null
          ? mailer
              .sendUpdateNotice({
                email: owner.email,
                name: owner.name,
                version: release.version,
                notesUrl: release.notesUrl,
                schemaChange: release.schemaChange,
                deploymentMode: options.deploymentMode,
              })
              .pipe(
                Effect.as<Delivery>('sent'),
                Effect.catchTag('MailNotConfigured', () =>
                  mentionMissingTransport(release.version).pipe(
                    Effect.as<Delivery>('not-sent'),
                  ),
                ),
              )
          : Effect.succeed<Delivery>('not-claimed'),
      (taken, exit) =>
        taken !== null && !(Exit.isSuccess(exit) && exit.value === 'sent')
          ? giveBack(release.version, taken).pipe(
              Effect.catchCause((cause) =>
                Effect.logWarning(
                  'the notification claim could not be released; this version may not be emailed',
                  cause,
                ).pipe(
                  Effect.annotateLogs({
                    queue: QUEUE,
                    version: release.version,
                  }),
                ),
              ),
            )
          : Effect.void,
    ).pipe(Effect.as(COMPLETED));
  });

  return Effect.fn('job.update-check')(function* (
    job: HandledJob<'update-check'>,
  ): Effect.fn.Return<
    JobOutcome,
    MailFailed | SqlError.SqlError,
    MaintenanceDatabase | Mailer | HttpClient.HttpClient
  > {
    const jobAnnotations = {
      queue: QUEUE,
      job_id: job.id,
      attempt: job.attempt,
    };
    // An unreachable or unreadable manifest is the ordinary state of an
    // instance behind a firewall that blocks the host, and of every instance
    // until the publisher exists. It is `suppressed`, not `uncertain` (which
    // asks a person to look) and not a failure (which would retry and then
    // dead-letter): nothing was left half done, and tomorrow's run is the retry.
    const manifest = yield* fetchManifest.pipe(
      Effect.map((read): ReleaseManifest | null => read),
      Effect.catch((error) =>
        Effect.logInfo(
          'the release manifest could not be read; trying again at the next scheduled run',
          Cause.fail(error),
        ).pipe(Effect.annotateLogs(jobAnnotations), Effect.as(null)),
      ),
    );
    if (manifest === null) return 'suppressed';

    const runningMigration =
      options.runningMigration === undefined
        ? yield* newestBundledMigration(jobAnnotations)
        : options.runningMigration;
    const release = asRelease(manifest, runningMigration);
    yield* record(release);
    if (!isNewer(release.version, runningVersion)) return 'completed';

    const owner = yield* readOwner();
    // Nobody owns the instance yet, so there is nobody to tell; nothing is
    // claimed, and the first run after setup completes will.
    if (owner === null) return 'completed';

    return yield* notifyOwner(owner, release);
  });
};
