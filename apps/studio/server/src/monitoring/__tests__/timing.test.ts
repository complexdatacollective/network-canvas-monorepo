import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTenantDb } from '@codaco/studio-sync/tenant';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
} from '../../__tests__/support/postgres.ts';
import {
  MAX_TIMING_INTERVAL_MS,
  openInterviewSession,
  SessionTimingError,
  writeInterviewTiming,
} from '../../study/session-timing.ts';
import {
  runMonitoringRollupOnce,
  runMonitoringStageRollupOnce,
} from '../recompute.ts';

const db = await reachableDb();

const TEAM = 'timing-team-a';
const OTHER_TEAM = 'timing-team-b';
const PROTOCOL_STAGES = [
  ['info-1', 'Information'],
  ['info-2', 'Information'],
  ['ego-1', 'Ego'],
  ['edge-1', 'Edge'],
] as const;

type Row = Record<string, unknown>;

describe.skipIf(!db)('Studio timing ingestion and rollups', () => {
  let pool: pg.Pool;
  let app: pg.Pool;
  let maintenance: pg.Pool;
  let dispose: () => Promise<void>;
  let protocolId: string;
  let versionId: string;
  let studyId: string;
  let waveId: string;
  let sessionId: string;
  let token: string;
  let writerId: string;
  let holderEpoch: number;

  const insert = (
    table: string,
    row: Row,
    target: pg.Pool | pg.PoolClient = pool,
  ) => {
    const columns = Object.keys(row);
    return target.query(
      `insert into ${table} (${columns.map((name) => `"${name}"`).join(', ')})
       values (${columns.map((_, index) => `$${index + 1}`).join(', ')})`,
      Object.values(row),
    );
  };

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    ({ pool, app, maintenance, dispose } = await createScratchSchema(db));
    await provisionScratchSchema(pool);
    await seedTeam(pool, TEAM);
    await seedTeam(pool, OTHER_TEAM);

    protocolId = randomUUID();
    versionId = randomUUID();
    studyId = randomUUID();
    waveId = randomUUID();
    sessionId = randomUUID();
    const linkId = randomUUID();
    const secret = `secret-${randomBytes(12).toString('base64url')}`;
    token = `${TEAM}.${secret}`;
    writerId = randomUUID();

    await insert('protocols', {
      id: protocolId,
      team_id: TEAM,
      name: 'timing protocol',
    });
    const protocolClient = await pool.connect();
    try {
      await protocolClient.query('begin');
      await insert(
        'protocol_versions',
        {
          id: versionId,
          protocol_id: protocolId,
          team_id: TEAM,
          version_number: 1,
          version_hash: 'timing-version-hash',
          manifest: JSON.stringify({ name: 'timing protocol' }),
          schema_version: 8,
          source_manifest_hash: 'timing-source-hash',
        },
        protocolClient,
      );
      await insert(
        'sections',
        {
          team_id: TEAM,
          hash: 'timing-stage-order-hash',
          doc: JSON.stringify({ stages: PROTOCOL_STAGES.map(([id]) => id) }),
        },
        protocolClient,
      );
      await insert(
        'version_sections',
        {
          version_id: versionId,
          team_id: TEAM,
          section_id: 'stageOrder',
          section_hash: 'timing-stage-order-hash',
        },
        protocolClient,
      );
      for (const [id, type] of PROTOCOL_STAGES) {
        await insert(
          'sections',
          {
            team_id: TEAM,
            hash: `timing-${id}-hash`,
            doc: JSON.stringify({ id, type }),
          },
          protocolClient,
        );
        await insert(
          'version_sections',
          {
            version_id: versionId,
            team_id: TEAM,
            section_id: `stage:${id}`,
            section_hash: `timing-${id}-hash`,
          },
          protocolClient,
        );
      }
      await protocolClient.query('commit');
    } catch (error) {
      await protocolClient.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      protocolClient.release();
    }
    await insert('studies', {
      id: studyId,
      team_id: TEAM,
      name: 'timing study',
      participation_mode: 'anonymous',
      protocol_id: protocolId,
    });
    await insert('study_waves', {
      id: waveId,
      study_id: studyId,
      team_id: TEAM,
      wave_number: 1,
      protocol_version_id: versionId,
    });
    await insert('interview_links', {
      id: linkId,
      study_id: studyId,
      team_id: TEAM,
      wave_id: waveId,
      kind: 'anonymous',
      token_hash: createHash('sha256').update(secret).digest(),
    });
    await insert('interview_sessions', {
      id: sessionId,
      study_id: studyId,
      team_id: TEAM,
      wave_id: waveId,
      protocol_version_id: versionId,
      link_id: linkId,
      ego_uid: `ego-${sessionId.slice(0, 8)}`,
    });

    const missingTimingSession = randomUUID();
    await insert('interview_sessions', {
      id: missingTimingSession,
      study_id: studyId,
      team_id: TEAM,
      wave_id: waveId,
      protocol_version_id: versionId,
      ego_uid: `ego-${missingTimingSession.slice(0, 8)}`,
    });
    await insert('nodes', {
      team_id: TEAM,
      session_id: missingTimingSession,
      node_id: 'missing-timing-node',
      type: 'person',
      stage_id: 'info-1',
    });
  });

  afterAll(async () => {
    await dispose();
  });

  it('authenticates, fences, and persists a timing snapshot under tenant RLS', async () => {
    const opened = await openInterviewSession(app, {
      sessionId,
      accessToken: token,
      writerId,
    });
    holderEpoch = opened.holderEpoch;
    expect(opened.syncRevision).toBe(0);

    const stageTiming = {
      stageExits: [
        {
          stageIndex: 0,
          stageType: 'Information',
          promptIndex: 0,
          promptCount: 1,
          durationMs: 125,
          exitDirection: 'forward' as const,
        },
        {
          stageIndex: 1,
          stageType: 'Information',
          promptIndex: 0,
          promptCount: 1,
          durationMs: 275,
          exitDirection: 'forward' as const,
        },
        {
          stageIndex: 2,
          stageType: 'Ego',
          promptIndex: 0,
          promptCount: 2,
          durationMs: 950,
          exitDirection: 'forward' as const,
        },
        {
          stageIndex: 3,
          stageType: 'Edge',
          promptIndex: 1,
          promptCount: 2,
          durationMs: 35,
          exitDirection: 'abandoned' as const,
        },
      ],
      promptExits: [],
      totalDurationMs: 1385,
    };
    await expect(
      writeInterviewTiming(app, {
        sessionId,
        accessToken: token,
        writerId,
        holderEpoch,
        syncRevision: 1,
        stageTiming,
        currentStageIndex: 3,
        currentStageId: 'edge-1',
      }),
    ).resolves.toEqual({ kind: 'applied', applied: true, syncRevision: 1 });

    const stored = await pool.query<{
      sync_revision: number;
      stage_timing: unknown;
      current_stage_id: string;
    }>(
      `select sync_revision, stage_timing, current_stage_id
         from interview_sessions where id = $1`,
      [sessionId],
    );
    expect(stored.rows[0]).toMatchObject({
      sync_revision: 1,
      stage_timing: {
        ...stageTiming,
        stageExits: stageTiming.stageExits.map((exit) => ({
          ...exit,
          stageId: PROTOCOL_STAGES[exit.stageIndex]![0],
        })),
      },
      current_stage_id: 'edge-1',
    });
    await expect(
      writeInterviewTiming(app, {
        sessionId,
        accessToken: token,
        writerId,
        holderEpoch,
        syncRevision: 1,
        stageTiming,
      }),
    ).resolves.toEqual({ kind: 'stale', applied: false, syncRevision: 1 });
    await expect(
      openInterviewSession(app, {
        sessionId,
        accessToken: token,
        writerId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'HOLDER_CONFLICT' });
    await expect(
      writeInterviewTiming(app, {
        sessionId,
        accessToken: `${OTHER_TEAM}.wrong-secret`,
        writerId,
        holderEpoch,
        syncRevision: 2,
        stageTiming,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('recomputes unequal stage durations, preserves missing timing, and leases stale work once', async () => {
    const before = await pool.query<{ stale_at: Date | null }>(
      `select stale_at from study_wave_rollups where wave_id = $1`,
      [waveId],
    );
    expect(before.rows[0]?.stale_at).not.toBeNull();

    await expect(runMonitoringRollupOnce(maintenance)).resolves.toEqual({
      claimed: 1,
    });
    await expect(runMonitoringRollupOnce(maintenance)).resolves.toEqual({
      claimed: 0,
    });

    const rows = await pool.query<{
      stage_id: string;
      entered_count: number;
      duration_ms_sum: string;
      duration_ms_count: number;
    }>(
      `select stage_id, entered_count, duration_ms_sum, duration_ms_count
         from study_stage_rollups where wave_id = $1 order by stage_id`,
      [waveId],
    );
    expect(rows.rows).toEqual([
      {
        stage_id: 'edge-1',
        entered_count: 1,
        duration_ms_sum: '35',
        duration_ms_count: 1,
      },
      {
        stage_id: 'ego-1',
        entered_count: 1,
        duration_ms_sum: '950',
        duration_ms_count: 1,
      },
      {
        // The second session produced a node but no timing payload. It counts
        // as observed for drop-off, without inventing any elapsed duration.
        stage_id: 'info-1',
        entered_count: 2,
        duration_ms_sum: '125',
        duration_ms_count: 1,
      },
      {
        stage_id: 'info-2',
        entered_count: 1,
        duration_ms_sum: '275',
        duration_ms_count: 1,
      },
    ]);
    await pool.query(
      `update study_stage_rollups set stale_at = clock_timestamp() where wave_id = $1 and stage_id = $2`,
      [waveId, 'info-1'],
    );
    await expect(runMonitoringStageRollupOnce(maintenance)).resolves.toEqual({
      claimed: 1,
    });
    await expect(runMonitoringStageRollupOnce(maintenance)).resolves.toEqual({
      claimed: 0,
    });
  });

  it('rejects implausible timing at the server boundary before writing', async () => {
    await expect(
      writeInterviewTiming(app, {
        sessionId,
        accessToken: token,
        writerId,
        holderEpoch,
        syncRevision: 2,
        stageTiming: {
          stageExits: [
            {
              stageIndex: 0,
              stageType: 'Information',
              promptIndex: 0,
              promptCount: 1,
              durationMs: MAX_TIMING_INTERVAL_MS + 1,
              exitDirection: 'forward',
            },
          ],
        },
      }),
    ).rejects.toBeInstanceOf(Error);

    const row = await pool.query<{ sync_revision: number }>(
      `select sync_revision from interview_sessions where id = $1`,
      [sessionId],
    );
    expect(row.rows[0]?.sync_revision).toBe(1);
    await expect(
      writeInterviewTiming(app, {
        sessionId,
        accessToken: token,
        writerId,
        holderEpoch,
        syncRevision: 2,
        stageTiming: {
          stageExits: [
            {
              stageIndex: 0,
              stageType: 'Information',
              promptIndex: 0,
              promptCount: 1,
              durationMs: 125,
              exitDirection: 'forward',
            },
          ],
          totalDurationMs: 124,
        },
      }),
    ).rejects.toThrow('totalDurationMs');
    await expect(
      writeInterviewTiming(app, {
        sessionId,
        accessToken: token,
        writerId,
        holderEpoch,
        syncRevision: 2,
        stageTiming: {
          stageExits: [
            {
              stageIndex: 0,
              stageType: 'InventedStage',
              promptIndex: 0,
              promptCount: 1,
              durationMs: 125,
              exitDirection: 'forward',
            },
          ],
        },
      }),
    ).rejects.toThrow('pinned protocol');
  });

  it('does not expose another tenant through the maintenance rollup path', async () => {
    const visibleToOther = await createTenantDb(app, OTHER_TEAM).query(
      `select wave_id from study_wave_rollups where wave_id = $1`,
      [waveId],
    );
    expect(visibleToOther.rows).toEqual([]);
    await expect(
      writeInterviewTiming(app, {
        sessionId,
        accessToken: `${OTHER_TEAM}.not-the-link`,
        writerId,
        holderEpoch,
        syncRevision: 2,
      }),
    ).rejects.toBeInstanceOf(SessionTimingError);
  });
});
