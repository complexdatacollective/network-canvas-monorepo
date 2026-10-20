// Job records, the research log and the daily budget, all in Netlify Blobs.
//
// Stores:
//   sketch-jobs (strong consistency)  jobs/<jobId>        JobRecord
//                                     spend/<yyyy-mm-dd>  DailySpend
//   sketch-log                        log/<yyyy-mm-dd>/<jobId>   LogEntry
//                                     preference/<comparisonId>  PreferenceRecord
//
// Everything goes through the small JsonStore type so tests can use an
// in-memory store.

import { getStore } from '@netlify/blobs';
import { z } from 'zod';

import {
  type CreateJobRequest,
  type DesignTier,
  type JobStatus,
  type JobStep,
  type Provider,
  STEP_IDS,
} from '../shared/api.ts';
import { getStepModels, jobModelLabels } from './models.ts';

export type JsonStore = {
  getJSON: (key: string) => Promise<unknown>;
  setJSON: (key: string, value: unknown) => Promise<void>;
  // Compare-and-swap: `next` gets the current value (null when absent) and
  // returns the value to write, or undefined to leave the key alone. The
  // write only lands if nobody wrote the key in between; on a conflict
  // `next` runs again on the fresh value. Resolves to what was written, or
  // undefined when `next` declined.
  updateJSON: (
    key: string,
    next: (current: unknown) => unknown,
  ) => Promise<unknown>;
};

const CAS_ATTEMPTS = 8;

class StoreConflictError extends Error {
  constructor(key: string) {
    super(`Too many concurrent writes to ${key}`);
    this.name = 'StoreConflictError';
  }
}

const netlifyJsonStore = (
  name: string,
  consistency: 'strong' | 'eventual' = 'strong',
): JsonStore => {
  const store = getStore({ name, consistency });
  return {
    getJSON: async (key) => (await store.get(key, { type: 'json' })) as unknown,
    setJSON: async (key, value) => {
      await store.setJSON(key, value);
    },
    updateJSON: async (key, next) => {
      for (let i = 0; i < CAS_ATTEMPTS; i++) {
        const got = await store.getWithMetadata(key, { type: 'json' });
        const value = next(got ? (got.data as unknown) : null);
        if (value === undefined) return undefined;
        // An entry without an ETag cannot be matched; write it plainly.
        const options = !got
          ? { onlyIfNew: true }
          : got.etag
            ? { onlyIfMatch: got.etag }
            : {};
        const { modified } = await store.setJSON(key, value, options);
        if (modified) return value;
      }
      throw new StoreConflictError(key);
    },
  };
};

export const jobStore = () => netlifyJsonStore('sketch-jobs', 'strong');
export const logStore = () => netlifyJsonStore('sketch-log', 'strong');

export const dayKey = (date: Date) => date.toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

// What the store holds: the public status plus the inputs the background
// function needs. GET /api/jobs/:id returns toJobStatus(record).
export type JobRecord = JobStatus & {
  description: string;
  tier: DesignTier;
  comparisonId: string | null;
  // When generate-background claimed the job.
  startedAt?: string | null;
  // What the budget reserved for this job, and on which day's total.
  reservedUsd?: number;
  spendDate?: string;
};

const jobKey = (id: string) => `jobs/${id}`;

const initialSteps = (): JobStep[] =>
  STEP_IDS.map((id) => ({ id, state: 'pending', detail: 'Waiting' }));

export const newJobRecord = (
  id: string,
  request: CreateJobRequest,
  now: Date,
): JobRecord => {
  const models = getStepModels(request.provider, request.tier);
  return {
    id,
    status: 'queued',
    provider: request.provider,
    models: { design: models.design, wording: models.wording },
    modelLabels: jobModelLabels(models),
    steps: initialSteps(),
    createdAt: now.toISOString(),
    finishedAt: null,
    durationMs: null,
    usage: null,
    result: null,
    error: null,
    refusalHint: null,
    description: request.description,
    tier: request.tier,
    comparisonId: request.comparisonId ?? null,
  };
};

// Records are only ever written by this module; a shallow check is enough.
const isJobRecord = (value: unknown): value is JobRecord =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  typeof value.id === 'string' &&
  'status' in value &&
  typeof value.status === 'string';

export const readJob = async (
  store: JsonStore,
  id: string,
): Promise<JobRecord | null> => {
  const value = await store.getJSON(jobKey(id));
  return isJobRecord(value) ? value : null;
};

export const writeJob = (store: JsonStore, record: JobRecord) =>
  store.setJSON(jobKey(record.id), record);

// Atomically moves a queued job to running. Resolves to the claimed record,
// or null when the job is unknown or another invocation got there first, so
// two invocations for one job never both run the paid pipeline.
export const claimJob = async (
  store: JsonStore,
  id: string,
  now: Date,
): Promise<JobRecord | null> => {
  const written = await store.updateJSON(jobKey(id), (current) =>
    isJobRecord(current) && current.status === 'queued'
      ? ({
          ...current,
          status: 'running',
          startedAt: now.toISOString(),
        } satisfies JobRecord)
      : undefined,
  );
  return isJobRecord(written) ? written : null;
};

// generate-background is killed at 15 minutes. A job still queued or running
// well after that will never finish: nothing is left to write its outcome.
export const STALE_JOB_MS = 16 * 60_000;

const STALE_JOB_MESSAGE =
  'Something went wrong while Sketch was working on your study. Please try again.';

export const isStaleJob = (record: JobRecord, now: Date): boolean => {
  if (record.status !== 'queued' && record.status !== 'running') return false;
  const since = Date.parse(record.startedAt ?? record.createdAt);
  return Number.isFinite(since) && now.getTime() - since > STALE_JOB_MS;
};

export const failStaleJob = (record: JobRecord, now: Date): JobRecord => ({
  ...record,
  status: 'failed',
  error: STALE_JOB_MESSAGE,
  steps: record.steps.map((s) =>
    s.state === 'active' ? { ...s, state: 'failed' } : s,
  ),
  finishedAt: now.toISOString(),
});

export const toJobStatus = (record: JobRecord): JobStatus => {
  const {
    description: _description,
    tier: _tier,
    comparisonId: _comparisonId,
    startedAt: _startedAt,
    reservedUsd: _reservedUsd,
    spendDate: _spendDate,
    ...status
  } = record;
  return status;
};

// ---------------------------------------------------------------------------
// Research log
// ---------------------------------------------------------------------------

export type LogEntry = {
  jobId: string;
  date: string;
  createdAt: string;
  finishedAt: string | null;
  description: string;
  provider: Provider;
  tier: DesignTier;
  models: Record<string, string>;
  status: JobStatus['status'];
  error: string | null;
  // Everything the pipeline recorded: designs, issues, validity, calls,
  // durations and tags. Kept loose so the log can grow without migrations.
  pipeline: Record<string, unknown> | null;
  usage: JobStatus['usage'];
  durationMs: number | null;
  comparisonId: string | null;
  preference: { preferred: boolean; at: string } | null;
};

const logKey = (date: string, jobId: string) => `log/${date}/${jobId}`;

export const writeLog = (store: JsonStore, entry: LogEntry) =>
  store.setJSON(logKey(entry.date, entry.jobId), entry);

const isLogEntry = (value: unknown): value is LogEntry =>
  typeof value === 'object' &&
  value !== null &&
  'jobId' in value &&
  typeof value.jobId === 'string';

type PreferenceRecord = {
  comparisonId: string;
  preferredJobId: string;
  at: string;
};

type PreferenceOutcome =
  | { ok: true }
  | { ok: false; status: number; error: string };

// Records which of two compared runs the researcher picked: on the comparison
// itself and on the preferred job's log entry.
const updateLogEntry = async (
  log: JsonStore,
  job: JobRecord,
  patch: Partial<LogEntry>,
) => {
  const key = logKey(dayKey(new Date(job.createdAt)), job.id);
  const entry = await log.getJSON(key);
  if (isLogEntry(entry)) await log.setJSON(key, { ...entry, ...patch });
};

export const recordPreference = async (
  stores: { jobs: JsonStore; log: JsonStore },
  request: { comparisonId: string; preferredJobId: string },
  now: Date,
): Promise<PreferenceOutcome> => {
  const job = await readJob(stores.jobs, request.preferredJobId);
  if (!job || job.comparisonId !== request.comparisonId) {
    return {
      ok: false,
      status: 404,
      error: 'That comparison could not be found.',
    };
  }
  const at = now.toISOString();
  const recordKey = `preference/${request.comparisonId}`;
  const previous = await stores.log.getJSON(recordKey);
  const record: PreferenceRecord = { ...request, at };
  await stores.log.setJSON(recordKey, record);
  // A changed choice: the job picked before is no longer the preferred one.
  const previousId =
    previous && typeof previous === 'object' && 'preferredJobId' in previous
      ? previous.preferredJobId
      : null;
  if (typeof previousId === 'string' && previousId !== job.id) {
    const before = await readJob(stores.jobs, previousId);
    if (before) await updateLogEntry(stores.log, before, { preference: null });
  }
  await updateLogEntry(stores.log, job, {
    preference: { preferred: true, at },
  });
  return { ok: true };
};

// A finished job from the Ready screen joins a comparison started from it, so
// the researcher can prefer it like the comparison's own runs.
export const joinComparison = async (
  stores: { jobs: JsonStore; log: JsonStore },
  seedJobId: string,
  comparisonId: string,
): Promise<void> => {
  const seed = await readJob(stores.jobs, seedJobId);
  if (!seed || seed.status !== 'succeeded') return;
  if (seed.comparisonId && seed.comparisonId !== comparisonId) return;
  if (seed.comparisonId !== comparisonId) {
    await writeJob(stores.jobs, { ...seed, comparisonId });
  }
  await updateLogEntry(stores.log, seed, { comparisonId });
};

// ---------------------------------------------------------------------------
// Daily budget
// ---------------------------------------------------------------------------
//
// spend/<day> holds what finished jobs cost (costUsd) and what jobs in
// flight may still cost (pendingUsd). A new job reserves its worst-case
// cost up front and settles it with the real cost when it finishes, so
// concurrent jobs cannot all pass the check against the same total. Both
// sides are compare-and-swap writes. A job that is killed never settles: its
// reservation stays counted for the rest of the day, which errs on the side
// of stopping.

type DailySpend = {
  date: string;
  costUsd: number;
  pendingUsd: number;
  jobs: number;
};

const DEFAULT_DAILY_BUDGET_USD = 20;

export const dailyBudgetUsd = (
  env: string | undefined = process.env.SKETCH_DAILY_BUDGET_USD,
): number => {
  const value = env === undefined ? Number.NaN : Number(env);
  return Number.isFinite(value) && value >= 0
    ? value
    : DEFAULT_DAILY_BUDGET_USD;
};

const spendKey = (date: string) => `spend/${date}`;

const SpendSchema = z.object({
  costUsd: z.number(),
  pendingUsd: z.number().default(0),
  jobs: z.number(),
});

const parseSpend = (date: string, value: unknown): DailySpend => {
  const parsed = SpendSchema.safeParse(value);
  return parsed.success
    ? { date, ...parsed.data }
    : { date, costUsd: 0, pendingUsd: 0, jobs: 0 };
};

const round = (usd: number) => Math.round(usd * 1e6) / 1e6;

type BudgetCheck =
  | { ok: true; spentUsd: number; limitUsd: number }
  | { ok: false; spentUsd: number; limitUsd: number; error: string };

export const BUDGET_EXCEEDED_MESSAGE =
  'Sketch has reached its spending limit for today. Please try again tomorrow.';

// A job may start when its worst case fits under the limit alongside what
// is spent and reserved. A lone job (nothing else in flight) may start while
// anything is left, so a limit below one worst case still lets jobs run one
// at a time; the overshoot is then at most one job.
const fits = (spend: DailySpend, limitUsd: number, estimateUsd: number) => {
  const committed = spend.costUsd + spend.pendingUsd;
  if (committed >= limitUsd) return false;
  return committed + estimateUsd <= limitUsd || spend.pendingUsd <= 0;
};

export const checkBudget = async (
  store: JsonStore,
  now: Date,
  limitUsd: number = dailyBudgetUsd(),
  estimateUsd = 0,
): Promise<BudgetCheck> => {
  const date = dayKey(now);
  const spend = parseSpend(date, await store.getJSON(spendKey(date)));
  const spentUsd = round(spend.costUsd + spend.pendingUsd);
  return fits(spend, limitUsd, estimateUsd)
    ? { ok: true, spentUsd, limitUsd }
    : { ok: false, spentUsd, limitUsd, error: BUDGET_EXCEEDED_MESSAGE };
};

// Checks and reserves in one compare-and-swap. Resolves to the day the
// reservation was made against, or a rejection.
export const reserveBudget = async (
  store: JsonStore,
  now: Date,
  estimateUsd: number,
  limitUsd: number = dailyBudgetUsd(),
): Promise<{ ok: true; spendDate: string } | { ok: false; error: string }> => {
  const date = dayKey(now);
  const written = await store.updateJSON(spendKey(date), (current) => {
    const spend = parseSpend(date, current);
    if (!fits(spend, limitUsd, estimateUsd)) return undefined;
    return {
      ...spend,
      pendingUsd: round(spend.pendingUsd + estimateUsd),
    } satisfies DailySpend;
  });
  return written === undefined
    ? { ok: false, error: BUDGET_EXCEEDED_MESSAGE }
    : { ok: true, spendDate: date };
};

// Releases a job's reservation and records what it actually cost.
export const settleSpend = async (
  store: JsonStore,
  date: string,
  costUsd: number,
  reservedUsd = 0,
): Promise<DailySpend> => {
  const written = await store.updateJSON(spendKey(date), (current) => {
    const spend = parseSpend(date, current);
    return {
      date,
      costUsd: round(spend.costUsd + costUsd),
      pendingUsd: round(Math.max(0, spend.pendingUsd - reservedUsd)),
      jobs: spend.jobs + 1,
    } satisfies DailySpend;
  });
  return parseSpend(date, written);
};

// Records a cost with nothing reserved against it.
export const addSpend = (
  store: JsonStore,
  now: Date,
  costUsd: number,
): Promise<DailySpend> => settleSpend(store, dayKey(now), costUsd, 0);
