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
import { createSessionTimingOpenRoute } from '../../study/session-timing-route.ts';
import {
  MAX_TIMING_INTERVAL_MS,
  openInterviewSession,
  releaseInterviewSession,
  SessionTimingError,
  writeInterviewTiming,
} from '../../study/session-timing.ts';
import {
  runMonitoringRollupOnce,
  runMonitoringStageRollupOnce,
} from '../recompute.ts';

const db = await reachableDb();

const TEAM = `timing.team.with.dots.${'a'.repeat(130)}`;
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
        totalDurationMs: 1386,
        stageExits: stageTiming.stageExits.map((exit) => ({
          ...exit,
          durationMs: Math.round(exit.durationMs),
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
        accessToken: `${OTHER_TEAM}.${'a'.repeat(43)}`,
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
        stage_id: 'info-2',
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
    await expect(runMonitoringStageRollupOnce(maintenance)).resolves.toEqual({
      claimed: 1,
    });
    const siblingLease = await pool.query<{ lease_owner: string | null }>(
      `select lease_owner from study_stage_rollups
        where wave_id = $1 and stage_id = $2`,
      [waveId, 'info-1'],
    );
    expect(siblingLease.rows[0]?.lease_owner).toBe('older-stage-worker');
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
      await waitForBlockedApplication('timing-source-write');
    } finally {
      releaseRecompute?.();
    }
    await Promise.all([worker, newerWrite]);
    const state = await pool.query<{ stale_at: Date | null }>(
      `select stale_at from study_wave_rollups where wave_id = $1`,
      [waveId],
    );
    expect(state.rows[0]?.stale_at).not.toBeNull();

    const claims = await Promise.all([
      runMonitoringRollupOnce(maintenance),
      runMonitoringStageRollupOnce(maintenance),
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

  it('serializes link revocation with an in-flight authenticated write', async () => {
    const waveBlocker = await pool.connect();
    const revoker = await pool.connect();
    try {
      await app.query(`set application_name = 'timing-source-write'`);
      await revoker.query(`set application_name = 'timing-link-revoker'`);
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
      await waitForBlockedApplication('timing-source-write');
      const revoking = revoker.query(
        `update interview_links set revoked_at = clock_timestamp() where id = $1`,
        [linkId],
      );
      await waitForBlockedApplication('timing-link-revoker');
      await waveBlocker.query('commit');
      await expect(writing).resolves.toMatchObject({ applied: true });
      await revoking;
      await expect(
        writeInterviewTiming(app, {
          sessionId,
          accessToken: token,
          writerId,
          holderEpoch,
          syncRevision: 17,
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    } finally {
      await waveBlocker.query('rollback').catch(() => undefined);
      waveBlocker.release();
      revoker.release();
    }
  });
});
