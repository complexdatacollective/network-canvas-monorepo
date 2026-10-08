import { assert, describe, layer } from '@effect/vitest';
import { Duration, Effect, Fiber, Layer, Redacted } from 'effect';
import { FetchHttpClient } from 'effect/http';

import { ownerRows, testDb } from '../../__tests__/support/database.ts';
import { MailFailed, Mailer } from '../../mail/mailer.ts';
import { collectLogs } from '../../platform/__tests__/support/logs.ts';
import { UPDATE_MANIFEST_URL } from '../../update/manifest.ts';
import {
  type HttpReply,
  layerRecordingHttp,
  layerRecordingMailer,
  RecordedHttp,
  RecordedMail,
} from '../handlers/__tests__/support.ts';
import { updateCheck } from '../handlers/update-check.ts';
import {
  awaitTrue,
  clearQueue,
  drainWith,
  enqueue,
  layerDeliveryHarness,
  layerJobs,
  readJobs,
} from './support.ts';

const RUNNING = '1.0.0';
const NEWER = '1.1.0';

/** The running build's newest migration, and one a later release added. */
const RUNNING_MIGRATION = '0001_initial';
const LATER_MIGRATION = '0002_add_widgets';

const manifestOf = (version: string, migration = RUNNING_MIGRATION) => ({
  version,
  date: '2026-10-06T14:30:00Z',
  notes: `https://releases.networkcanvas.com/studio/${version}/notes`,
  migration,
});

const reply = (version: string, migration = RUNNING_MIGRATION): HttpReply => ({
  kind: 'json',
  body: manifestOf(version, migration),
});

const OWNER_ID = 'update-check-owner';

const CHECK = updateCheck({
  deploymentMode: 'self-hosted',
  runningVersion: RUNNING,
  runningMigration: RUNNING_MIGRATION,
});

const suiteLayer = Layer.mergeAll(
  layerJobs,
  layerRecordingMailer,
  layerRecordingHttp(reply(NEWER)),
).pipe(Layer.provideMerge(layerDeliveryHarness));

type StateRow = {
  latest_version: string | null;
  latest_released_at: Date | null;
  latest_notes_url: string | null;
  latest_schema_change: boolean | null;
  checked_at: Date | null;
  notified_version: string | null;
};

const stored = Effect.map(
  ownerRows<StateRow>(
    `SELECT latest_version, latest_released_at, latest_notes_url,
            latest_schema_change, checked_at, notified_version
       FROM deployment_state`,
  ),
  (rows) => rows[0],
);

const notifiedVersion = Effect.map(stored, (row) => row?.notified_version);

describe.skipIf(!testDb)('the update check', () => {
  // Real clock: the interruption case polls for the handler to reach the send.
  layer(suiteLayer, { excludeTestServices: true })(
    'over Studio and the queue',
    (it) => {
      const reset = (options: { owner: boolean } = { owner: true }) =>
        Effect.gen(function* () {
          yield* clearQueue;
          yield* ownerRows(
            `UPDATE deployment_state
              SET latest_version = NULL, latest_released_at = NULL,
                  latest_notes_url = NULL, latest_schema_change = NULL,
                  checked_at = NULL, notified_version = NULL`,
          );
          yield* ownerRows('DELETE FROM installation');
          yield* ownerRows('DELETE FROM "user" WHERE id = $1', [OWNER_ID]);
          if (options.owner) {
            yield* ownerRows(
              `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
             VALUES ($1, 'Ada Owner', 'owner@example.test', true, now(), now())`,
              [OWNER_ID],
            );
            yield* ownerRows(
              'INSERT INTO installation (id, owner_user_id) VALUES (1, $1)',
              [OWNER_ID],
            );
          }
          const mail = yield* RecordedMail;
          yield* mail.clear;
          yield* mail.setUpdateNoticeBehaviour(() => Effect.void);
          const http = yield* RecordedHttp;
          http.requests.length = 0;
          yield* http.reply(reply(NEWER));
        });

      const run = Effect.flatMap(enqueue('update-check', {}), () =>
        drainWith('update-check', CHECK),
      );

      const outcomeOf = (step: { readonly _tag: string; outcome?: string }) =>
        step._tag === 'settled' ? step.outcome : step._tag;

      it.effect(
        'makes one request to one host carrying nothing but an Accept header',
        () =>
          Effect.gen(function* () {
            yield* reset();
            yield* run;

            const http = yield* RecordedHttp;
            assert.strictEqual(http.requests.length, 1);
            const [request] = http.requests;
            assert.strictEqual(request?.url, UPDATE_MANIFEST_URL);
            assert.strictEqual(
              new URL(request?.url ?? '').host,
              'releases.networkcanvas.com',
            );
            assert.strictEqual(request?.method, 'GET');
            assert.isFalse(request?.hasBody);
            // The exact set, so a `traceparent`, `b3`, cookie or identifying
            // header added later by anyone fails here rather than shipping.
            assert.deepStrictEqual(request?.headers, {
              accept: 'application/json',
            });
          }),
      );

      it.effect(
        'hands fetch the one URL, refusing a redirect to a second host',
        () =>
          Effect.gen(function* () {
            yield* reset();
            const calls: { url: string; init: RequestInit | undefined }[] = [];
            const recording: typeof globalThis.fetch = (input, init) => {
              calls.push({
                url: String(input instanceof Request ? input.url : input),
                init,
              });
              return Promise.resolve(
                new Response(JSON.stringify(manifestOf(NEWER)), {
                  headers: { 'content-type': 'application/json' },
                }),
              );
            };

            yield* Effect.flatMap(enqueue('update-check', {}), () =>
              drainWith('update-check', CHECK),
            ).pipe(
              Effect.provide(FetchHttpClient.layer),
              Effect.provideService(FetchHttpClient.Fetch, recording),
            );

            assert.strictEqual(calls.length, 1);
            assert.strictEqual(calls[0]?.url, UPDATE_MANIFEST_URL);
            assert.strictEqual(calls[0]?.init?.method, 'GET');
            assert.strictEqual(calls[0]?.init?.redirect, 'error');
            assert.isUndefined(calls[0]?.init?.body);
            const names = Object.keys(
              (calls[0]?.init?.headers as Record<string, string>) ?? {},
            ).toSorted();
            assert.deepStrictEqual(names, ['accept']);
          }),
      );

      it.effect(
        'settles suppressed, recording nothing and sending nothing, when the manifest is unreachable',
        () => {
          const logs = collectLogs();
          return Effect.gen(function* () {
            yield* reset();
            const http = yield* RecordedHttp;
            yield* http.reply({ kind: 'unreachable' });

            const step = yield* run;
            assert.strictEqual(outcomeOf(step), 'suppressed');
            // One request, no retry: the next daily run is the retry.
            assert.strictEqual(http.requests.length, 1);

            const row = yield* stored;
            assert.isNull(row?.latest_version);
            assert.isNull(row?.checked_at);
            assert.deepStrictEqual((yield* RecordedMail).updateNotices, []);
            const [job] = yield* readJobs('update-check');
            assert.strictEqual(job?.state, 'completed');
            assert.strictEqual(job?.outcome, 'suppressed');

            const lines = logs.messages.filter((line) =>
              line.includes('could not be read'),
            );
            assert.strictEqual(lines.length, 1);
          }).pipe(Effect.provide(logs.layer));
        },
        { timeout: 30_000 },
      );

      it.effect.each([
        ['a body that is not the manifest', { kind: 'json', body: { a: 1 } }],
        [
          'a body that is not JSON',
          { kind: 'text', body: '<html>nope</html>' },
        ],
        [
          'a notes link that is not https',
          {
            kind: 'json',
            body: { ...manifestOf(NEWER), notes: 'http://example.test/notes' },
          },
        ],
        [
          'a version that is not x.y.z',
          {
            kind: 'json',
            body: { ...manifestOf(NEWER), version: 'v1.1.0' },
          },
        ],
        [
          'a date that is not a real UTC datetime',
          {
            kind: 'json',
            body: { ...manifestOf(NEWER), date: '2026-02-31T00:00:00Z' },
          },
        ],
        [
          'a missing migration',
          {
            kind: 'json',
            body: { ...manifestOf(NEWER), migration: undefined },
          },
        ],
        [
          'a migration that is not NNNN_slug',
          {
            kind: 'json',
            body: { ...manifestOf(NEWER), migration: '2_add_widgets' },
          },
        ],
        ['a 404', { kind: 'text', body: 'not found', status: 404 }],
      ] as const satisfies readonly (readonly [string, HttpReply])[])(
        'settles suppressed on %s, one request and nothing recorded',
        ([, response]) =>
          Effect.gen(function* () {
            yield* reset();
            const http = yield* RecordedHttp;
            yield* http.reply(response);

            assert.strictEqual(outcomeOf(yield* run), 'suppressed');
            assert.strictEqual(http.requests.length, 1);
            assert.isNull((yield* stored)?.latest_version);
            assert.deepStrictEqual((yield* RecordedMail).updateNotices, []);
          }),
      );

      it.effect(
        'records the release and sends nothing for the running version',
        () =>
          Effect.gen(function* () {
            yield* reset();
            const http = yield* RecordedHttp;
            yield* http.reply(reply(RUNNING, LATER_MIGRATION));

            assert.strictEqual(outcomeOf(yield* run), 'completed');

            const row = yield* stored;
            assert.strictEqual(row?.latest_version, RUNNING);
            assert.strictEqual(
              row?.latest_notes_url,
              manifestOf(RUNNING).notes,
            );
            assert.strictEqual(row?.latest_schema_change, true);
            assert.strictEqual(
              row?.latest_released_at?.toISOString(),
              '2026-10-06T14:30:00.000Z',
            );
            assert.instanceOf(row?.checked_at, Date);
            assert.isNull(row?.notified_version);
            assert.deepStrictEqual((yield* RecordedMail).updateNotices, []);
          }),
      );

      it.effect(
        'sends the owner one email for a new version and none on a replay',
        () =>
          Effect.gen(function* () {
            yield* reset();
            const mail = yield* RecordedMail;

            assert.strictEqual(outcomeOf(yield* run), 'completed');
            assert.deepStrictEqual(
              mail.updateNotices.map((notice) => ({
                ...notice,
                email: Redacted.value(notice.email),
                name: Redacted.value(notice.name),
              })),
              [
                {
                  email: 'owner@example.test',
                  name: 'Ada Owner',
                  version: NEWER,
                  notesUrl: manifestOf(NEWER).notes,
                  schemaChange: false,
                  deploymentMode: 'self-hosted',
                },
              ],
            );
            assert.strictEqual(yield* notifiedVersion, NEWER);

            // The same job again, as a replay after a crash or a re-enqueue.
            assert.strictEqual(outcomeOf(yield* run), 'completed');
            assert.strictEqual(mail.updateNotices.length, 1);

            // A later release is a new notification.
            const http = yield* RecordedHttp;
            yield* http.reply(reply('1.2.0', LATER_MIGRATION));
            assert.strictEqual(outcomeOf(yield* run), 'completed');
            assert.deepStrictEqual(
              mail.updateNotices.map((notice) => notice.version),
              [NEWER, '1.2.0'],
            );
          }),
      );

      it.effect(
        'decides whether the upgrade changes the database against the running build, so a skipped release’s migration counts',
        () =>
          Effect.gen(function* () {
            // Running 1.0 (newest 0001_initial); 1.1 added 0002_add_widgets;
            // the newest, 1.2, is code-only. Upgrading 1.0 to 1.2 still
            // applies 1.1's migration.
            yield* reset();
            const http = yield* RecordedHttp;
            const mail = yield* RecordedMail;
            yield* http.reply(reply('1.2.0', LATER_MIGRATION));

            assert.strictEqual(outcomeOf(yield* run), 'completed');
            assert.strictEqual((yield* stored)?.latest_schema_change, true);
            assert.deepStrictEqual(
              mail.updateNotices.map((notice) => notice.schemaChange),
              [true],
            );

            // A release whose newest migration is the running build's.
            yield* reset();
            yield* http.reply(reply('1.2.0', RUNNING_MIGRATION));

            assert.strictEqual(outcomeOf(yield* run), 'completed');
            assert.strictEqual((yield* stored)?.latest_schema_change, false);
            assert.deepStrictEqual(
              mail.updateNotices.map((notice) => notice.schemaChange),
              [false],
            );
          }),
      );

      it.effect(
        'reports a schema change when the running build’s migrations cannot be read',
        () =>
          Effect.gen(function* () {
            yield* reset();
            const http = yield* RecordedHttp;
            yield* http.reply(reply(NEWER, RUNNING_MIGRATION));

            assert.strictEqual(
              outcomeOf(
                yield* Effect.flatMap(enqueue('update-check', {}), () =>
                  drainWith(
                    'update-check',
                    updateCheck({
                      deploymentMode: 'self-hosted',
                      runningVersion: RUNNING,
                      runningMigration: null,
                    }),
                  ),
                ),
              ),
              'completed',
            );
            assert.strictEqual((yield* stored)?.latest_schema_change, true);
          }),
      );

      it.effect(
        'records the release and claims nothing while nobody owns the instance',
        () =>
          Effect.gen(function* () {
            yield* reset({ owner: false });

            assert.strictEqual(outcomeOf(yield* run), 'completed');

            const row = yield* stored;
            assert.strictEqual(row?.latest_version, NEWER);
            assert.isNull(row?.notified_version);
            assert.deepStrictEqual((yield* RecordedMail).updateNotices, []);
          }),
      );

      it.effect(
        'still records the release on an instance with no mail transport, leaves nothing claimed, and says so once per version',
        () => {
          const logs = collectLogs();
          return Effect.gen(function* () {
            yield* reset();

            const refused = Effect.flatMap(enqueue('update-check', {}), () =>
              drainWith('update-check', CHECK),
            ).pipe(Effect.provide(Mailer.layerRefuse));
            assert.strictEqual(outcomeOf(yield* refused), 'completed');
            assert.isNull(
              yield* notifiedVersion,
              'no email went out, so no claim may stand',
            );
            assert.strictEqual(outcomeOf(yield* refused), 'completed');
            assert.isNull(yield* notifiedVersion);

            const row = yield* stored;
            assert.strictEqual(row?.latest_version, NEWER);
            assert.instanceOf(row?.checked_at, Date);
            assert.deepStrictEqual((yield* RecordedMail).updateNotices, []);

            const mentioning = (version: string) =>
              logs.records.filter(
                ({ message, annotations }) =>
                  message.includes('no mail transport is configured') &&
                  annotations['version'] === version,
              );
            assert.strictEqual(
              mentioning(NEWER).length,
              1,
              'two runs for one version must say it once, not twice',
            );

            // A later version is news again.
            const http = yield* RecordedHttp;
            yield* http.reply(reply('1.2.0'));
            assert.strictEqual(outcomeOf(yield* refused), 'completed');
            assert.strictEqual(mentioning('1.2.0').length, 1);
            assert.strictEqual(mentioning(NEWER).length, 1);
          }).pipe(Effect.provide(logs.layer));
        },
      );

      it.effect(
        'emails the owner once, at the first run after mail is configured, for a version first seen without it',
        () =>
          Effect.gen(function* () {
            yield* reset();
            const mail = yield* RecordedMail;

            // First seen on an instance with no mail transport.
            const withoutMail = Effect.flatMap(
              enqueue('update-check', {}),
              () => drainWith('update-check', CHECK),
            ).pipe(Effect.provide(Mailer.layerRefuse));
            assert.strictEqual(outcomeOf(yield* withoutMail), 'completed');
            assert.deepStrictEqual(mail.updateNotices, []);

            // The operator configures SMTP: the next daily run, same version.
            assert.strictEqual(outcomeOf(yield* run), 'completed');
            assert.deepStrictEqual(
              mail.updateNotices.map((notice) => [
                Redacted.value(notice.email),
                notice.version,
              ]),
              [['owner@example.test', NEWER]],
            );
            assert.strictEqual(yield* notifiedVersion, NEWER);

            // And only once: the run after that finds it claimed.
            assert.strictEqual(outcomeOf(yield* run), 'completed');
            assert.strictEqual(mail.updateNotices.length, 1);
          }),
      );

      it.effect(
        'gives the claim back when the send fails, so a later run sends',
        () =>
          Effect.gen(function* () {
            yield* reset();
            const mail = yield* RecordedMail;
            yield* mail.setUpdateNoticeBehaviour((_input, call) =>
              call === 1
                ? Effect.fail(new MailFailed({ cause: new Error('refused') }))
                : Effect.void,
            );

            const first = yield* run;
            assert.strictEqual(first._tag, 'retrying');
            assert.isNull(yield* notifiedVersion);
            assert.strictEqual(mail.updateNotices.length, 1);

            // The queue's own retry is a later run of the same job; this queue
            // declares no retry delay, so it is due at once.
            const [pending] = yield* readJobs('update-check');
            assert.strictEqual(pending?.state, 'created');
            assert.strictEqual(pending?.attempts, 1);
            yield* drainWith('update-check', CHECK);

            assert.strictEqual(mail.updateNotices.length, 2);
            assert.strictEqual(yield* notifiedVersion, NEWER);
          }),
      );

      it.effect(
        'gives the claim back when a send is interrupted halfway',
        () =>
          Effect.gen(function* () {
            yield* reset();
            const mail = yield* RecordedMail;
            yield* mail.setUpdateNoticeBehaviour(() => Effect.never);

            const running = yield* Effect.forkChild(run);
            const reachedSend = yield* awaitTrue(
              Effect.sync(() => mail.updateNotices.length === 1),
              Duration.seconds(10),
            );
            assert.isTrue(
              reachedSend._tag === 'Some',
              'the handler never reached the send',
            );
            // Mid-send the version is claimed: this is what makes the oracle
            // below mean something.
            assert.strictEqual(yield* notifiedVersion, NEWER);

            yield* Fiber.interrupt(running);

            assert.isNull(yield* notifiedVersion);

            yield* mail.setUpdateNoticeBehaviour(() => Effect.void);
            yield* clearQueue;
            yield* run;
            assert.strictEqual(mail.updateNotices.length, 2);
            assert.strictEqual(yield* notifiedVersion, NEWER);
          }),
        { timeout: 30_000 },
      );
    },
  );
});
