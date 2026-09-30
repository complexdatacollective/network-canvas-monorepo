import { createHash, randomUUID } from 'node:crypto';

import { assert, describe, layer } from '@effect/vitest';
import { Context, Effect, Layer } from 'effect';

import {
  ownerRows,
  refusalOf,
  testDb,
} from '../../../__tests__/support/database.ts';
import { MaintenanceDatabase } from '../../../db/client.ts';
import { MaintenanceScope, Transaction } from '../../../db/tenant.ts';
import { collectLogs } from '../../../platform/__tests__/support/logs.ts';
import {
  asApp,
  asMaintenance,
  DeliveryHarness,
  drainWith,
  layerDeliveryHarness,
  layerJobs,
  onWorker,
  readJobs,
} from '../../__tests__/support.ts';
import { Jobs } from '../../jobs.ts';
import {
  type GcOptions,
  gcProtocolStore,
  PROTOCOL_STORE_GC_BOUNDS,
  protocolStoreGc,
} from '../protocol-store-gc.ts';

// The protocol store's sweep, and the only suite it has: this replaced both
// `src/protocol/gc.ts`'s own suite and the pg-boss-era
// `src/jobs/__tests__/protocol-store-gc.test.ts`, which went with the modules
// they tested. What is here is what the deployment's bounds are, that a role
// which could not see the tenants is refused rather than reported as a clean
// pass, that one job on the queue is one real sweep, and what the rewritten
// statements decide — the two windows, the lease, the referenced predicate and
// the marking.
//
// Four of the queue suite's cases are not here and none of them for a sweep
// reason: "registers the sweep once however many workers boot", "drops a
// schedule this build no longer declares" and "creates one job for a minute
// boundary across two workers" are the cron's, and `__tests__/cron.test.ts`
// holds them on this queue; "never runs a second sweep while one is running"
// is the singleton policy's, which `__tests__/queue.test.ts` holds.
//
// Every tenant table is FORCEd under row-level security, so the fixtures below
// seed through the maintenance client — the identity whose policy clause admits
// every team — rather than the connecting login, which the policy refuses like
// anyone else.

/**
 * `layerDeliveryHarness` is the general "Studio's schema and the queue's, side
 * by side" harness rather than anything about deliveries: the sweep needs
 * Studio's tables and the job needs the queue's.
 */
const suiteLayer = layerJobs.pipe(Layer.provideMerge(layerDeliveryHarness));

/** The one team whose section a published version pins; see `clearStore`. */
const PINNED_TEAM = 'gc-team-pinned';

/** And the one whose section a published template version pins. */
const TEMPLATE_PINNED_TEAM = 'gc-team-template-pinned';

const A_DAY_MS = 24 * 60 * 60 * 1000;

/** One raw statement inside the scope a helper below opened. */
const statement = <Row extends object>(
  text: string,
  values: ReadonlyArray<unknown> = [],
) => Effect.flatMap(Transaction, ({ sql }) => sql.unsafe<Row>(text, values));

/**
 * One maintenance transaction, for the two fixtures that need one: a version
 * and the sections it pins have to be written together, because
 * `version_sections_pins_are_frozen` (and its template twin) refuses a pin the
 * version's own transaction did not write — a pin added after publication
 * would change what the version assembles to while its frozen manifest stayed
 * unchanged.
 */
const inOneTransaction = <A, E, R>(body: Effect.Effect<A, E, R>) =>
  Effect.orDie(asMaintenance(MaintenanceScope.open(body)));

describe.skipIf(!testDb)('the protocol store sweep on the native queue', () => {
  layer(suiteLayer)('with Studio and the queue installed', (it) => {
    /** A statement on the identity the sweep itself runs as. */
    const query = Effect.fnUntraced(function* <Row extends object>(
      text: string,
      values: unknown[] = [],
    ) {
      return yield* Effect.orDie(
        asMaintenance(MaintenanceScope.open(statement<Row>(text, values))),
      );
    });

    /**
     * Everything a previous case seeded, so a count here is this case's. A
     * section a published version or a published template version pins cannot
     * be deleted — the pin's foreign key is the point of it — so those stay;
     * they are referenced forever, which is why they are collected by nothing
     * and counted nowhere.
     */
    const clearStore = Effect.gen(function* () {
      const { schema } = yield* DeliveryHarness;
      yield* Effect.orDie(ownerRows(`DELETE FROM ${schema}.jobs`));
      yield* query('DELETE FROM command_log');
      yield* query('DELETE FROM leases');
      yield* query('DELETE FROM manifests');
      yield* query('DELETE FROM drafts');
      yield* query(
        `DELETE FROM sections s
          WHERE NOT EXISTS (
            SELECT 1 FROM version_sections vs
             WHERE vs.team_id = s.team_id AND vs.section_hash = s.hash)
            AND NOT EXISTS (
            SELECT 1 FROM template_version_sections tvs
             WHERE tvs.team_id = s.team_id AND tvs.section_hash = s.hash)`,
      );
    });

    const seedSection = Effect.fnUntraced(function* (input: {
      teamId: string;
      unreferencedInterval?: string;
    }) {
      const hash = `gc-${randomUUID()}`;
      yield* query(
        `INSERT INTO sections (team_id, hash, doc, unreferenced_at)
         VALUES ($1, $2, '{}'::jsonb,
                 CASE WHEN $3::text IS NULL THEN NULL
                      ELSE clock_timestamp() - $3::interval END)`,
        [input.teamId, hash, input.unreferencedInterval ?? null],
      );
      return hash;
    });

    const seedDraft = Effect.fnUntraced(function* (
      teamId: string,
      headSeq: number,
    ) {
      const draftId = randomUUID();
      yield* query(
        `INSERT INTO drafts (id, team_id, head_seq, head_manifest_hash)
         VALUES ($1, $2, $3, 'head')`,
        [draftId, teamId, String(headSeq)],
      );
      return draftId;
    });

    const marked = Effect.fnUntraced(function* (hash: string) {
      const rows = yield* query<{ marked: boolean }>(
        `SELECT unreferenced_at IS NOT NULL AS marked
           FROM sections WHERE hash = $1`,
        [hash],
      );
      return rows[0]?.marked;
    });

    const sectionHashes = Effect.fnUntraced(function* (teamId: string) {
      const rows = yield* query<{ hash: string }>(
        'SELECT hash FROM sections WHERE team_id = $1',
        [teamId],
      );
      // Sorted here rather than by the database: `ORDER BY` on text is the
      // server's collation, which a developer's Postgres and CI's image need
      // not agree on.
      return rows.map((row) => row.hash).toSorted();
    });

    const sweep = (opts: GcOptions = PROTOCOL_STORE_GC_BOUNDS) =>
      asMaintenance(gcProtocolStore(opts));

    /**
     * What the sweep refused, as a string, so a case asserts on a value rather
     * than unwrapping a cause. A run that did not fail answers with what it
     * did instead, which is never what a case expects.
     */
    const refusal = (opts: GcOptions) =>
      asApp(gcProtocolStore(opts)).pipe(
        Effect.map(() => 'the sweep ran'),
        Effect.catchTag('GcBoundsError', (error) =>
          Effect.succeed(`bound: ${error.bound}`),
        ),
        Effect.catchTag('GcRoleError', (error) =>
          Effect.succeed(error.message),
        ),
        Effect.catch((error) => Effect.succeed(`unexpected: ${String(error)}`)),
      );

    // ------------------------------------------------------------ bounds ---
    it.effect(
      'sweeps to bounds no deployment can vary, one of them longer than a backup interval',
      () =>
        Effect.sync(() => {
          // The two windows are exercised below by rows that straddle them.
          // The manifest depth and the retry horizon are not — a thousand
          // manifests is too many to seed for what it would prove — so this is
          // where they are pinned, and the bounds are one object because the
          // cron addresses the sweep at nothing: there is no caller to pass a
          // different set.
          assert.deepStrictEqual(PROTOCOL_STORE_GC_BOUNDS, {
            retainManifestsPerDraft: 1000,
            sectionGraceMs: 259_200_000,
            commandRetryHorizonMs: 86_400_000,
          });

          // And the grace window said again as the arithmetic rather than as
          // the constant: it is three days because backups are daily (#1901),
          // so a change that shortened it would have to disagree with this
          // sentence as well as with the number above (#1909).
          assert.strictEqual(
            PROTOCOL_STORE_GC_BOUNDS.sectionGraceMs,
            72 * 60 * 60 * 1000,
          );
          assert.isAbove(PROTOCOL_STORE_GC_BOUNDS.sectionGraceMs, A_DAY_MS);
        }),
    );

    it.effect('refuses a bound that would widen deletion', () =>
      Effect.gen(function* () {
        // Checked on the application identity, so a bound that was checked
        // after the role would answer with the role and this case would pass
        // for the wrong reason.
        for (const [opts, expected] of [
          [{ sectionGraceMs: -1 }, 'bound: sectionGraceMs'],
          [{ sectionGraceMs: Number.NaN }, 'bound: sectionGraceMs'],
          [{ sectionGraceMs: 0 }, 'bound: sectionGraceMs'],
          [{ commandRetryHorizonMs: -1 }, 'bound: commandRetryHorizonMs'],
          [{ retainManifestsPerDraft: 0.5 }, 'bound: retainManifestsPerDraft'],
          [{ retainManifestsPerDraft: -1 }, 'bound: retainManifestsPerDraft'],
        ] as const) {
          assert.strictEqual(
            yield* refusal({ ...PROTOCOL_STORE_GC_BOUNDS, ...opts }),
            expected,
          );
        }
      }),
    );

    // -------------------------------------------------------------- role ---
    it.effect('refuses to sweep as anything but the maintenance role', () =>
      Effect.gen(function* () {
        yield* clearStore;
        const teamId = `gc-team-${randomUUID()}`;
        yield* seedSection({ teamId, unreferencedInterval: '96 hours' });

        // The application identity rather than the maintenance one, which is
        // the shape of a misconfigured worker: the sweep refuses it rather
        // than reporting a clean pass over the tenants it could not see.
        assert.match(
          yield* refusal(PROTOCOL_STORE_GC_BOUNDS),
          /must run as studio_maintenance/,
        );

        // There is no oracle here for "and it refused *before* it swept": with
        // the check deleted the sweep would run as the application role, whose
        // policies show it no tenant at all, so the row would survive either
        // way. What the fixture can show is that the refusal was not a pass
        // over an empty store — the same store, swept as maintenance, collects.
        assert.strictEqual((yield* sweep()).sectionsDeleted, 1);
        assert.deepStrictEqual(yield* sectionHashes(teamId), []);
      }),
    );

    it.effect('refuses a login that may not assume that role', () =>
      Effect.gen(function* () {
        // The other half of the misconfiguration, and the half the identity
        // check above cannot see: a maintenance `MaintenanceDatabase` whose login is not
        // a member of the role. `set local role` refuses it one statement
        // before the handler's own, and what this case pins is that the
        // refusal still arrives as the diagnosis rather than as a bare
        // `SqlError` about a statement no caller wrote.
        const { studioSchema } = yield* DeliveryHarness;
        const login = `gc_nomaint_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
        yield* Effect.orDie(
          ownerRows(`CREATE ROLE ${login} LOGIN PASSWORD 'gc'`),
        );
        const url = new URL(testDb!.url);
        url.username = login;
        url.password = 'gc';

        const refused = yield* Effect.scoped(
          Effect.gen(function* () {
            const context = yield* Effect.orDie(
              Layer.build(
                MaintenanceDatabase.layer({
                  url: url.href,
                  maxConnections: 1,
                  searchPath: studioSchema,
                }),
              ),
            );
            return yield* gcProtocolStore(PROTOCOL_STORE_GC_BOUNDS).pipe(
              Effect.map(() => 'the sweep ran'),
              Effect.catchTag('GcRoleError', (error) =>
                Effect.succeed(error.message),
              ),
              Effect.catch((error) =>
                Effect.succeed(`unexpected: ${String(error)}`),
              ),
              Effect.provideService(
                MaintenanceDatabase,
                Context.get(context, MaintenanceDatabase),
              ),
            );
          }),
        ).pipe(
          Effect.ensuring(
            Effect.orDie(ownerRows(`DROP ROLE IF EXISTS ${login}`)),
          ),
        );

        assert.match(refused, /must run as studio_maintenance/);
        // And it names the login that could not assume it, which is the whole
        // of the diagnosis: the role the connection actually has.
        assert.include(refused, `not ${login}`);
      }),
    );

    // ------------------------------------------------------------- queue ---
    it.effect('runs one real sweep for one job on the queue', () => {
      const logs = collectLogs();
      return Effect.gen(function* () {
        yield* clearStore;
        const teamId = `gc-team-${randomUUID()}`;
        // Collectable by the production bounds: unreferenced for longer than
        // the three-day grace, and referenced by no version, template or
        // manifest.
        yield* seedSection({ teamId, unreferencedInterval: '96 hours' });
        // Inside the grace, so a client still editing against it can commit —
        // and so a daily backup has certainly captured it.
        const recent = yield* seedSection({
          teamId,
          unreferencedInterval: '48 hours',
        });

        const jobs = yield* Jobs;
        const jobId = yield* asApp(
          MaintenanceScope.open(jobs.enqueue('protocol-store-gc', {})),
        );

        const step = yield* drainWith('protocol-store-gc', protocolStoreGc);

        assert.strictEqual(step._tag, 'settled');
        assert.strictEqual(
          step._tag === 'settled' ? step.outcome : undefined,
          'completed',
        );
        const [row] = yield* readJobs('protocol-store-gc');
        assert.strictEqual(row?.id, jobId);
        assert.strictEqual(row?.state, 'completed');

        // Not an empty pass: the older row is gone and the newer one is not,
        // because the sweep's three-day grace is what keeps it.
        assert.deepStrictEqual(yield* sectionHashes(teamId), [recent]);

        // And the line a deployment reads says so. The counts are the
        // handler's only product — the sweep's own return value goes nowhere
        // else — so a handler that logged zeros whatever it collected would
        // look exactly like a healthy one in the only place anybody looks.
        assert.deepStrictEqual(
          logs.messages.filter((message) =>
            message.startsWith(`protocol-store-gc ${jobId}:`),
          ),
          [
            `protocol-store-gc ${jobId}: manifests 0, sections 1, command log 0`,
          ],
        );
      }).pipe(Effect.provide(logs.layer));
    });

    it.effect('fails the job when the sweep cannot run', () =>
      Effect.gen(function* () {
        yield* clearStore;
        const jobs = yield* Jobs;
        yield* asApp(
          MaintenanceScope.open(jobs.enqueue('protocol-store-gc', {})),
        );

        const step = yield* onWorker((worker) =>
          Effect.gen(function* () {
            // The handler registered against the application identity — the
            // worker still claims and settles as maintenance — so what this
            // measures is the sweep's own refusal reaching the row.
            yield* Effect.flatMap(DeliveryHarness, (harness) =>
              Effect.provideService(
                worker.work('protocol-store-gc', protocolStoreGc),
                MaintenanceDatabase,
                harness.app,
              ),
            );
            return yield* worker.drainOnce('protocol-store-gc');
          }),
        );

        // The queue retries nothing, so the first attempt is the last one and
        // this line is the only notice a deployment gets that an hour was lost.
        assert.strictEqual(step._tag, 'failed');
        const [row] = yield* readJobs('protocol-store-gc');
        assert.strictEqual(row?.state, 'failed');
        assert.match(String(row?.last_error), /must run as studio_maintenance/);
      }),
    );

    // -------------------------------------------------- what it collects ---
    it.effect('marks a section nothing references, then deletes it', () =>
      Effect.gen(function* () {
        yield* clearStore;
        const teamId = `gc-team-${randomUUID()}`;
        const draftId = yield* seedDraft(teamId, 1);
        const held = yield* seedSection({ teamId });
        const holdIt = (seq: number) =>
          query(
            `INSERT INTO manifests (draft_id, team_id, seq, hash, section_hashes)
             VALUES ($1, $2, $3, $4, $5::jsonb)`,
            [
              draftId,
              teamId,
              String(seq),
              `m${seq}`,
              JSON.stringify({ settings: held }),
            ],
          );
        yield* holdIt(1);

        // Referenced by a draft manifest, so the marking pass leaves it be —
        // which is the arm of the referenced predicate that reads `manifests`,
        // and this is what fails when it goes. (There is no companion
        // `sectionsDeleted === 0` here: the section has never been marked, so
        // the grace window's `unreferenced_at < …` is NULL and no mutation of
        // the delete alone could collect it.)
        yield* sweep();
        assert.strictEqual(yield* marked(held), false);

        // The draft moves on and nothing holds the section any more.
        yield* query('DELETE FROM manifests WHERE draft_id = $1', [draftId]);
        // Marked, not deleted: the grace window starts here.
        assert.strictEqual((yield* sweep()).sectionsDeleted, 0);
        assert.strictEqual(yield* marked(held), true);

        // Re-adopting it clears the mark, which is what keeps a section a
        // client resumed on from being swept out from under it.
        yield* holdIt(2);
        yield* sweep();
        assert.strictEqual(yield* marked(held), false);

        // Unreferenced again, and this time older than the grace.
        yield* query('DELETE FROM manifests WHERE draft_id = $1', [draftId]);
        yield* query(
          `UPDATE sections SET unreferenced_at = clock_timestamp() - interval '96 hours'
            WHERE hash = $1`,
          [held],
        );
        assert.strictEqual((yield* sweep()).sectionsDeleted, 1);
        assert.deepStrictEqual(yield* sectionHashes(teamId), []);
      }),
    );

    it.effect('keeps a section a published version pins', () =>
      Effect.gen(function* () {
        yield* clearStore;
        const hash = yield* seedSection({
          teamId: PINNED_TEAM,
          unreferencedInterval: '96 hours',
        });
        yield* Effect.orDie(
          ownerRows(
            `INSERT INTO teams (id, name, slug) VALUES ($1, 'Pinned', $1)
             ON CONFLICT (id) DO NOTHING`,
            [PINNED_TEAM],
          ),
        );
        // One transaction, for the reason `inOneTransaction` records.
        const protocolId = randomUUID();
        const versionId = randomUUID();
        yield* inOneTransaction(
          Effect.gen(function* () {
            yield* statement(
              `INSERT INTO protocols (id, team_id, name)
               VALUES ($1, $2, 'Pinned')`,
              [protocolId, PINNED_TEAM],
            );
            yield* statement(
              `INSERT INTO protocol_versions
                 (id, protocol_id, team_id, version_number, version_hash,
                  manifest, schema_version, source_manifest_hash)
               VALUES ($1, $2, $3, 1, 'v1', '{}'::jsonb, 8, 'src')`,
              [versionId, protocolId, PINNED_TEAM],
            );
            yield* statement(
              `INSERT INTO version_sections
                 (version_id, team_id, section_id, section_hash)
               VALUES ($1, $2, 'settings', $3)`,
              [versionId, PINNED_TEAM, hash],
            );
          }),
        );

        // Marked unreferenced before the pin existed, and old enough to
        // collect. Two separate things keep it: the `version_sections` arm of
        // the referenced predicate, which excludes it from the delete — drop
        // that arm and the delete hits the pin's foreign key and aborts this
        // tenant's whole pass, on every pass thereafter — and the reconcile
        // pass, which clears the mark the section is no longer owed. The mark
        // below is the reconcile's oracle; the row below it is the predicate's.
        yield* sweep();
        assert.deepStrictEqual(yield* sectionHashes(PINNED_TEAM), [hash]);
        assert.strictEqual(yield* marked(hash), false);
      }),
    );

    it.effect('keeps a section held only by a published template version', () =>
      Effect.gen(function* () {
        // Ported from `src/protocol/__tests__/gc.test.ts`, which is the only
        // place this arm was ever exercised. A template version pins sections
        // exactly as a protocol version does and its pins are immutable too,
        // so a section no protocol references but a template does still counts
        // as referenced — and the handler's own comment says what losing that
        // costs: the delete hits the pin's foreign key and aborts the tenant's
        // whole pass, on every pass after, since the pin can never be retracted.
        yield* clearStore;
        const hash = yield* seedSection({
          teamId: TEMPLATE_PINNED_TEAM,
          unreferencedInterval: '96 hours',
        });
        // One transaction, for the same reason the protocol version's pin is.
        const templateId = randomUUID();
        const versionId = randomUUID();
        yield* inOneTransaction(
          Effect.gen(function* () {
            yield* statement(
              `INSERT INTO templates (id, team_id, kind, name)
               VALUES ($1, $2, 'protocol', 'Holds one section')`,
              [templateId, TEMPLATE_PINNED_TEAM],
            );
            yield* statement(
              `INSERT INTO template_versions
                 (id, team_id, template_id, version_number, manifest,
                  manifest_hash, schema_version)
               VALUES ($1, $2, $3, 1, $4, $5, 8)`,
              [
                versionId,
                TEMPLATE_PINNED_TEAM,
                templateId,
                JSON.stringify({ settings: hash }),
                createHash('sha256').update(hash).digest('hex'),
              ],
            );
            yield* statement(
              `INSERT INTO template_version_sections
                 (version_id, team_id, section_id, section_hash)
               VALUES ($1, $2, 'settings', $3)`,
              [versionId, TEMPLATE_PINNED_TEAM, hash],
            );
          }),
        );

        // Marked unreferenced before the template existed and older than the
        // grace, so nothing but the `template_version_sections` arm stands
        // between it and the delete: without that arm the reconcile leaves the
        // mark standing and the delete raises on the pin's foreign key.
        yield* sweep();
        assert.strictEqual(yield* marked(hash), false);
        assert.deepStrictEqual(yield* sectionHashes(TEMPLATE_PINNED_TEAM), [
          hash,
        ]);
      }),
    );

    it.effect('keeps what a live lease or the retry horizon still needs', () =>
      Effect.gen(function* () {
        yield* clearStore;
        const teamId = `gc-team-${randomUUID()}`;
        const draftId = yield* seedDraft(teamId, 5);
        for (const seq of [1, 2, 3, 4, 5]) {
          yield* query(
            `INSERT INTO manifests (draft_id, team_id, seq, hash, section_hashes)
             VALUES ($1, $2, $3, $4, '{}'::jsonb)`,
            [draftId, teamId, String(seq), `m${seq}`],
          );
        }
        const logRow = (
          sectionId: string,
          owner: string,
          epoch: number,
          manifestSeq: number,
          age: string,
        ) =>
          query(
            `INSERT INTO command_log
               (draft_id, team_id, section_id, owner, epoch, client_seq,
                commands, manifest_seq, created_at)
             VALUES ($1, $2, $3, $4, $5, 1, '[]'::jsonb, $6,
                     clock_timestamp() - $7::interval)`,
            [draftId, teamId, sectionId, owner, epoch, manifestSeq, age],
          );
        // Past the horizon with no lease behind it: collectable.
        yield* logRow('settings', 'stale', 1, 1, '48 hours');
        // Inside the horizon: a client whose acknowledgement was lost may
        // still retransmit this client_seq and must find its recorded result.
        yield* logRow('interfaces', 'recent', 2, 2, '1 minute');
        // Past the horizon, but its (owner, epoch) lease is live.
        yield* logRow('assets', 'leased', 3, 3, '48 hours');
        yield* query(
          `INSERT INTO leases (draft_id, team_id, section_id, owner, epoch, expires_at)
           VALUES ($1, $2, 'assets', 'leased', 3, clock_timestamp() + interval '1 hour')`,
          [draftId, teamId],
        );

        // `retainManifestsPerDraft: 0` puts the whole history below the head
        // in range, so what survives survives on the two windows alone.
        const swept = yield* sweep({
          ...PROTOCOL_STORE_GC_BOUNDS,
          retainManifestsPerDraft: 0,
        });
        assert.strictEqual(swept.commandLogDeleted, 1);
        // Manifest 1 lost the only log row naming it, in this same pass, and
        // went with it; manifest 4 never had one. Manifests 2 and 3 are held
        // by the log rows that survived, and 5 is the head.
        assert.strictEqual(swept.manifestsDeleted, 2);

        const owners = yield* query<{ owner: string }>(
          'SELECT owner FROM command_log WHERE draft_id = $1',
          [draftId],
        );
        assert.deepStrictEqual(owners.map((row) => row.owner).toSorted(), [
          'leased',
          'recent',
        ]);
        const seqs = yield* query<{ seq: string }>(
          'SELECT seq::text AS seq FROM manifests WHERE draft_id = $1',
          [draftId],
        );
        assert.deepStrictEqual(
          seqs.map((row) => Number(row.seq)).toSorted((a, b) => a - b),
          [2, 3, 5],
        );
      }),
    );

    it.effect(
      'the retained window keeps recent manifests and their sections',
      () =>
        Effect.gen(function* () {
          // The other case ported from `src/protocol/__tests__/gc.test.ts`.
          // Everywhere else the bound is either 0 — where the window is the head
          // alone — or the production 1000 against a handful of manifests, where
          // the cutoff is negative and nothing is eligible either way. Neither
          // shows the bound *retaining* anything, so neither notices if the
          // subtraction that computes the cutoff goes.
          yield* clearStore;
          const teamId = `gc-team-${randomUUID()}`;
          const draftId = yield* seedDraft(teamId, 5);
          // Held by the oldest manifest, which the window does not reach, and by
          // the newest one it does: two sections whose fate is decided by which
          // manifests survive.
          const dropped = yield* seedSection({ teamId });
          const kept = yield* seedSection({ teamId });
          const namedBy = new Map([
            [1, { settings: dropped }],
            [3, { settings: kept }],
          ]);
          for (const seq of [1, 2, 3, 4, 5]) {
            yield* query(
              `INSERT INTO manifests (draft_id, team_id, seq, hash, section_hashes)
             VALUES ($1, $2, $3, $4, $5::jsonb)`,
              [
                draftId,
                teamId,
                String(seq),
                `m${seq}`,
                JSON.stringify(namedBy.get(seq) ?? {}),
              ],
            );
          }

          // No command-log rows at all, so the only thing deciding a manifest's
          // fate is the retained window: head 5 less two is a cutoff of 3, and
          // `seq < 3` is manifests 1 and 2.
          const swept = yield* sweep({
            ...PROTOCOL_STORE_GC_BOUNDS,
            retainManifestsPerDraft: 2,
          });
          assert.strictEqual(swept.manifestsDeleted, 2);
          const seqs = yield* query<{ seq: string }>(
            'SELECT seq::text AS seq FROM manifests WHERE draft_id = $1',
            [draftId],
          );
          assert.deepStrictEqual(
            seqs.map((row) => Number(row.seq)).toSorted((a, b) => a - b),
            [3, 4, 5],
          );

          // And their sections with them: manifest 3 is inside the window, so
          // the section it names is still referenced and the marking pass leaves
          // it alone. A cutoff taken at the head instead would have deleted
          // manifest 3 in this same pass and marked this section in the next
          // statement.
          assert.strictEqual(yield* marked(kept), false);
          // The contrast, and the proof that the marking pass ran at all: the
          // section only manifest 1 named lost its last reference.
          assert.strictEqual(yield* marked(dropped), true);
        }),
    );

    it.effect('refuses an update to a stored section document', () =>
      Effect.gen(function* () {
        yield* clearStore;
        const hash = yield* seedSection({ teamId: `gc-team-${randomUUID()}` });

        // The premise the whole sweep rests on: a section is addressed by the
        // hash of its document, so deciding by hash that a document is no
        // longer referenced is only safe while the document behind a hash can
        // never change. `sections_immutable` (packages/studio-sync/src/schema.ts)
        // is what makes that true, and this is the only case that asks it to.
        // It is here rather than beside the sweep's own statements because the
        // suite that used to hold it was the Promise sweep's.
        const refused = yield* refusalOf(
          asMaintenance(
            MaintenanceScope.open(
              statement(
                // A different document, because the trigger's `WHEN` clause
                // fires on a changed `doc` — rewriting a row with what it
                // already holds changes nothing and is allowed.
                `UPDATE sections SET doc = '{"rewritten":true}'::jsonb WHERE hash = $1`,
                [hash],
              ),
            ),
          ),
        );
        assert.include(refused.message, 'section documents are immutable');
      }),
    );
  });
});
