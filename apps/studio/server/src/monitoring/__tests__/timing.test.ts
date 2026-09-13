import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { Hono } from 'hono';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTenantDb } from '@codaco/studio-sync/tenant';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
} from '../../__tests__/support/postgres.ts';
import { seedMonitoringRollups } from '../../db/seed/monitoring.ts';
import {
  createSessionTimingOpenRoute,
  createSessionTimingRoute,
} from '../../study/session-timing-route.ts';
import {
  MAX_TIMING_INTERVAL_MS,
  openInterviewSession,
  releaseInterviewSession,
  SessionTimingError,
  writeInterviewTiming,
} from '../../study/session-timing.ts';
import { runMonitoringRollupOnce } from '../recompute.ts';

const db = await reachableDb();

const TEAM = `timing.team.with.dots.${'a'.repeat(130)}`;
const OTHER_TEAM = 'timing-team-b';
const PROTOCOL_STAGES = [
  ['info-1', 'Information'],
  ['info.2:section', 'Information'],
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
  let linkId: string;
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

  const waitForBlockedApplication = async (name: string): Promise<void> => {
    for (let attempt = 0; attempt < 1_000; attempt += 1) {
      const result = await pool.query<{ blocked: number }>(
        `select count(*)::int as blocked from pg_stat_activity
          where pid <> pg_backend_pid() and wait_event_type = 'Lock'
            and application_name = $1`,
        [name],
      );
      if ((result.rows[0]?.blocked ?? 0) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error(`application did not reach the expected lock: ${name}`);
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
    linkId = randomUUID();
    const secret = randomBytes(32).toString('base64url');
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
    holderEpoch = (
      await openInterviewSession(app, {
        sessionId,
        accessToken: token,
        writerId,
      })
    ).holderEpoch;

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
    expect(TEAM.length).toBeGreaterThan(128);
    expect(TEAM.length).toBeLessThanOrEqual(255);

    const route = new Hono();
    route.post('/interview/:sessionId/open', createSessionTimingOpenRoute(app));
    route.post('/interview/:sessionId/sync', createSessionTimingRoute(app));
    const response = await route.request(`/interview/${sessionId}/open`, {
      method: 'POST',
      headers: {
        'authorization': `bEaReR ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ writerId }),
    });
    expect(response.status).toBe(200);
    const opened = (await response.json()) as {
      holderEpoch: number;
      syncRevision: number;
    };
    holderEpoch = opened.holderEpoch;
    expect(opened.syncRevision).toBe(0);

    const malformed = await route.request('/interview/not-a-uuid/open', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ writerId }),
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: 'Invalid timing payload' });

    const stageTiming = {
      stageExits: [
        {
          stageIndex: 0,
          stageType: 'Information',
          promptIndex: 0,
          promptCount: 1,
          durationMs: 125.5,
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
      totalDurationMs: 1385.5,
    };
    const synced = await route.request(`/interview/${sessionId}/sync`, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        writerId,
        holderEpoch,
        syncRevision: 1,
        stageTiming,
        currentStageIndex: 1,
        currentStageId: 'info.2:section',
      }),
    });
    expect(synced.status).toBe(200);
    expect(await synced.json()).toMatchObject({ applied: true });

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
        totalDurationMs: 1386,
        stageExits: stageTiming.stageExits.map((exit) => ({
          ...exit,
          durationMs: Math.round(exit.durationMs),
          stageId: PROTOCOL_STAGES[exit.stageIndex]![0],
        })),
      },
      current_stage_id: 'info.2:section',
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
        accessToken: `${OTHER_TEAM}.${'a'.repeat(43)}`,
        writerId,
        holderEpoch,
        syncRevision: 2,
        stageTiming,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('seeds completed and abandoned stages from their latest exits, with no inferred missing answers', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM study_stage_rollups');
      await client.query('DELETE FROM study_wave_rollups');
      await seedMonitoringRollups(client, TEAM, new Date());
      const rows = await client.query(
        `SELECT stage_id, completed_count, abandoned_count, missing_item_count FROM study_stage_rollups WHERE wave_id = $1 ORDER BY stage_id`,
        [waveId],
      );
      expect(rows.rows).toEqual([
        {
          stage_id: 'edge-1',
          completed_count: 0,
          abandoned_count: 1,
          missing_item_count: 0,
        },
        {
          stage_id: 'ego-1',
          completed_count: 1,
          abandoned_count: 0,
          missing_item_count: 0,
        },
        {
          stage_id: 'info-1',
          completed_count: 1,
          abandoned_count: 0,
          missing_item_count: 0,
        },
        {
          stage_id: 'info.2:section',
          completed_count: 1,
          abandoned_count: 0,
          missing_item_count: 0,
        },
      ]);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
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
      completed_count: number;
      abandoned_count: number;
      duration_ms_sum: string;
      duration_ms_count: number;
      missing_item_count: number;
    }>(
      `select stage_id, entered_count, completed_count, abandoned_count,
              duration_ms_sum, duration_ms_count, missing_item_count
         from study_stage_rollups where wave_id = $1 order by stage_id`,
      [waveId],
    );
    expect(rows.rows).toEqual([
      {
        stage_id: 'edge-1',
        entered_count: 1,
        completed_count: 0,
        abandoned_count: 1,
        duration_ms_sum: '35',
        duration_ms_count: 1,
        missing_item_count: 0,
      },
      {
        stage_id: 'ego-1',
        entered_count: 1,
        completed_count: 1,
        abandoned_count: 0,
        duration_ms_sum: '950',
        duration_ms_count: 1,
        missing_item_count: 0,
      },
      {
        // The second session produced a node but no timing payload. It counts
        // as observed for drop-off, without inventing any elapsed duration.
        stage_id: 'info-1',
        entered_count: 2,
        completed_count: 1,
        abandoned_count: 0,
        duration_ms_sum: '126',
        duration_ms_count: 1,
        missing_item_count: 0,
      },
      {
        stage_id: 'info.2:section',
        entered_count: 1,
        completed_count: 1,
        abandoned_count: 0,
        duration_ms_sum: '275',
        duration_ms_count: 1,
        missing_item_count: 0,
      },
    ]);
    await pool.query(
      `update study_stage_rollups
          set lease_owner = 'older-stage-worker',
              lease_expires_at = clock_timestamp() + interval '1 hour'
        where wave_id = $1 and stage_id = $2`,
      [waveId, 'info-1'],
    );
    await pool.query(
      `update study_wave_rollups
          set dirty_generation = dirty_generation + 1,
              stale_at = clock_timestamp()
        where wave_id = $1`,
      [waveId],
    );
    await expect(runMonitoringRollupOnce(maintenance)).resolves.toEqual({
      claimed: 1,
    });
    const siblingLease = await pool.query<{ lease_owner: string | null }>(
      `select lease_owner from study_stage_rollups
        where wave_id = $1 and stage_id = $2`,
      [waveId, 'info-1'],
    );
    expect(siblingLease.rows[0]?.lease_owner).toBe('older-stage-worker');
    await expect(runMonitoringRollupOnce(maintenance)).resolves.toEqual({
      claimed: 0,
    });
  });

  it('counts a session current stage before its first exit', async () => {
    const currentSession = randomUUID();
    await insert('interview_sessions', {
      id: currentSession,
      study_id: studyId,
      team_id: TEAM,
      wave_id: waveId,
      protocol_version_id: versionId,
      ego_uid: `ego-${currentSession.slice(0, 8)}`,
      current_stage_index: 3,
      current_stage_id: 'edge-1',
    });

    await runMonitoringRollupOnce(maintenance);

    const row = await pool.query<{ entered_count: number }>(
      `select entered_count from study_stage_rollups
        where wave_id = $1 and stage_id = 'edge-1'`,
      [waveId],
    );
    expect(row.rows[0]?.entered_count).toBe(2);
  });

  it('excludes synthetic completion while preserving an authored FinishSession stage', async () => {
    const finishProtocolId = randomUUID();
    const finishVersionId = randomUUID();
    const finishStudyId = randomUUID();
    const authoredWaveId = randomUUID();
    const syntheticWaveId = randomUUID();
    const leasedSyntheticWaveId = randomUUID();
    await insert('protocols', {
      id: finishProtocolId,
      team_id: TEAM,
      name: 'literal FinishSession protocol',
    });
    const client = await pool.connect();
    try {
      await client.query('begin');
      await insert(
        'protocol_versions',
        {
          id: finishVersionId,
          protocol_id: finishProtocolId,
          team_id: TEAM,
          version_number: 1,
          version_hash: 'literal-finish-version-hash',
          manifest: JSON.stringify({ name: 'literal FinishSession protocol' }),
          schema_version: 8,
          source_manifest_hash: 'literal-finish-source-hash',
        },
        client,
      );
      await insert(
        'sections',
        {
          team_id: TEAM,
          hash: 'literal-finish-stage-order-hash',
          doc: JSON.stringify({ stages: ['FinishSession'] }),
        },
        client,
      );
      await insert(
        'version_sections',
        {
          version_id: finishVersionId,
          team_id: TEAM,
          section_id: 'stageOrder',
          section_hash: 'literal-finish-stage-order-hash',
        },
        client,
      );
      await insert(
        'sections',
        {
          team_id: TEAM,
          hash: 'literal-finish-stage-hash',
          doc: JSON.stringify({ id: 'FinishSession', type: 'Information' }),
        },
        client,
      );
      await insert(
        'version_sections',
        {
          version_id: finishVersionId,
          team_id: TEAM,
          section_id: 'stage:FinishSession',
          section_hash: 'literal-finish-stage-hash',
        },
        client,
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    await insert('studies', {
      id: finishStudyId,
      team_id: TEAM,
      name: 'literal FinishSession study',
      participation_mode: 'anonymous',
      protocol_id: finishProtocolId,
    });
    for (const [targetWaveId, waveNumber] of [
      [authoredWaveId, 1],
      [syntheticWaveId, 2],
      [leasedSyntheticWaveId, 3],
    ] as const)
      await insert('study_waves', {
        id: targetWaveId,
        study_id: finishStudyId,
        team_id: TEAM,
        wave_number: waveNumber,
        protocol_version_id: finishVersionId,
      });
    for (const [targetWaveId, currentStageIndex] of [
      [authoredWaveId, 0],
      [authoredWaveId, 1],
      [syntheticWaveId, 1],
      [leasedSyntheticWaveId, 1],
    ] as const) {
      const targetSessionId = randomUUID();
      await insert('interview_sessions', {
        id: targetSessionId,
        study_id: finishStudyId,
        team_id: TEAM,
        wave_id: targetWaveId,
        protocol_version_id: finishVersionId,
        ego_uid: `ego-${targetSessionId.slice(0, 8)}`,
        current_stage_index: currentStageIndex,
        current_stage_id: 'FinishSession',
      });
    }
    await insert('study_stage_rollups', {
      team_id: TEAM,
      study_id: finishStudyId,
      wave_id: syntheticWaveId,
      stage_id: 'FinishSession',
      entered_count: 7,
    });
    await insert('study_stage_rollups', {
      team_id: TEAM,
      study_id: finishStudyId,
      wave_id: leasedSyntheticWaveId,
      stage_id: 'FinishSession',
      entered_count: 7,
      lease_owner: 'active-stage-reader',
      lease_expires_at: new Date(Date.now() + 60_000),
    });

    for (let attempt = 0; attempt < 20; attempt += 1) {
      await runMonitoringRollupOnce(maintenance);
      const complete = await pool.query<{ count: number }>(
        `select count(*)::int as count from study_wave_rollups
          where wave_id = any($1::uuid[]) and recomputed_at is not null
            and stale_at is null`,
        [[authoredWaveId, syntheticWaveId, leasedSyntheticWaveId]],
      );
      if (complete.rows[0]?.count === 3) break;
    }
    const authored = await pool.query<{
      entered_count: number;
    }>(
      `select entered_count from study_stage_rollups
        where wave_id = $1 and stage_id = 'FinishSession'`,
      [authoredWaveId],
    );
    expect(authored.rows).toEqual([{ entered_count: 1 }]);
    const expired = await pool.query(
      `select 1 from study_stage_rollups
        where wave_id = $1 and stage_id = 'FinishSession'`,
      [syntheticWaveId],
    );
    expect(expired.rows).toEqual([]);
    const leased = await pool.query<{
      entered_count: number;
      lease_owner: string;
    }>(
      `select entered_count, lease_owner from study_stage_rollups
        where wave_id = $1 and stage_id = 'FinishSession'`,
      [leasedSyntheticWaveId],
    );
    expect(leased.rows).toEqual([
      { entered_count: 0, lease_owner: 'active-stage-reader' },
    ]);
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

  it('resets retry state across at least ten successful dirty generations', async () => {
    for (let revision = 2; revision <= 11; revision += 1) {
      await writeInterviewTiming(app, {
        sessionId,
        accessToken: token,
        writerId,
        holderEpoch,
        syncRevision: revision,
        stageTiming: {
          stageExits: [
            {
              stageIndex: 0,
              stageType: 'Information',
              promptIndex: 0,
              promptCount: 1,
              durationMs: revision + 0.25,
              exitDirection: 'forward',
            },
          ],
          totalDurationMs: revision + 0.25,
        },
      });
      await expect(runMonitoringRollupOnce(maintenance)).resolves.toEqual({
        claimed: 1,
      });
      const state = await pool.query<{
        attempt_count: number;
        stale_at: Date | null;
        failed_at: Date | null;
      }>(
        `select attempt_count, stale_at, failed_at
           from study_wave_rollups where wave_id = $1`,
        [waveId],
      );
      expect(state.rows[0]).toEqual({
        attempt_count: 0,
        stale_at: null,
        failed_at: null,
      });
    }
  });

  it('preserves a source write queued while recomputation is finalizing', async () => {
    await writeInterviewTiming(app, {
      sessionId,
      accessToken: token,
      writerId,
      holderEpoch,
      syncRevision: 12,
    });
    let signalRecomputed: (() => void) | undefined;
    const recomputed = new Promise<void>((resolve) => {
      signalRecomputed = resolve;
    });
    let releaseRecompute: (() => void) | undefined;
    const mayCommit = new Promise<void>((resolve) => {
      releaseRecompute = resolve;
    });
    const worker = runMonitoringRollupOnce(maintenance, {
      afterRecompute: async () => {
        signalRecomputed?.();
        await mayCommit;
      },
    });
    await recomputed;
    await app.query(`set application_name = 'timing-source-write'`);
    const newerWrite = writeInterviewTiming(app, {
      sessionId,
      accessToken: token,
      writerId,
      holderEpoch,
      syncRevision: 13,
      stageTiming: {
        stageExits: [
          {
            stageIndex: 0,
            stageType: 'Information',
            promptIndex: 0,
            promptCount: 1,
            durationMs: 13.5,
            exitDirection: 'forward',
          },
        ],
        totalDurationMs: 13.5,
      },
    });
    try {
      await newerWrite;
    } finally {
      releaseRecompute?.();
    }
    await Promise.all([worker, newerWrite]);
    const state = await pool.query<{
      stale_at: Date | null;
      pending_invalidations: number;
    }>(
      `select r.stale_at,
              (select count(*)::int from monitoring_rollup_invalidations i
                where i.wave_id = r.wave_id) as pending_invalidations
         from study_wave_rollups r where r.wave_id = $1`,
      [waveId],
    );
    expect(state.rows[0]).toEqual({
      stale_at: null,
      pending_invalidations: expect.any(Number),
    });
    expect(state.rows[0]!.pending_invalidations).toBeGreaterThan(0);

    const claims = await Promise.all([
      runMonitoringRollupOnce(maintenance),
      runMonitoringRollupOnce(maintenance),
    ]);
    expect(claims.reduce((sum, result) => sum + result.claimed, 0)).toBe(1);
  });

  it('does not claim future backoff and lets a new generation recover a terminal failure', async () => {
    const brokenTiming = JSON.stringify({
      stageExits: [
        {
          stageId: 'info-1',
          durationMs: 'not-a-number',
          exitDirection: 'forward',
        },
      ],
    });
    await pool.query(
      `update interview_sessions set stage_timing = $2::jsonb where id = $1`,
      [sessionId, brokenTiming],
    );
    await pool.query(
      `update study_wave_rollups
          set dirty_generation = dirty_generation + 1,
              stale_at = clock_timestamp(), attempt_count = 0,
              failed_at = null, last_error = null
        where wave_id = $1`,
      [waveId],
    );
    await expect(
      runMonitoringRollupOnce(maintenance, {
        maxAttempts: 2,
        retryBaseMs: 60_000,
      }),
    ).resolves.toEqual({ claimed: 1 });
    await expect(
      runMonitoringRollupOnce(maintenance, {
        maxAttempts: 2,
        retryBaseMs: 60_000,
      }),
    ).resolves.toEqual({ claimed: 0 });

    await pool.query(
      `update study_wave_rollups
          set stale_at = clock_timestamp(), attempt_count = 1,
              lease_owner = null, lease_expires_at = null
        where wave_id = $1`,
      [waveId],
    );
    await expect(
      runMonitoringRollupOnce(maintenance, { maxAttempts: 1 }),
    ).resolves.toEqual({ claimed: 0 });
    const failed = await pool.query<{ failed_at: Date | null }>(
      `select failed_at from study_wave_rollups where wave_id = $1`,
      [waveId],
    );
    expect(failed.rows[0]?.failed_at).not.toBeNull();

    await writeInterviewTiming(app, {
      sessionId,
      accessToken: token,
      writerId,
      holderEpoch,
      syncRevision: 14,
      stageTiming: {
        stageExits: [
          {
            stageIndex: 0,
            stageType: 'Information',
            promptIndex: 0,
            promptCount: 1,
            durationMs: 14,
            exitDirection: 'forward',
          },
        ],
        totalDurationMs: 14,
      },
    });
    await expect(runMonitoringRollupOnce(maintenance)).resolves.toEqual({
      claimed: 1,
    });
  });

  it('renews the wave lease while recomputation is paused before publishing', async () => {
    await pool.query(
      `update study_wave_rollups set stale_at = clock_timestamp(), attempt_count = 0, failed_at = null where wave_id = $1`,
      [waveId],
    );
    let renewed = 0;
    await runMonitoringRollupOnce(maintenance, {
      leaseMs: 6000,
      observer: (event) => {
        if (event.kind === 'heartbeat' && event.outcome === 'renewed')
          renewed += 1;
      },
      afterRecompute: async () => {
        await expect.poll(() => renewed, { timeout: 5000 }).toBeGreaterThan(0);
      },
    });
    expect(renewed).toBeGreaterThan(0);
    expect(
      (
        await pool.query(
          'SELECT stale_at FROM study_wave_rollups WHERE wave_id = $1',
          [waveId],
        )
      ).rows[0],
    ).toEqual({ stale_at: null });
  });

  it('refuses completion after lease expiry and leaves the generation reclaimable', async () => {
    await writeInterviewTiming(app, {
      sessionId,
      accessToken: token,
      writerId,
      holderEpoch,
      syncRevision: 15,
    });
    await expect(
      runMonitoringRollupOnce(maintenance, {
        leaseMs: 1,
        afterRecompute: async () => {
          await pool.query(`select pg_sleep(0.02)`);
        },
      }),
    ).resolves.toEqual({ claimed: 1 });
    const expired = await pool.query<{ stale_at: Date | null }>(
      `select stale_at from study_wave_rollups where wave_id = $1`,
      [waveId],
    );
    expect(expired.rows[0]?.stale_at).not.toBeNull();
    await expect(runMonitoringRollupOnce(maintenance)).resolves.toEqual({
      claimed: 1,
    });
  });

  it('supports explicit takeover and bounded holder release', async () => {
    const replacementWriter = randomUUID();
    const taken = await openInterviewSession(app, {
      sessionId,
      accessToken: token,
      writerId: replacementWriter,
      takeover: true,
    });
    expect(taken.holderEpoch).toBeGreaterThan(holderEpoch);
    await expect(
      writeInterviewTiming(app, {
        sessionId,
        accessToken: token,
        writerId,
        holderEpoch,
        syncRevision: 16,
      }),
    ).rejects.toMatchObject({ code: 'HOLDER_CONFLICT' });
    await expect(
      releaseInterviewSession(app, {
        sessionId,
        accessToken: token,
        writerId: replacementWriter,
        holderEpoch: taken.holderEpoch,
      }),
    ).resolves.toBe(true);
    const reopened = await openInterviewSession(app, {
      sessionId,
      accessToken: token,
      writerId,
    });
    holderEpoch = reopened.holderEpoch;
  });

  it('commits source invalidation without waiting on a locked wave rollup', async () => {
    await pool.query(
      `INSERT INTO study_wave_rollups (team_id, study_id, wave_id)
       VALUES ($1, $2, $3) ON CONFLICT (wave_id) DO NOTHING`,
      [TEAM, studyId, waveId],
    );
    const waveBlocker = await pool.connect();
    try {
      await waveBlocker.query('begin');
      await waveBlocker.query(
        `select 1 from study_wave_rollups where wave_id = $1 for update`,
        [waveId],
      );
      const writing = writeInterviewTiming(app, {
        sessionId,
        accessToken: token,
        writerId,
        holderEpoch,
        syncRevision: 16,
      });
      const outcome = await Promise.race([
        writing.then(() => 'committed' as const),
        new Promise<'blocked'>((resolve) =>
          setTimeout(() => resolve('blocked'), 250),
        ),
      ]);
      expect(outcome).toBe('committed');
      await expect(writing).resolves.toMatchObject({ applied: true });
      const pending = await pool.query<{ count: number }>(
        `select count(*)::int as count from monitoring_rollup_invalidations
          where wave_id = $1`,
        [waveId],
      );
      expect(pending.rows[0]?.count).toBeGreaterThan(0);
    } finally {
      await waveBlocker.query('rollback').catch(() => undefined);
      waveBlocker.release();
    }
  });

  it('reports an invalidation-drain failure and preserves its durable work', async () => {
    await pool.query(
      'REVOKE DELETE ON monitoring_rollup_invalidations FROM studio_maintenance',
    );
    try {
      const before = await pool.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM monitoring_rollup_invalidations
          WHERE wave_id = $1`,
        [waveId],
      );
      expect(before.rows[0]!.count).toBeGreaterThan(0);
      await expect(runMonitoringRollupOnce(maintenance)).rejects.toMatchObject({
        code: '42501',
      });
      const after = await pool.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM monitoring_rollup_invalidations
          WHERE wave_id = $1`,
        [waveId],
      );
      expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
    } finally {
      await pool.query(
        'GRANT DELETE ON monitoring_rollup_invalidations TO studio_maintenance',
      );
    }
  });

  it('serializes link revocation with an in-flight authenticated write', async () => {
    const sessionBlocker = await pool.connect();
    const revoker = await pool.connect();
    try {
      await app.query(`set application_name = 'timing-source-write'`);
      await revoker.query(`set application_name = 'timing-link-revoker'`);
      await sessionBlocker.query('begin');
      await sessionBlocker.query(
        `select 1 from interview_sessions where id = $1 for update`,
        [sessionId],
      );
      const writing = writeInterviewTiming(app, {
        sessionId,
        accessToken: token,
        writerId,
        holderEpoch,
        syncRevision: 17,
      });
      await waitForBlockedApplication('timing-source-write');
      const revoking = revoker.query(
        `update interview_links set revoked_at = clock_timestamp() where id = $1`,
        [linkId],
      );
      await waitForBlockedApplication('timing-link-revoker');
      await sessionBlocker.query('commit');
      await expect(writing).resolves.toMatchObject({ applied: true });
      await revoking;
      await expect(
        writeInterviewTiming(app, {
          sessionId,
          accessToken: token,
          writerId,
          holderEpoch,
          syncRevision: 18,
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    } finally {
      await sessionBlocker.query('rollback').catch(() => undefined);
      sessionBlocker.release();
      revoker.release();
    }
  });

  it('captures each source identity before bottom-up deletion removes joins', async () => {
    const disposableLink = randomUUID();
    const disposableSession = randomUUID();
    await insert('interview_links', {
      id: disposableLink,
      study_id: studyId,
      team_id: TEAM,
      wave_id: waveId,
      kind: 'anonymous',
      token_hash: randomBytes(32),
    });
    await insert('interview_sessions', {
      id: disposableSession,
      study_id: studyId,
      team_id: TEAM,
      wave_id: waveId,
      protocol_version_id: versionId,
      link_id: disposableLink,
      ego_uid: `ego-${disposableSession.slice(0, 8)}`,
    });
    await insert('nodes', {
      team_id: TEAM,
      session_id: disposableSession,
      node_id: 'delete-cascade-node',
      type: 'person',
      stage_id: 'info-1',
    });
    await pool.query(
      'DELETE FROM monitoring_rollup_invalidations WHERE wave_id = $1',
      [waveId],
    );

    await maintenance.query('DELETE FROM nodes WHERE session_id = $1', [
      disposableSession,
    ]);
    await maintenance.query('DELETE FROM interview_sessions WHERE id = $1', [
      disposableSession,
    ]);
    await maintenance.query('DELETE FROM interview_links WHERE id = $1', [
      disposableLink,
    ]);

    const sources = await pool.query<{ source: string }>(
      `SELECT DISTINCT source FROM monitoring_rollup_invalidations
        WHERE wave_id = $1 ORDER BY source`,
      [waveId],
    );
    expect(sources.rows).toEqual([
      { source: 'interview_links' },
      { source: 'interview_sessions' },
      { source: 'nodes' },
    ]);
  });
});
