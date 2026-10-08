import { randomUUID } from 'node:crypto';

import { Effect } from 'effect';
import type pg from 'pg';
import { describe, expect, it } from 'vitest';

import {
  committedDocument,
  ownedScratchDatabaseForTest,
} from '../../__tests__/support/migrations.ts';
import { reachableDb } from '../../__tests__/support/postgres.ts';
import { OwnerDatabase } from '../client.ts';
import { migrateDatabaseEffect } from '../migrate.ts';
import {
  type MigrationsDocument,
  verifyMigrations,
} from '../migrations-document.ts';

// 0005_session_finish records where each completed interview ended. A session
// completed under an earlier release has no finish stage to record, so the
// upgrade keeps it as it was, and every completion after it must name one.

const db = await reachableDb();

const CASE_TIMEOUT_MS = 180_000;

const SESSION_FINISH = '0005_session_finish';

const migrate = (url: string, document: MigrationsDocument) =>
  Effect.runPromise(
    migrateDatabaseEffect(
      Effect.runSync(verifyMigrations(document, document.fingerprint)),
      { appliedBy: 'test' },
    ).pipe(
      Effect.provide(
        OwnerDatabase.layer({ url, applicationName: 'studio-migrate-test' }),
      ),
    ),
  );

/** The committed migrations up to, and not including, `version`. */
const before = (
  document: MigrationsDocument,
  version: string,
): MigrationsDocument => {
  const index = document.migrations.findIndex(
    (migration) => migration.version === version,
  );
  if (index < 1) throw new Error(`${version} is not a committed migration`);
  const migrations = document.migrations.slice(0, index);
  const fingerprint = migrations.at(-1)?.manifest.fingerprint;
  if (fingerprint === undefined) throw new Error('no earlier migration');
  return { fingerprint, migrations };
};

const SNAPSHOT_SQL = `INSERT INTO session_snapshots
    (session_id, team_id, study_id, protocol_version_id, schema_version,
     payload, payload_hash)
  SELECT s.id, s.team_id, s.study_id, s.protocol_version_id, v.schema_version,
         '{}'::jsonb, 'sha256:finalized'
  FROM interview_sessions s
  JOIN protocol_versions v
    ON v.id = s.protocol_version_id AND v.team_id = s.team_id
  WHERE s.id = $1`;

/** Runs `work` in one transaction, as the deferred completion check needs. */
const inTransaction = async (
  pool: pg.Pool,
  work: (client: pg.PoolClient) => Promise<void>,
) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await work(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/** A live study with one wave, and two in-progress sessions on it. */
const seedStudy = async (pool: pg.Pool) => {
  const teamId = `team-${randomUUID().slice(0, 8)}`;
  const protocolId = randomUUID();
  const versionId = randomUUID();
  const studyId = randomUUID();
  const waveId = randomUUID();
  const sessions = [randomUUID(), randomUUID()] as const;
  await pool.query('INSERT INTO teams (id, name, slug) VALUES ($1, $1, $1)', [
    teamId,
  ]);
  await pool.query(
    `INSERT INTO protocols (id, team_id, name) VALUES ($1, $2, 'A protocol')`,
    [protocolId, teamId],
  );
  await pool.query(
    `INSERT INTO protocol_versions
       (id, protocol_id, team_id, version_number, version_hash, manifest,
        schema_version, source_manifest_hash)
     VALUES ($1, $2, $3, 1, 'hash', '{"name":"A protocol"}', 9, 'source')`,
    [versionId, protocolId, teamId],
  );
  await pool.query(
    `INSERT INTO studies (id, team_id, name, protocol_id, state, went_live_at)
     VALUES ($1, $2, 'A study', $3, 'live', now())`,
    [studyId, teamId, protocolId],
  );
  await pool.query(
    `INSERT INTO study_waves
       (id, study_id, team_id, wave_number, protocol_version_id)
     VALUES ($1, $2, $3, 1, $4)`,
    [waveId, studyId, teamId, versionId],
  );
  for (const sessionId of sessions) {
    await pool.query(
      `INSERT INTO interview_sessions
         (id, study_id, team_id, wave_id, protocol_version_id, ego_uid)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [sessionId, studyId, teamId, waveId, versionId, `ego-${sessionId}`],
    );
  }
  return sessions;
};

describe.skipIf(!db)(SESSION_FINISH, () => {
  it(
    'keeps a session completed before it, and makes every later completion name its finish',
    async () => {
      if (!db) throw new Error('unreachable: probe guaranteed a database');
      const scratch = await ownedScratchDatabaseForTest(db);
      const committed = committedDocument();
      await migrate(scratch.db.url, before(committed, SESSION_FINISH));

      // The cluster's superuser, which row-level security does not bind.
      const [earlier, later] = await seedStudy(scratch.admin);
      await inTransaction(scratch.admin, async (client) => {
        await client.query(
          `UPDATE interview_sessions
           SET status = 'completed', completed_at = now() WHERE id = $1`,
          [earlier],
        );
        await client.query(SNAPSHOT_SQL, [earlier]);
      });

      expect(await migrate(scratch.db.url, committed)).toMatchObject({
        kind: 'applied',
        versions: expect.arrayContaining([SESSION_FINISH]),
      });

      expect(
        (
          await scratch.admin.query(
            `SELECT status, finish_stage_id, finish_outcome
             FROM interview_sessions WHERE id = $1`,
            [earlier],
          )
        ).rows,
      ).toEqual([
        { status: 'completed', finish_stage_id: null, finish_outcome: null },
      ]);

      await expect(
        inTransaction(scratch.admin, async (client) => {
          await client.query(
            `UPDATE interview_sessions
             SET status = 'completed', completed_at = now() WHERE id = $1`,
            [later],
          );
          await client.query(SNAPSHOT_SQL, [later]);
        }),
      ).rejects.toThrow(
        'a completed interview session must record its finish stage and outcome',
      );

      await inTransaction(scratch.admin, async (client) => {
        await client.query(
          `UPDATE interview_sessions
           SET status = 'completed', completed_at = now(),
               finish_stage_id = 'finish', finish_outcome = 'terminated'
           WHERE id = $1`,
          [later],
        );
        await client.query(SNAPSHOT_SQL, [later]);
      });
      expect(
        (
          await scratch.admin.query(
            `SELECT status, finish_stage_id, finish_outcome
             FROM interview_sessions WHERE id = $1`,
            [later],
          )
        ).rows,
      ).toEqual([
        {
          status: 'completed',
          finish_stage_id: 'finish',
          finish_outcome: 'terminated',
        },
      ]);
    },
    CASE_TIMEOUT_MS,
  );
});
