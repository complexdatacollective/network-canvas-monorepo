// Request handlers behind the Netlify functions. The functions in
// netlify/functions only wire production dependencies into these, so the
// handlers can be tested with in-memory stores and fake adapters.

import { z } from 'zod';

import {
  type ApiError,
  type ConfigResponse,
  type CreateJobResponse,
  DESIGN_TIERS,
  MAX_DESCRIPTION_LENGTH,
  MIN_DESCRIPTION_LENGTH,
  PROVIDERS,
} from '../shared/api.ts';
import {
  claimJob,
  dayKey,
  failStaleJob,
  isStaleJob,
  type JobRecord,
  joinComparison,
  type JsonStore,
  newJobRecord,
  readJob,
  recordPreference,
  reserveBudget,
  settleSpend,
  toJobStatus,
  writeJob,
  writeLog,
} from './jobs.ts';
import { getStepModels, providerConfig } from './models.ts';
import {
  estimateJobCostUsd,
  PIPELINE_FAILURE_MESSAGE,
  runPipeline,
  type PipelineDeps,
} from './pipeline.ts';
import type { ProviderAdapters } from './providers/types.ts';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });

const apiError = (error: string, status: number) =>
  json({ error } satisfies ApiError, status);

const readBody = async (req: Request): Promise<unknown> => {
  try {
    return (await req.json()) as unknown;
  } catch {
    return undefined;
  }
};

// ---------------------------------------------------------------------------
// POST /api/jobs
// ---------------------------------------------------------------------------

const CreateJobRequestSchema = z.object({
  description: z
    .string()
    .trim()
    .min(
      MIN_DESCRIPTION_LENGTH,
      `Describe your study in at least ${MIN_DESCRIPTION_LENGTH} characters.`,
    )
    .max(
      MAX_DESCRIPTION_LENGTH,
      `Keep the description under ${MAX_DESCRIPTION_LENGTH} characters.`,
    ),
  provider: z.enum(PROVIDERS),
  tier: z.enum(DESIGN_TIERS),
  comparisonId: z
    .string()
    .regex(/^[A-Za-z0-9-]{1,64}$/)
    .optional(),
  seedJobId: z
    .string()
    .regex(/^[A-Za-z0-9-]{1,64}$/)
    .optional(),
});

type CreateJobDeps = {
  jobs: JsonStore;
  // The research log, for tagging a seed job with the comparison it joins.
  log?: JsonStore;
  adapters: ProviderAdapters;
  // Starts generate-background for the job; resolves once it has accepted.
  startBackground: (jobId: string) => Promise<void>;
  now?: () => Date;
  newId?: () => string;
};

export const handleCreateJob = async (
  req: Request,
  deps: CreateJobDeps,
): Promise<Response> => {
  const now = deps.now?.() ?? new Date();
  const parsed = CreateJobRequestSchema.safeParse(await readBody(req));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const message =
      first && first.path[0] === 'description'
        ? first.message
        : 'The request was not in the expected format.';
    return apiError(message, 400);
  }
  const request = parsed.data;
  if (!deps.adapters[request.provider].isConfigured()) {
    return apiError('That model provider is not available right now.', 400);
  }
  // Reserve the job's worst case now; generate-background settles it with
  // the real cost when the job finishes.
  const reservedUsd = estimateJobCostUsd(request.provider, request.tier);
  const budget = await reserveBudget(deps.jobs, now, reservedUsd);
  if (!budget.ok) return apiError(budget.error, 429);

  if (request.seedJobId && request.comparisonId && deps.log) {
    try {
      await joinComparison(
        { jobs: deps.jobs, log: deps.log },
        request.seedJobId,
        request.comparisonId,
      );
    } catch {
      // The new run goes ahead; only the seed's preference link is lost.
    }
  }

  const jobId = deps.newId?.() ?? crypto.randomUUID();
  const record: JobRecord = {
    ...newJobRecord(jobId, request, now),
    reservedUsd,
    spendDate: budget.spendDate,
  };
  await writeJob(deps.jobs, record);
  try {
    await deps.startBackground(jobId);
  } catch {
    await writeJob(deps.jobs, {
      ...record,
      status: 'failed',
      error: 'Sketch could not start working on your study. Please try again.',
      finishedAt: new Date().toISOString(),
    });
    // Nothing ran: hand the reservation back. If this write fails, the
    // reservation stays counted for the day, which errs on the safe side.
    try {
      await settleSpend(deps.jobs, budget.spendDate, 0, reservedUsd);
    } catch {
      // See above.
    }
    return apiError('Sketch could not start the job. Please try again.', 502);
  }
  return json({ jobId } satisfies CreateJobResponse, 202);
};

// ---------------------------------------------------------------------------
// GET /api/jobs/:id
// ---------------------------------------------------------------------------

export const handleGetJob = async (
  id: string | undefined,
  deps: { jobs: JsonStore; now?: () => Date },
): Promise<Response> => {
  if (!id || !/^[A-Za-z0-9-]{1,64}$/.test(id)) {
    return apiError('Unknown job.', 404);
  }
  const record = await readJob(deps.jobs, id);
  if (!record) return apiError('Unknown job.', 404);
  const now = deps.now?.() ?? new Date();
  if (isStaleJob(record, now)) {
    // The background run was killed or crashed without writing an outcome.
    const failed = failStaleJob(record, now);
    try {
      await writeJob(deps.jobs, failed);
    } catch {
      // Reported as failed either way; the next poll tries the write again.
    }
    return json(toJobStatus(failed));
  }
  return json(toJobStatus(record));
};

// ---------------------------------------------------------------------------
// GET /api/config
// ---------------------------------------------------------------------------

export const handleConfig = (adapters: ProviderAdapters): Response =>
  json({
    providers: PROVIDERS.map((p) =>
      providerConfig(p, adapters[p].isConfigured()),
    ),
  } satisfies ConfigResponse);

// ---------------------------------------------------------------------------
// POST /api/preference
// ---------------------------------------------------------------------------

const PreferenceRequestSchema = z.object({
  comparisonId: z.string().regex(/^[A-Za-z0-9-]{1,64}$/),
  preferredJobId: z.string().regex(/^[A-Za-z0-9-]{1,64}$/),
});

export const handlePreference = async (
  req: Request,
  deps: { jobs: JsonStore; log: JsonStore; now?: () => Date },
): Promise<Response> => {
  const parsed = PreferenceRequestSchema.safeParse(await readBody(req));
  if (!parsed.success) {
    return apiError('The request was not in the expected format.', 400);
  }
  const outcome = await recordPreference(
    deps,
    parsed.data,
    deps.now?.() ?? new Date(),
  );
  if (!outcome.ok) return apiError(outcome.error, outcome.status);
  return json({ ok: true });
};

// ---------------------------------------------------------------------------
// generate-background
// ---------------------------------------------------------------------------

const BackgroundRequestSchema = z.object({ jobId: z.string().min(1) });

type GenerateDeps = {
  jobs: JsonStore;
  log: JsonStore;
  adapters: ProviderAdapters;
  now?: () => Date;
  pipeline?: Omit<PipelineDeps, 'adapters' | 'onProgress'>;
};

// Idempotent: Netlify retries a background function that throws, and the
// endpoint is public, so the job is claimed atomically and a job that is no
// longer queued is left alone. Nothing after the claim throws.
export const handleGenerate = async (
  req: Request,
  deps: GenerateDeps,
): Promise<Response> => {
  const clock = deps.now ?? (() => new Date());
  const parsed = BackgroundRequestSchema.safeParse(await readBody(req));
  if (!parsed.success) return apiError('Missing jobId.', 400);
  const started = clock();
  const queued = await claimJob(deps.jobs, parsed.data.jobId, started);
  if (!queued) return json({ skipped: true });
  let record: JobRecord = queued;

  let pipelineLog: Record<string, unknown> | null = null;
  try {
    const outcome = await runPipeline(
      {
        description: queued.description,
        provider: queued.provider,
        tier: queued.tier,
      },
      {
        ...deps.pipeline,
        adapters: deps.adapters,
        onProgress: async (steps) => {
          record = { ...record, steps };
          try {
            await writeJob(deps.jobs, record);
          } catch {
            // Progress is cosmetic; the final write carries the outcome.
          }
        },
      },
    );
    pipelineLog = outcome.log;
    record = {
      ...record,
      steps: outcome.steps,
      status: outcome.status,
      usage: outcome.usage,
      result: outcome.result,
      error: outcome.error,
      refusalHint: outcome.refusalHint,
    };
  } catch (error) {
    // runPipeline does not throw; this is a last-resort backstop.
    pipelineLog = {
      crash: error instanceof Error ? error.message : String(error),
    };
    record = {
      ...record,
      status: 'failed',
      error: PIPELINE_FAILURE_MESSAGE,
      steps: record.steps.map((s) =>
        s.state === 'active' ? { ...s, state: 'failed' } : s,
      ),
    };
  }
  const finished = clock();
  record = {
    ...record,
    finishedAt: finished.toISOString(),
    durationMs: finished.getTime() - started.getTime(),
  };
  // Two tries: a function retry would only skip the claimed job, so a lost
  // write loses the result. GET /api/jobs/:id reports a job that never got
  // its outcome written as failed once it is stale.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await writeJob(deps.jobs, record);
      break;
    } catch {
      // Try once more, then leave it to the stale check.
    }
  }

  // Bookkeeping must never turn a finished job into a retried one. Spend is
  // settled first and on its own, so a failed log write cannot lose it.
  try {
    await settleSpend(
      deps.jobs,
      record.spendDate ?? dayKey(finished),
      record.usage?.costUsd ?? 0,
      record.reservedUsd ?? 0,
    );
  } catch {
    // The reservation stays counted for the day: errs on the safe side.
  }
  try {
    const models = getStepModels(record.provider, record.tier);
    await writeLog(deps.log, {
      jobId: record.id,
      date: dayKey(new Date(record.createdAt)),
      createdAt: record.createdAt,
      finishedAt: record.finishedAt,
      description: record.description,
      provider: record.provider,
      tier: record.tier,
      models,
      status: record.status,
      error: record.error,
      pipeline: pipelineLog,
      usage: record.usage,
      durationMs: record.durationMs,
      comparisonId: record.comparisonId,
      preference: null,
    });
  } catch {
    // The job record is already final; a lost log line is acceptable.
  }
  return json({ status: record.status });
};
