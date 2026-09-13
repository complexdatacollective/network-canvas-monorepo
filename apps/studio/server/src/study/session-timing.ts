import { createHash } from 'node:crypto';

import type pg from 'pg';
import { z } from 'zod';

import type { StageTimingPayload } from '@codaco/interview/contract';
import { createTenantDb } from '@codaco/studio-sync/tenant';

/** A revision may advance only by a bounded amount in one unauthenticated write. */
const MAX_SYNC_REVISION_ADVANCE = 10_000;
/** A single observed interval cannot plausibly span more than a week. */
export const MAX_TIMING_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
/** The total retained timing history is bounded before it reaches storage. */
const MAX_TIMING_TOTAL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_STAGE_INDEX = 10_000;
const MAX_PROMPT_INDEX = 10_000;
const MAX_PROMPT_COUNT = 10_000;

const StageTimingExitSchema = z.object({
  stageIndex: z.number().int().nonnegative().max(MAX_STAGE_INDEX),
  stageType: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z][A-Za-z0-9_-]*$/),
  promptIndex: z.number().int().nonnegative().max(MAX_PROMPT_INDEX),
  promptCount: z.number().int().nonnegative().max(MAX_PROMPT_COUNT),
  durationMs: z.number().finite().nonnegative().max(MAX_TIMING_INTERVAL_MS),
  exitDirection: z.enum(['forward', 'back', 'jumped', 'abandoned']),
});

export const StageTimingSchema = z
  .object({
    stageExits: z.array(StageTimingExitSchema).max(10_000),
    promptExits: z.array(StageTimingExitSchema).max(10_000).optional(),
    totalDurationMs: z
      .number()
      .finite()
      .nonnegative()
      .max(MAX_TIMING_TOTAL_MS)
      .optional(),
  })
  .refine(
    (payload) => {
      const stageTotal = payload.stageExits.reduce(
        (sum, exit) => sum + exit.durationMs,
        0,
      );
      const promptTotal = (payload.promptExits ?? []).reduce(
        (sum, exit) => sum + exit.durationMs,
        0,
      );
      return (
        stageTotal <= MAX_TIMING_TOTAL_MS && promptTotal <= MAX_TIMING_TOTAL_MS
      );
    },
    { message: 'stage timing intervals exceed the total duration bound' },
  );

const SessionIdSchema = z.string().uuid();
const WriterIdSchema = z.string().trim().min(1).max(128);
const RevisionSchema = z.number().int().nonnegative().safe();

export type SessionTimingWrite = {
  sessionId: string;
  accessToken: string;
  writerId: string;
  holderEpoch: number;
  syncRevision: number;
  stageTiming?: StageTimingPayload;
  currentStageIndex?: number;
  currentStageId?: string | null;
};

export type SessionTimingOutcome =
  | {
      kind: 'applied';
      applied: true;
      syncRevision: number;
    }
  | {
      kind: 'stale' | 'revision_gap';
      applied: false;
      syncRevision: number;
    }
  | {
      kind: 'frozen';
      applied: false;
      syncRevision: number;
    };

export type OpenSessionOutcome = {
  teamId: string;
  sessionId: string;
  holderEpoch: number;
  syncRevision: number;
  stageTiming: StageTimingPayload | null;
};

export type SessionTimingErrorCode =
  | 'INVALID_TOKEN'
  | 'NOT_FOUND'
  | 'HOLDER_CONFLICT';

export class SessionTimingError extends Error {
  readonly code: SessionTimingErrorCode;

  constructor(code: SessionTimingErrorCode) {
    super(code);
    this.name = 'SessionTimingError';
    this.code = code;
  }
}

type TokenParts = { teamId: string; tokenHash: Buffer };

function tokenParts(accessToken: string): TokenParts {
  const separator = accessToken.indexOf('.');
  if (separator < 1 || separator === accessToken.length - 1) {
    throw new SessionTimingError('INVALID_TOKEN');
  }
  const teamId = accessToken.slice(0, separator);
  const secret = accessToken.slice(separator + 1);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(teamId)) {
    throw new SessionTimingError('INVALID_TOKEN');
  }
  return {
    teamId,
    tokenHash: createHash('sha256').update(secret).digest(),
  };
}

function validateWrite(input: SessionTimingWrite): SessionTimingWrite {
  const parsed = z
    .object({
      sessionId: SessionIdSchema,
      accessToken: z.string().min(3).max(512),
      writerId: WriterIdSchema,
      holderEpoch: RevisionSchema,
      syncRevision: RevisionSchema,
      stageTiming: StageTimingSchema.optional(),
      currentStageIndex: z
        .number()
        .int()
        .nonnegative()
        .max(MAX_STAGE_INDEX)
        .optional(),
      currentStageId: z
        .string()
        .trim()
        .min(1)
        .max(128)
        .regex(/^[A-Za-z0-9_-]+$/)
        .nullable()
        .optional(),
    })
    .parse(input);
  return parsed;
}

async function lockedLinkedSession(
  client: pg.PoolClient,
  sessionId: string,
  tokenHash: Buffer,
): Promise<{
  teamId: string;
  studyId: string;
  waveId: string;
  status: 'in_progress' | 'completed' | 'abandoned';
  holderId: string | null;
  holderEpoch: string;
  syncRevision: number;
  stageTiming: StageTimingPayload | null;
}> {
  const result = await client.query<{
    team_id: string;
    study_id: string;
    wave_id: string;
    status: 'in_progress' | 'completed' | 'abandoned';
    holder_id: string | null;
    holder_epoch: string;
    sync_revision: number;
    stage_timing: StageTimingPayload | null;
  }>(
    `select s.team_id, s.study_id, s.wave_id, s.status, s.holder_id,
            s.holder_epoch, s.sync_revision, s.stage_timing
       from interview_sessions s
       join interview_links l
         on l.id = s.link_id and l.team_id = s.team_id
      where s.id = $1
        and l.token_hash = $2
        and l.revoked_at is null
        and (l.expires_at is null or l.expires_at > clock_timestamp())
      for update of s`,
    [sessionId, tokenHash],
  );
  const row = result.rows[0];
  if (!row) throw new SessionTimingError('NOT_FOUND');
  return {
    teamId: row.team_id,
    studyId: row.study_id,
    waveId: row.wave_id,
    status: row.status,
    holderId: row.holder_id,
    holderEpoch: row.holder_epoch,
    syncRevision: row.sync_revision,
    stageTiming: row.stage_timing,
  };
}

/** Claims the existing session's writer epoch after authenticating its link. */
export async function openInterviewSession(
  pool: pg.Pool,
  input: { sessionId: string; accessToken: string; writerId: string },
): Promise<OpenSessionOutcome> {
  const sessionId = SessionIdSchema.parse(input.sessionId);
  const writerId = WriterIdSchema.parse(input.writerId);
  const { teamId, tokenHash } = tokenParts(input.accessToken);
  return createTenantDb(pool, teamId).transaction(async (client) => {
    const row = await lockedLinkedSession(client, sessionId, tokenHash);
    if (row.status !== 'in_progress') {
      return {
        teamId,
        sessionId,
        holderEpoch: Number(row.holderEpoch),
        syncRevision: row.syncRevision,
        stageTiming: row.stageTiming,
      };
    }
    if (row.holderId !== null && row.holderId !== writerId) {
      throw new SessionTimingError('HOLDER_CONFLICT');
    }
    const claimed = await client.query<{ holder_epoch: string }>(
      `update interview_sessions
          set holder_id = $2,
              holder_epoch = case when holder_id = $2 then holder_epoch
                                  else holder_epoch + 1 end,
              last_activity_at = clock_timestamp()
        where id = $1
        returning holder_epoch`,
      [sessionId, writerId],
    );
    const holderEpoch = Number(claimed.rows[0]?.holder_epoch);
    if (!Number.isSafeInteger(holderEpoch))
      throw new Error('session holder epoch exceeded safe integer range');
    return {
      teamId,
      sessionId,
      holderEpoch,
      syncRevision: row.syncRevision,
      stageTiming: row.stageTiming,
    };
  });
}

/**
 * Applies one complete timing snapshot. The link token selects the tenant,
 * the holder fence selects the active browser, and the revision predicate
 * makes overlapping ordinary/unload writes idempotent and monotonic.
 */
export async function writeInterviewTiming(
  pool: pg.Pool,
  rawInput: SessionTimingWrite,
): Promise<SessionTimingOutcome> {
  const input = validateWrite(rawInput);
  const { teamId, tokenHash } = tokenParts(input.accessToken);
  return createTenantDb(pool, teamId).transaction(async (client) => {
    const row = await lockedLinkedSession(client, input.sessionId, tokenHash);
    const currentRevision = row.syncRevision;
    if (row.status !== 'in_progress') {
      return { kind: 'frozen', applied: false, syncRevision: currentRevision };
    }
    if (
      row.holderId !== input.writerId ||
      Number(row.holderEpoch) !== input.holderEpoch
    ) {
      throw new SessionTimingError('HOLDER_CONFLICT');
    }
    if (input.syncRevision <= currentRevision) {
      return { kind: 'stale', applied: false, syncRevision: currentRevision };
    }
    if (input.syncRevision - currentRevision > MAX_SYNC_REVISION_ADVANCE) {
      return {
        kind: 'revision_gap',
        applied: false,
        syncRevision: currentRevision,
      };
    }

    const timing = input.stageTiming
      ? StageTimingSchema.parse(input.stageTiming)
      : undefined;
    const values: unknown[] = [
      input.sessionId,
      input.syncRevision,
      input.currentStageIndex ?? null,
      input.currentStageId ?? null,
      timing ? JSON.stringify(timing) : null,
    ];
    await client.query(
      `update interview_sessions
          set sync_revision = $2,
              current_stage_index = coalesce($3, current_stage_index),
              current_stage_id = case when $4::text is null
                                      then current_stage_id else $4 end,
              stage_timing = coalesce($5::jsonb, stage_timing),
              last_activity_at = clock_timestamp()
        where id = $1`,
      values,
    );
    await client.query(
      `insert into study_wave_rollups
         (team_id, study_id, wave_id, stale_at)
       values ($1, $2, $3, clock_timestamp())
       on conflict (wave_id) do update
         set stale_at = coalesce(study_wave_rollups.stale_at, excluded.stale_at)`,
      [row.teamId, row.studyId, row.waveId],
    );
    return {
      kind: 'applied',
      applied: true,
      syncRevision: input.syncRevision,
    };
  });
}
