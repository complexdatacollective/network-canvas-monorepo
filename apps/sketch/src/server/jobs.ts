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
};

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

export const toJobStatus = (record: JobRecord): JobStatus => {
  const {
    description: _description,
    tier: _tier,
    comparisonId: _comparisonId,
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
  const record: PreferenceRecord = { ...request, at };
  await stores.log.setJSON(`preference/${request.comparisonId}`, record);
  const key = logKey(dayKey(new Date(job.createdAt)), job.id);
  const entry = await stores.log.getJSON(key);
  if (isLogEntry(entry)) {
    await stores.log.setJSON(key, {
      ...entry,
      preference: { preferred: true, at },
    });
  }
  return { ok: true };
};

// ---------------------------------------------------------------------------
// Daily budget
// ---------------------------------------------------------------------------

type DailySpend = { date: string; costUsd: number; jobs: number };

const DEFAULT_DAILY_BUDGET_USD = 5;

export const dailyBudgetUsd = (
  env: string | undefined = process.env.SKETCH_DAILY_BUDGET_USD,
): number => {
  const value = env === undefined ? Number.NaN : Number(env);
  return Number.isFinite(value) && value >= 0
    ? value
    : DEFAULT_DAILY_BUDGET_USD;
};

const spendKey = (date: string) => `spend/${date}`;

const SpendSchema = z.object({ costUsd: z.number(), jobs: z.number() });

const readSpend = async (store: JsonStore, now: Date): Promise<DailySpend> => {
  const date = dayKey(now);
  const value = await store.getJSON(spendKey(date));
  const parsed = SpendSchema.safeParse(value);
  return parsed.success
    ? { date, ...parsed.data }
    : { date, costUsd: 0, jobs: 0 };
};

type BudgetCheck =
  | { ok: true; spentUsd: number; limitUsd: number }
  | { ok: false; spentUsd: number; limitUsd: number; error: string };

export const BUDGET_EXCEEDED_MESSAGE =
  'Sketch has reached its spending limit for today. Please try again tomorrow.';

export const checkBudget = async (
  store: JsonStore,
  now: Date,
  limitUsd: number = dailyBudgetUsd(),
): Promise<BudgetCheck> => {
  const spend = await readSpend(store, now);
  if (spend.costUsd >= limitUsd) {
    return {
      ok: false,
      spentUsd: spend.costUsd,
      limitUsd,
      error: BUDGET_EXCEEDED_MESSAGE,
    };
  }
  return { ok: true, spentUsd: spend.costUsd, limitUsd };
};

// Read-modify-write without a lock: two jobs finishing in the same instant
// can lose one increment. Acceptable for a soft guard.
export const addSpend = async (
  store: JsonStore,
  now: Date,
  costUsd: number,
): Promise<DailySpend> => {
  const spend = await readSpend(store, now);
  const next: DailySpend = {
    date: spend.date,
    costUsd: spend.costUsd + costUsd,
    jobs: spend.jobs + 1,
  };
  await store.setJSON(spendKey(spend.date), next);
  return next;
};
