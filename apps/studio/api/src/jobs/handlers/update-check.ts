import { eq } from 'drizzle-orm';
import { Cause, Duration, Effect, Exit, Schedule } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientResponse } from 'effect/http';
import type { SqlError } from 'effect/sql';

import type { DeploymentMode } from '@codaco/studio-contract/surfaces';

import { AUTH_TABLES } from '../../db/auth-schema.ts';
import type { MaintenanceDatabase } from '../../db/client.ts';
import {
  claimNotification,
  type LatestRelease,
  recordUpdateCheck,
  releaseNotificationClaim,
} from '../../db/deployment-state.ts';
import { sqlErrorsOnly } from '../../db/errors.ts';
import { MaintenanceScope, Transaction } from '../../db/tenant.ts';
import { type MailFailed, Mailer } from '../../mail/mailer.ts';
import { SETUP_TABLES } from '../../setup/schema.ts';
import {
  isNewer,
  ReleaseManifest,
  UPDATE_MANIFEST_URL,
} from '../../update/manifest.ts';
import { STUDIO_VERSION } from '../../version.ts';
import { causeError, deepestMessage } from '../errors.ts';
import type { HandledJob, JobOutcome } from '../worker.ts';

// The daily check for a newer Studio release (#1901). It reads one fixed
// manifest, records what it says, and — when the release is newer than the one
// running — emails the installation's owner once per version. It is registered
// whether or not the instance can send mail, because the in-app notice reads
// the row this writes and needs no transport.

const QUEUE = 'update-check';

const COMPLETED: JobOutcome = 'completed';

/**
 * The whole fetch, retries included. The queue's `expireInSeconds` is declared
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
};

type Owner = { readonly email: string; readonly name: string };

/**
 * One GET of one fixed URL, carrying nothing about the instance: the only
 * header is `Accept`, there is no query, no body and no cookie.
 *
 * Trace propagation is switched off for the request. Effect's client adds
 * `traceparent` and `b3` to every request by default, and with telemetry on
 * that trace id would correlate this request with the instance's exported
 * traces. Redirects are refused rather than followed, because a redirect would
 * be a second host.
 */
const fetchManifest = Effect.gen(function* () {
  const client = (yield* HttpClient.HttpClient).pipe(
    HttpClient.filterStatusOk,
    HttpClient.retryTransient({
      schedule: Schedule.exponential('500 millis'),
      times: 2,
    }),
  );
  const response = yield* client.get(UPDATE_MANIFEST_URL, {
    headers: { accept: 'application/json' },
  });
  return yield* HttpClientResponse.schemaBodyJson(ReleaseManifest)(response);
}).pipe(
  Effect.timeout(MANIFEST_FETCH_BOUND),
  Effect.provideService(HttpClient.TracerPropagationEnabled, false),
  Effect.provideService(FetchHttpClient.RequestInit, { redirect: 'error' }),
);

const asRelease = (manifest: ReleaseManifest): LatestRelease => ({
  version: manifest.version,
  releasedAt: new Date(manifest.date),
  notesUrl: manifest.notes,
  schemaChange: manifest.schemaChange,
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
  const owner: Owner | null = rows[0] ?? null;
  return owner;
});

const record = (release: LatestRelease) =>
  inMaintenance(recordUpdateCheck(release));

const claim = (version: string) => inMaintenance(claimNotification(version));

const giveBack = (version: string) =>
  inMaintenance(releaseNotificationClaim(version));

export const updateCheck = (options: UpdateCheckOptions) => {
  const runningVersion = options.runningVersion ?? STUDIO_VERSION;

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
    // every way out that is not a success — a refused send, a defect, and an
    // interruption alike — because a claim left standing after no email went
    // out would mean the version is never mailed at all. Acquiring it inside
    // `acquireUseRelease` is what keeps an interruption from landing between
    // the claim and the release that undoes it. The window left open is the
    // process being killed outright between the two; the in-app notice is the
    // durable channel for that.
    return yield* Effect.acquireUseRelease(
      claim(release.version),
      (claimed) =>
        claimed
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
                Effect.catchTag('MailNotConfigured', () =>
                  // The claim stays, which is what makes this one line per
                  // version rather than one per day.
                  Effect.logInfo(
                    `${QUEUE}: Studio ${release.version} is available, but no mail transport is configured, so the owner was not emailed. The in-app notice still shows it.`,
                  ),
                ),
                Effect.as(COMPLETED),
              )
          : Effect.succeed(COMPLETED),
      (claimed, exit) =>
        claimed && !Exit.isSuccess(exit)
          ? giveBack(release.version).pipe(
              Effect.catchCause((cause) =>
                Effect.logWarning(
                  `${QUEUE}: the notification claim for ${release.version} could not be released; this version may not be emailed.`,
                ).pipe(
                  Effect.annotateLogs({
                    cause:
                      deepestMessage(causeError(cause)) ?? Cause.pretty(cause),
                  }),
                ),
              ),
            )
          : Effect.void,
    );
  });

  return Effect.fn('job.update-check')(function* (
    job: HandledJob<'update-check'>,
  ): Effect.fn.Return<
    JobOutcome,
    MailFailed | SqlError.SqlError,
    MaintenanceDatabase | Mailer | HttpClient.HttpClient
  > {
    const label = `${QUEUE} ${job.id} attempt ${job.attempt}`;
    // An unreachable or unreadable manifest is the ordinary state of an
    // instance behind a firewall that blocks the host, and of every instance
    // until the publisher exists. It is `suppressed`, not `uncertain` (which
    // asks a person to look) and not a failure (which would retry and then
    // dead-letter): nothing was left half done, and tomorrow's run is the retry.
    const manifest = yield* fetchManifest.pipe(
      Effect.map((read): ReleaseManifest | null => read),
      Effect.catch((error) =>
        Effect.logInfo(
          `${label}: the release manifest could not be read (${deepestMessage(error) ?? String(error)}); trying again at the next scheduled run.`,
        ).pipe(Effect.as(null)),
      ),
    );
    if (manifest === null) return 'suppressed';

    const release = asRelease(manifest);
    yield* record(release);
    if (!isNewer(release.version, runningVersion)) return 'completed';

    const owner = yield* readOwner();
    // Nobody owns the instance yet, so there is nobody to tell; nothing is
    // claimed, and the first run after setup completes will.
    if (owner === null) return 'completed';

    return yield* notifyOwner(owner, release);
  });
};
