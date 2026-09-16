import { randomUUID } from 'node:crypto';

import { assert, describe, layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';

import { reachableDb } from '../../../../__tests__/support/postgres.ts';
import {
  asApp,
  asMaintenance,
  DeliveryHarness,
  layerDeliveryHarness,
  layerWorker,
  readJobs,
} from '../../__tests__/support.ts';
import { Database, withTransaction } from '../../database.ts';
import { Jobs } from '../../jobs.ts';
import { JobWorker } from '../../worker.ts';
import {
  type GcOptions,
  gcProtocolStore,
  PROTOCOL_STORE_GC_BOUNDS,
  protocolStoreGc,
} from '../protocol-store-gc.ts';

// The protocol store's sweep, ported from `src/protocol/gc.ts` and driven the
// way `src/jobs/__tests__/protocol-store-gc.test.ts` drives it: what the
// deployment's bounds are, that a role which could not see the tenants is
// refused rather than reported as a clean pass, and that one job on the queue
// is one real sweep.
//
// Four of that file's cases are not here and none of them for a sweep reason:
// "registers the sweep once however many workers boot", "drops a schedule this
// build no longer declares" and "creates one job for a minute boundary across
// two workers" are the cron's, and `__tests__/cron.test.ts` holds them on this
// queue; "never runs a second sweep while one is running" is the singleton
// policy's, which `__tests__/queue.test.ts` holds.
//
// Beyond that port, the cases below cover what the rewritten statements decide
// — the two windows, the lease, the referenced predicate and the marking — for
// which the Promise sweep's own suite (`src/protocol/__tests__/gc.test.ts`,
// untouched) is no longer evidence: not one line of that SQL is shared.
//
// Every tenant table is FORCEd under row-level security, so the fixtures below
// seed through the maintenance pool — the identity whose policy clause admits
// every team — rather than the connecting login, which the policy refuses like
// anyone else.

const db = await reachableDb();

/**
 * `layerDeliveryHarness` is the general "Studio's schema and the queue's, side
 * by side" harness rather than anything about deliveries: the sweep needs
 * Studio's tables and the job needs the queue's.
 */
const suiteLayer = Layer.unwrap(
  Effect.map(DeliveryHarness, (harness) =>
    Jobs.layer({ schema: harness.schema }),
  ),
).pipe(Layer.provideMerge(layerDeliveryHarness(db!)));

/** The one team whose section stays pinned; see `clearStore`. */
const PINNED_TEAM = 'gc-team-pinned';

const A_DAY_MS = 24 * 60 * 60 * 1000;

describe.skipIf(!db)('the protocol store sweep on the native queue', () => {
  layer(suiteLayer)('with Studio and the queue installed', (it) => {
    /** A statement on the identity the sweep itself runs as. */
    const query = Effect.fnUntraced(function* <Row extends object>(
      text: string,
      values: unknown[] = [],
    ) {
      const { scratch } = yield* DeliveryHarness;
      return yield* Effect.promise(async () => {
        const { rows } = await scratch.maintenance.query<Row>(text, values);
        return rows;
      });
    });

    /**
     * Everything a previous case seeded, so a count here is this case's. A
     * section a published version pins cannot be deleted — the pin's foreign
     * key is the point of it — so those stay; they are referenced forever,
     * which is why they are collected by nothing and counted nowhere.
     */
    const clearStore = Effect.gen(function* () {
      const { scratch, schema } = yield* DeliveryHarness;
      yield* Effect.promise(async () => {
        await scratch.pool.query(`DELETE FROM ${schema}.jobs`);
      });
      yield* query('DELETE FROM command_log');
      yield* query('DELETE FROM leases');
      yield* query('DELETE FROM manifests');
      yield* query('DELETE FROM drafts');
      yield* query(
        `DELETE FROM sections s
          WHERE NOT EXISTS (
            SELECT 1 FROM version_sections vs
             WHERE vs.team_id = s.team_id AND vs.section_hash = s.hash)`,
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
    it.effect('sweeps to bounds no deployment can vary', () =>
      Effect.sync(() => {
        // The two windows are exercised below by rows that straddle them. The
        // manifest depth and the retry horizon are not — a thousand manifests
        // is too many to seed for what it would prove — so this is where they
        // are pinned, and the bounds are one object because the cron addresses
        // the sweep at nothing: there is no caller to pass a different set.
        assert.deepStrictEqual(PROTOCOL_STORE_GC_BOUNDS, {
          retainManifestsPerDraft: 1000,
          sectionGraceMs: 259_200_000,
          commandRetryHorizonMs: 86_400_000,
        });
      }),
    );

    it.effect('keeps a section for longer than a backup interval', () =>
      Effect.sync(() => {
        // Written as the arithmetic rather than as the constant: the number
        // above is three days because backups are daily (#1901), so a change
        // that shortened it would have to disagree with this sentence to pass
        // (#1909).
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
        const collectable = yield* seedSection({
          teamId,
          unreferencedInterval: '96 hours',
        });

        // The application identity rather than the maintenance one, which is
        // the shape of a misconfigured worker: the sweep refuses it rather
        // than reporting a clean pass over the tenants it could not see.
        assert.match(
          yield* refusal(PROTOCOL_STORE_GC_BOUNDS),
          /must run as studio_maintenance/,
        );
        // And it refused before it swept: the row it could not have seen is
        // still there.
        assert.deepStrictEqual(yield* sectionHashes(teamId), [collectable]);
      }),
    );

    // ------------------------------------------------------------- queue ---
    it.effect('runs one real sweep for one job on the queue', () =>
      Effect.gen(function* () {
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
          withTransaction(jobs.enqueue('protocol-store-gc', {})),
        );

        const step = yield* Effect.gen(function* () {
          const worker = yield* JobWorker;
          yield* worker.work('protocol-store-gc', protocolStoreGc);
          return yield* worker.drainOnce('protocol-store-gc');
        }).pipe(Effect.provide(layerWorker()));

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
      }),
    );

    it.effect('fails the job when the sweep cannot run', () =>
      Effect.gen(function* () {
        yield* clearStore;
        const jobs = yield* Jobs;
        yield* asApp(withTransaction(jobs.enqueue('protocol-store-gc', {})));

        const step = yield* Effect.gen(function* () {
          const worker = yield* JobWorker;
          // The handler registered against the application identity — the
          // worker still claims and settles as maintenance — so what this
          // measures is the sweep's own refusal reaching the row.
          yield* Effect.flatMap(DeliveryHarness, (harness) =>
            Effect.provideService(
              worker.work('protocol-store-gc', protocolStoreGc),
              Database,
              harness.app,
            ),
          );
          return yield* worker.drainOnce('protocol-store-gc');
        }).pipe(Effect.provide(layerWorker()));

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

        // Referenced by a draft manifest, so the marking pass leaves it be.
        assert.strictEqual((yield* sweep()).sectionsDeleted, 0);
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
        const { scratch } = yield* DeliveryHarness;
        const hash = yield* seedSection({
          teamId: PINNED_TEAM,
          unreferencedInterval: '96 hours',
        });
        yield* Effect.promise(() =>
          scratch.pool.query(
            `INSERT INTO teams (id, name, slug) VALUES ($1, 'Pinned', $1)
             ON CONFLICT (id) DO NOTHING`,
            [PINNED_TEAM],
          ),
        );
        // The pin has to be inserted in the same transaction as the version it
        // belongs to: `version_sections_pins_are_frozen` refuses a later one,
        // because a pin added after publication would change what the version
        // assembles to while its frozen manifest stayed unchanged.
        yield* Effect.promise(async () => {
          const client = await scratch.maintenance.connect();
          try {
            const protocolId = randomUUID();
            const versionId = randomUUID();
            await client.query('BEGIN');
            await client.query(
              `INSERT INTO protocols (id, team_id, name)
               VALUES ($1, $2, 'Pinned')`,
              [protocolId, PINNED_TEAM],
            );
            await client.query(
              `INSERT INTO protocol_versions
                 (id, protocol_id, team_id, version_number, version_hash,
                  manifest, schema_version, source_manifest_hash)
               VALUES ($1, $2, $3, 1, 'v1', '{}'::jsonb, 8, 'src')`,
              [versionId, protocolId, PINNED_TEAM],
            );
            await client.query(
              `INSERT INTO version_sections
                 (version_id, team_id, section_id, section_hash)
               VALUES ($1, $2, 'settings', $3)`,
              [versionId, PINNED_TEAM, hash],
            );
            await client.query('COMMIT');
          } catch (error) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw error;
          } finally {
            client.release();
          }
        });

        // Marked unreferenced before the pin existed, and old enough to
        // collect: the reconcile pass is what clears the mark, and without it
        // the delete would hit the pin's foreign key and abort this tenant's
        // whole pass — on every pass thereafter.
        assert.strictEqual((yield* sweep()).sectionsDeleted, 0);
        assert.deepStrictEqual(yield* sectionHashes(PINNED_TEAM), [hash]);
        assert.strictEqual(yield* marked(hash), false);
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
  });
});
