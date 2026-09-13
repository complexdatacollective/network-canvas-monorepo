import { createHash } from 'node:crypto';

import type pg from 'pg';
import { z } from 'zod';

import type {
  StageTimingExit,
  StageTimingPayload,
} from '@codaco/interview/contract';
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

export class StageTimingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StageTimingValidationError';
  }
}

type TokenParts = { teamId: string; tokenHash: Buffer };

type AuthoritativeStage = { id: string; type: string };
type StoredStageExit = StageTimingExit & { stageId: string };
type StoredPromptExit = StageTimingExit & { stageId?: string };
type StoredStageTiming = Omit<
  StageTimingPayload,
  'stageExits' | 'promptExits'
> & {
  stageExits: StoredStageExit[];
  promptExits?: StoredPromptExit[];
};

function tokenParts(accessToken: string): TokenParts {
  const separator = accessToken.length - 44;
  if (separator < 1 || accessToken[separator] !== '.') {
    throw new SessionTimingError('INVALID_TOKEN');
  }
  const teamId = accessToken.slice(0, separator);
  const secret = accessToken.slice(separator + 1);
  // Better Auth organization ids and Studio's team-id boundaries allow any
  // non-empty string up to 255 characters. Keep token parsing on that same
  // contract; the fixed-width suffix makes dots in the id unambiguous.
  if (teamId.length < 1 || teamId.length > 255) {
    throw new SessionTimingError('INVALID_TOKEN');
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) {
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

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function authoritativeStages(
  client: pg.PoolClient,
  versionId: string,
): Promise<AuthoritativeStage[]> {
  const result = await client.query<{ section_id: string; doc: unknown }>(
    `select vs.section_id, s.doc
       from version_sections vs
       join sections s
         on s.team_id = vs.team_id and s.hash = vs.section_hash
      where vs.version_id = $1
      order by vs.section_id`,
    [versionId],
  );
  const docs = new Map(result.rows.map((row) => [row.section_id, row.doc]));
  const stageOrderDoc = docs.get('stageOrder');
  const order = record(stageOrderDoc) ? stageOrderDoc.stages : undefined;
  if (!Array.isArray(order) || !order.every((id) => typeof id === 'string')) {
    throw new Error('published protocol has no valid stage order');
  }
  return order.map((id) => {
    const stageDoc = docs.get(`stage:${id}`);
    const type = record(stageDoc) ? stageDoc.type : undefined;
    if (typeof type !== 'string' || type.length === 0) {
      throw new Error(`published protocol stage ${id} has no type`);
    }
    return { id, type };
  });
}

function resolveExit(
  exit: StageTimingExit,
  stages: readonly AuthoritativeStage[],
  allowFinish: boolean,
): StoredStageExit | StoredPromptExit {
  const stage = stages[exit.stageIndex];
  if (stage !== undefined) {
    if (exit.stageType !== stage.type) {
      throw new StageTimingValidationError(
        `stage ${exit.stageIndex} does not match the pinned protocol`,
      );
    }
    return { ...exit, stageId: stage.id, stageType: stage.type };
  }
  if (
    allowFinish &&
    exit.stageIndex === stages.length &&
    exit.stageType === 'FinishSession'
  ) {
    return { ...exit, stageType: 'FinishSession' };
  }
  throw new StageTimingValidationError(
    `stage ${exit.stageIndex} is not present in the pinned protocol`,
  );
}

function normalizeTiming(
  timing: StageTimingPayload,
  stages: readonly AuthoritativeStage[],
): StoredStageTiming {
  const parsed = StageTimingSchema.parse(timing);
  const rawStageTotal = parsed.stageExits.reduce(
    (sum, exit) => sum + exit.durationMs,
    0,
  );
  if (
    parsed.totalDurationMs !== undefined &&
    Math.abs(parsed.totalDurationMs - rawStageTotal) > Number.EPSILON * 16
  ) {
    throw new StageTimingValidationError(
      'totalDurationMs must equal retained authored stage intervals',
    );
  }
  const stageExits = parsed.stageExits.map((exit) => {
    const resolved = resolveExit(exit, stages, false);
    if (!('stageId' in resolved) || resolved.stageId === undefined) {
      throw new StageTimingValidationError('authored stage has no id');
    }
    return {
      ...resolved,
      stageId: resolved.stageId,
      durationMs: Math.round(resolved.durationMs),
    };
  });
  const promptExits = parsed.promptExits?.map((exit) => ({
    ...resolveExit(exit, stages, true),
    durationMs: Math.round(exit.durationMs),
  }));
  const stageTotal = stageExits.reduce((sum, exit) => sum + exit.durationMs, 0);
  return {
    stageExits,
    ...(promptExits === undefined ? {} : { promptExits }),
    ...(parsed.totalDurationMs === undefined
      ? {}
      : { totalDurationMs: stageTotal }),
  };
}

async function lockedLinkedSession(
  client: pg.PoolClient,
  sessionId: string,
  tokenHash: Buffer,
): Promise<{
  teamId: string;
  studyId: string;
  waveId: string;
  protocolVersionId: string;
  status: 'in_progress' | 'completed' | 'abandoned';
  holderId: string | null;
  holderEpoch: string;
  syncRevision: number;
  stageTiming: StageTimingPayload | null;
}> {
  const link = await client.query<{
    link_id: string;
    team_id: string;
    study_id: string;
    wave_id: string;
  }>(
    `select l.id as link_id, s.team_id, s.study_id, s.wave_id
       from interview_links l
       join interview_sessions s
         on s.link_id = l.id and s.team_id = l.team_id
      where s.id = $1
        and l.token_hash = $2
        and l.revoked_at is null
        and (l.expires_at is null or l.expires_at > clock_timestamp())
      for update of l`,
    [sessionId, tokenHash],
  );
  const authorization = link.rows[0];
  if (!authorization) throw new SessionTimingError('NOT_FOUND');
  await client.query(
    `insert into study_wave_rollups (team_id, study_id, wave_id)
     values ($1, $2, $3)
     on conflict (wave_id) do nothing`,
    [authorization.team_id, authorization.study_id, authorization.wave_id],
  );
  await client.query(
    `select 1 from study_wave_rollups where wave_id = $1 for update`,
    [authorization.wave_id],
  );
  const result = await client.query<{
    team_id: string;
    study_id: string;
    wave_id: string;
    protocol_version_id: string;
    status: 'in_progress' | 'completed' | 'abandoned';
    holder_id: string | null;
    holder_epoch: string;
    sync_revision: number;
    stage_timing: StageTimingPayload | null;
  }>(
    `select s.team_id, s.study_id, s.wave_id, s.protocol_version_id, s.status, s.holder_id,
            s.holder_epoch, s.sync_revision, s.stage_timing
       from interview_sessions s
      where s.id = $1
        and s.link_id = $2
        and s.wave_id = $3
      for update`,
    [sessionId, authorization.link_id, authorization.wave_id],
  );
  const row = result.rows[0];
  if (!row) throw new SessionTimingError('NOT_FOUND');
  return {
    teamId: row.team_id,
    studyId: row.study_id,
    waveId: row.wave_id,
    protocolVersionId: row.protocol_version_id,
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
  input: {
    sessionId: string;
    accessToken: string;
    writerId: string;
    takeover?: boolean;
  },
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
    if (
      row.holderId !== null &&
      row.holderId !== writerId &&
      input.takeover !== true
    ) {
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

/** Releases a writer fence only when the caller still owns its exact epoch. */
export async function releaseInterviewSession(
  pool: pg.Pool,
  input: {
    sessionId: string;
    accessToken: string;
    writerId: string;
    holderEpoch: number;
  },
): Promise<boolean> {
  const sessionId = SessionIdSchema.parse(input.sessionId);
  const writerId = WriterIdSchema.parse(input.writerId);
  const holderEpoch = RevisionSchema.parse(input.holderEpoch);
  const { teamId, tokenHash } = tokenParts(input.accessToken);
  return createTenantDb(pool, teamId).transaction(async (client) => {
    const row = await lockedLinkedSession(client, sessionId, tokenHash);
    if (row.status !== 'in_progress') return false;
    const released = await client.query(
      `update interview_sessions
          set holder_id = null, holder_epoch = holder_epoch + 1,
              last_activity_at = clock_timestamp()
        where id = $1 and holder_id = $2 and holder_epoch = $3`,
      [sessionId, writerId, holderEpoch],
    );
    return released.rowCount === 1;
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

    const stages = await authoritativeStages(client, row.protocolVersionId);
    const timing = input.stageTiming
      ? normalizeTiming(input.stageTiming, stages)
      : undefined;
    if (
      input.currentStageId !== undefined &&
      input.currentStageIndex === undefined
    ) {
      throw new StageTimingValidationError(
        'current stage id requires its protocol index',
      );
    }
    if (input.currentStageIndex !== undefined) {
      const stage = stages[input.currentStageIndex];
      const isFinish = input.currentStageIndex === stages.length;
      if (stage === undefined && !isFinish) {
        throw new StageTimingValidationError(
          'current stage is not in protocol',
        );
      }
      if (
        input.currentStageId !== undefined &&
        input.currentStageId !== null &&
        input.currentStageId !== (isFinish ? 'FinishSession' : stage?.id)
      ) {
        throw new StageTimingValidationError(
          'current stage does not match the pinned protocol',
        );
      }
    }
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
      `update study_wave_rollups
          set dirty_generation = dirty_generation + 1,
              stale_at = clock_timestamp(),
              attempt_count = 0,
              failed_at = null,
              last_error = null,
              lease_owner = null,
              lease_expires_at = null
        where wave_id = $1`,
      [row.waveId],
    );
    return {
      kind: 'applied',
      applied: true,
      syncRevision: input.syncRevision,
    };
  });
}
