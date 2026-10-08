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
import { ObjectStore } from '../../../storage/object-store.ts';
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

const suiteLayer = Layer.merge(
  layerJobs,
  Layer.succeed(ObjectStore, ObjectStore.absent),
).pipe(Layer.provideMerge(layerDeliveryHarness));

const PINNED_TEAM = 'gc-team-pinned';

const TEMPLATE_PINNED_TEAM = 'gc-team-template-pinned';

const A_DAY_MS = 24 * 60 * 60 * 1000;

const statement = <Row extends object>(
  text: string,
  values: ReadonlyArray<unknown> = [],
) => Effect.flatMap(Transaction, ({ sql }) => sql.unsafe<Row>(text, values));

const inOneTransaction = <A, E, R>(body: Effect.Effect<A, E, R>) =>
  Effect.orDie(asMaintenance(MaintenanceScope.open(body)));

describe.skipIf(!testDb)('the protocol store sweep on the native queue', () => {
  layer(suiteLayer)('with Studio and the queue installed', (it) => {
    const query = Effect.fnUntraced(function* <Row extends object>(
      text: string,
      values: unknown[] = [],
    ) {
      return yield* Effect.orDie(
        asMaintenance(MaintenanceScope.open(statement<Row>(text, values))),
      );
    });

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
      return rows.map((row) => row.hash).toSorted();
    });

    const sweep = (opts: GcOptions = PROTOCOL_STORE_GC_BOUNDS) =>
      asMaintenance(gcProtocolStore(opts));

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

    it.effect(
      'sweeps to bounds no deployment can vary, one of them longer than a backup interval',
      () =>
        Effect.sync(() => {
          assert.deepStrictEqual(PROTOCOL_STORE_GC_BOUNDS, {
            retainManifestsPerDraft: 1000,
            sectionGraceMs: 259_200_000,
            commandRetryHorizonMs: 86_400_000,
          });

          assert.strictEqual(
            PROTOCOL_STORE_GC_BOUNDS.sectionGraceMs,
            72 * 60 * 60 * 1000,
          );
          assert.isAbove(PROTOCOL_STORE_GC_BOUNDS.sectionGraceMs, A_DAY_MS);
        }),
    );

    it.effect('refuses a bound that would widen deletion', () =>
      Effect.gen(function* () {
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

    it.effect('refuses to sweep as anything but the maintenance role', () =>
      Effect.gen(function* () {
        yield* clearStore;
        const teamId = `gc-team-${randomUUID()}`;
        yield* seedSection({ teamId, unreferencedInterval: '96 hours' });

        assert.match(
          yield* refusal(PROTOCOL_STORE_GC_BOUNDS),
          /must run as studio_maintenance/,
        );

        assert.strictEqual((yield* sweep()).sectionsDeleted, 1);
        assert.deepStrictEqual(yield* sectionHashes(teamId), []);
      }),
    );

    it.effect('refuses a login that may not assume that role', () =>
      Effect.gen(function* () {
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
        assert.include(refused, `not ${login}`);
      }),
    );

    it.effect('runs one real sweep for one job on the queue', () => {
      const logs = collectLogs();
      return Effect.gen(function* () {
        yield* clearStore;
        const teamId = `gc-team-${randomUUID()}`;
        yield* seedSection({ teamId, unreferencedInterval: '96 hours' });
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

        assert.deepStrictEqual(yield* sectionHashes(teamId), [recent]);

        assert.deepStrictEqual(
          logs.records
            .filter(({ message }) => message === 'protocol store swept')
            .map(({ annotations }) => annotations),
          [
            {
              queue: 'protocol-store-gc',
              job_id: jobId,
              manifests_deleted: 0,
              sections_deleted: 1,
              command_log_deleted: 0,
            },
          ],
        );
        // Its counts are the whole database's, which other suites share.
        assert.isTrue(
          logs.records.some(
            ({ message, annotations }) =>
              message === 'staged resources swept' &&
              annotations['job_id'] === jobId,
          ),
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

        assert.strictEqual(step._tag, 'failed');
        const [row] = yield* readJobs('protocol-store-gc');
        assert.strictEqual(row?.state, 'failed');
        assert.match(String(row?.last_error), /must run as studio_maintenance/);
      }),
    );

    it.effect(
      'collects staged resources when the sweep fails, then fails the job',
      () =>
        Effect.gen(function* () {
          yield* clearStore;
          const refusedTeam = `gc-team-${randomUUID()}`;
          yield* seedSection({ teamId: refusedTeam });
          const stagingTeam = `gc-team-${randomUUID()}`;
          const draftId = yield* seedDraft(stagingTeam, 0);
          const resourceId = randomUUID();
          yield* Effect.orDie(
            ownerRows(
              `INSERT INTO protocol_staged_resources
                 (team_id, draft_id, owner, edit_id, resource_id, request_id,
                  kind, descriptor, secret_ciphertext, secret_key_id,
                  created_at)
               VALUES ($1, $2, 'gone', 'edit', $3, $3, 'secret', '{}'::jsonb,
                       '\\x00'::bytea, 'key', clock_timestamp() - interval '1 hour')`,
              [stagingTeam, draftId, resourceId],
            ),
          );

          const name = `refuse_gc_${randomUUID().replaceAll('-', '')}`;
          yield* Effect.orDie(
            ownerRows(`
              CREATE FUNCTION ${name}() RETURNS trigger AS $$
              BEGIN
                RAISE EXCEPTION 'section sweep refused';
              END;
              $$ LANGUAGE plpgsql`),
          );
          yield* Effect.orDie(
            ownerRows(`
              CREATE TRIGGER ${name}
                BEFORE UPDATE ON sections
                FOR EACH ROW
                WHEN (OLD.team_id = '${refusedTeam}')
                EXECUTE FUNCTION ${name}()`),
          );

          const jobs = yield* Jobs;
          yield* asApp(
            MaintenanceScope.open(jobs.enqueue('protocol-store-gc', {})),
          );
          const step = yield* Effect.ensuring(
            drainWith('protocol-store-gc', protocolStoreGc),
            Effect.orDie(
              Effect.andThen(
                ownerRows(`DROP TRIGGER ${name} ON sections`),
                ownerRows(`DROP FUNCTION ${name}()`),
              ),
            ),
          );

          assert.strictEqual(step._tag, 'failed');
          const [row] = yield* readJobs('protocol-store-gc');
          assert.match(String(row?.last_error), /section sweep refused/);
          const staged = yield* Effect.orDie(
            ownerRows(
              'SELECT resource_id FROM protocol_staged_resources WHERE team_id = $1',
              [stagingTeam],
            ),
          );
          assert.deepStrictEqual(staged, []);
        }),
    );

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

        yield* sweep();
        assert.strictEqual(yield* marked(held), false);

        yield* query('DELETE FROM manifests WHERE draft_id = $1', [draftId]);
        assert.strictEqual((yield* sweep()).sectionsDeleted, 0);
        assert.strictEqual(yield* marked(held), true);

        yield* holdIt(2);
        yield* sweep();
        assert.strictEqual(yield* marked(held), false);

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

        yield* sweep();
        assert.deepStrictEqual(yield* sectionHashes(PINNED_TEAM), [hash]);
        assert.strictEqual(yield* marked(hash), false);
      }),
    );

    it.effect('keeps a section held only by a published template version', () =>
      Effect.gen(function* () {
        yield* clearStore;
        const hash = yield* seedSection({
          teamId: TEMPLATE_PINNED_TEAM,
          unreferencedInterval: '96 hours',
        });
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
        yield* logRow('settings', 'stale', 1, 1, '48 hours');
        yield* logRow('interfaces', 'recent', 2, 2, '1 minute');
        yield* logRow('assets', 'leased', 3, 3, '48 hours');
        yield* query(
          `INSERT INTO leases (draft_id, team_id, section_id, owner, epoch, expires_at)
           VALUES ($1, $2, 'assets', 'leased', 3, clock_timestamp() + interval '1 hour')`,
          [draftId, teamId],
        );

        const swept = yield* sweep({
          ...PROTOCOL_STORE_GC_BOUNDS,
          retainManifestsPerDraft: 0,
        });
        assert.strictEqual(swept.commandLogDeleted, 1);
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
          yield* clearStore;
          const teamId = `gc-team-${randomUUID()}`;
          const draftId = yield* seedDraft(teamId, 5);
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

          assert.strictEqual(yield* marked(kept), false);
          assert.strictEqual(yield* marked(dropped), true);
        }),
    );

    it.effect('refuses an update to a stored section document', () =>
      Effect.gen(function* () {
        yield* clearStore;
        const hash = yield* seedSection({ teamId: `gc-team-${randomUUID()}` });

        const refused = yield* refusalOf(
          asMaintenance(
            MaintenanceScope.open(
              statement(
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
