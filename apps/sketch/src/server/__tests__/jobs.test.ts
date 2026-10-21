// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import type { JobStatus } from '../../shared/api.ts';
import {
  friendshipDescription,
  friendshipDesign,
  friendshipWording,
} from '../design/__fixtures__/example.ts';
import {
  handleConfig,
  handleCreateJob,
  handleGenerate,
  handleGetJob,
  handlePreference,
} from '../handlers.ts';
import {
  addSpend,
  BUDGET_EXCEEDED_MESSAGE,
  checkBudget,
  claimJob,
  dailyBudgetUsd,
  type JobRecord,
  type LogEntry,
  readJob,
  reserveBudget,
  settleSpend,
  STALE_JOB_MS,
  writeJob,
} from '../jobs.ts';
import { estimateJobCostUsd } from '../pipeline.ts';
import {
  memoryStore,
  reply,
  scriptedAdapter,
  STUDY_SCREENING,
} from './fakes.ts';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const post = (body: unknown) =>
  new Request('https://sketch.test/api/jobs', {
    method: 'POST',
    body: JSON.stringify(body),
  });
const validRequest = {
  description: friendshipDescription,
  provider: 'anthropic',
};

describe('budget guard', () => {
  it('allows spending until the daily limit, per day', async () => {
    const store = memoryStore();
    await expect(checkBudget(store, NOW, 1)).resolves.toMatchObject({
      ok: true,
      spentUsd: 0,
    });
    await addSpend(store, NOW, 0.6);
    await addSpend(store, NOW, 0.5);
    await expect(checkBudget(store, NOW, 1)).resolves.toEqual({
      ok: false,
      spentUsd: 1.1,
      limitUsd: 1,
      error: BUDGET_EXCEEDED_MESSAGE,
    });
    const tomorrow = new Date('2026-10-21T00:00:01.000Z');
    await expect(checkBudget(store, tomorrow, 1)).resolves.toMatchObject({
      ok: true,
    });
    expect(store.data.get('spend/2026-10-20')).toEqual({
      date: '2026-10-20',
      costUsd: 1.1,
      pendingUsd: 0,
      jobs: 2,
    });
  });

  it('reserves the worst case of jobs in flight and settles it', async () => {
    const store = memoryStore();
    const reserve = () => reserveBudget(store, NOW, 0.4, 1);
    await expect(reserve()).resolves.toEqual({
      ok: true,
      spendDate: '2026-10-20',
    });
    await expect(reserve()).resolves.toMatchObject({ ok: true });
    // 0.8 reserved: a third worst case would pass the limit.
    await expect(reserve()).resolves.toEqual({
      ok: false,
      error: BUDGET_EXCEEDED_MESSAGE,
    });
    await expect(checkBudget(store, NOW, 1, 0.4)).resolves.toMatchObject({
      ok: false,
      spentUsd: 0.8,
    });
    await settleSpend(store, '2026-10-20', 0.1, 0.4);
    expect(store.data.get('spend/2026-10-20')).toEqual({
      date: '2026-10-20',
      costUsd: 0.1,
      pendingUsd: 0.4,
      jobs: 1,
    });
    await expect(reserve()).resolves.toMatchObject({ ok: true });
  });

  it('lets a lone job run when one worst case exceeds the limit', async () => {
    const store = memoryStore();
    await expect(reserveBudget(store, NOW, 2, 1)).resolves.toMatchObject({
      ok: true,
    });
    await expect(reserveBudget(store, NOW, 2, 1)).resolves.toMatchObject({
      ok: false,
    });
  });

  it('stops concurrent jobs that the remaining budget cannot cover', async () => {
    const jobs = memoryStore();
    await addSpend(
      jobs,
      NOW,
      dailyBudgetUsd(undefined) - estimateJobCostUsd('anthropic'),
    );
    let n = 0;
    const deps = {
      jobs,
      adapters: scriptedAdapter({}).adapters,
      startBackground: async () => {},
      now: () => NOW,
      newId: () => `job-${++n}`,
    };
    const statuses = await Promise.all(
      [1, 2, 3].map(
        async () => (await handleCreateJob(post(validRequest), deps)).status,
      ),
    );
    expect(statuses.sort((a, b) => a - b)).toEqual([202, 429, 429]);
    expect(await readJob(jobs, 'job-1')).toMatchObject({
      reservedUsd: estimateJobCostUsd('anthropic'),
      spendDate: '2026-10-20',
    });
  });

  it('hands the reservation back when the job cannot start', async () => {
    const jobs = memoryStore();
    await handleCreateJob(post(validRequest), {
      jobs,
      adapters: scriptedAdapter({}).adapters,
      startBackground: async () => {
        throw new Error('502');
      },
      now: () => NOW,
    });
    expect(jobs.data.get('spend/2026-10-20')).toMatchObject({
      costUsd: 0,
      pendingUsd: 0,
    });
  });

  it('defaults to $50 a day', () => {
    expect(dailyBudgetUsd(undefined)).toBe(50);
    expect(dailyBudgetUsd('nonsense')).toBe(50);
    expect(dailyBudgetUsd('12.5')).toBe(12.5);
  });

  it('rejects new jobs once the budget is spent', async () => {
    const jobs = memoryStore();
    await addSpend(jobs, NOW, 999);
    const startBackground = vi.fn(async () => {});
    const { adapters } = scriptedAdapter({});
    const response = await handleCreateJob(post(validRequest), {
      jobs,
      adapters,
      startBackground,
      now: () => NOW,
    });
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: BUDGET_EXCEEDED_MESSAGE,
    });
    expect(startBackground).not.toHaveBeenCalled();
  });
});

describe('POST /api/jobs', () => {
  it('queues the job and starts the background function', async () => {
    const jobs = memoryStore();
    const startBackground = vi.fn(async () => {});
    const { adapters } = scriptedAdapter({});
    const response = await handleCreateJob(
      post({ ...validRequest, comparisonId: 'cmp-1' }),
      { jobs, adapters, startBackground, now: () => NOW, newId: () => 'job-1' },
    );
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ jobId: 'job-1' });
    expect(startBackground).toHaveBeenCalledWith('job-1');
    const record = await readJob(jobs, 'job-1');
    expect(record).toMatchObject({
      status: 'queued',
      provider: 'anthropic',
      comparisonId: 'cmp-1',
      models: { design: 'claude-opus-5-5', wording: 'claude-haiku-5-5' },
      modelLabels: { design: 'Claude Opus 5.5' },
    });
    expect(record?.steps).toHaveLength(5);
  });

  it('rejects bad input and unconfigured providers', async () => {
    const deps = {
      jobs: memoryStore(),
      adapters: scriptedAdapter({}).adapters,
      startBackground: async () => {},
    };
    const short = await handleCreateJob(
      post({ ...validRequest, description: 'too short' }),
      deps,
    );
    expect(short.status).toBe(400);
    await expect(short.json()).resolves.toMatchObject({
      error: expect.stringContaining('at least'),
    });
    const tooLong = await handleCreateJob(
      post({ ...validRequest, description: 'x'.repeat(7000) }),
      deps,
    );
    expect(tooLong.status).toBe(400);
    expect(
      (
        await handleCreateJob(
          post({ ...validRequest, provider: 'gemini' }),
          deps,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handleCreateJob(
          new Request('https://sketch.test/api/jobs', {
            method: 'POST',
            body: '{',
          }),
          deps,
        )
      ).status,
    ).toBe(400);
    // The fake's openai adapter is not configured.
    expect(
      (
        await handleCreateJob(
          post({ ...validRequest, provider: 'openai' }),
          deps,
        )
      ).status,
    ).toBe(400);
  });

  it('marks the job failed when the background function will not start', async () => {
    const jobs = memoryStore();
    const response = await handleCreateJob(post(validRequest), {
      jobs,
      adapters: scriptedAdapter({}).adapters,
      startBackground: async () => {
        throw new Error('502');
      },
      newId: () => 'job-2',
    });
    // the client follows the id, reads the failure and starts afresh
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ jobId: 'job-2' });
    expect((await readJob(jobs, 'job-2'))?.status).toBe('failed');
  });

  it('keeps a job the background function claimed before its response was lost', async () => {
    const jobs = memoryStore();
    const response = await handleCreateJob(post(validRequest), {
      jobs,
      adapters: scriptedAdapter({}).adapters,
      startBackground: async (jobId) => {
        await claimJob(jobs, jobId, NOW);
        throw new Error('connection reset');
      },
      newId: () => 'job-3',
      now: () => NOW,
    });
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ jobId: 'job-3' });
    expect((await readJob(jobs, 'job-3'))?.status).toBe('running');
    // The running job keeps its reservation.
    expect(
      (jobs.data.get('spend/2026-10-20') as { pendingUsd: number }).pendingUsd,
    ).toBeGreaterThan(0);
  });
});

describe('POST /api/jobs sent again with the same job id', () => {
  it('reserves the cost once and starts a still-queued job again', async () => {
    const jobs = memoryStore();
    const startBackground = vi.fn(async () => {});
    const { adapters } = scriptedAdapter({});
    const jobId = '0b7f3c52-1d7e-4f0a-9a4e-3c2b1a0f9e8d';
    const send = () =>
      handleCreateJob(post({ ...validRequest, jobId }), {
        jobs,
        adapters,
        startBackground,
        now: () => NOW,
      });
    const pending = () =>
      (jobs.data.get('spend/2026-10-20') as { pendingUsd: number }).pendingUsd;
    const first = await send();
    const once = pending();
    const second = await send();
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(await second.json()).toEqual({ jobId });
    // Still queued: the first background start may never have happened.
    expect(startBackground).toHaveBeenCalledTimes(2);
    expect(once).toBeGreaterThan(0);
    expect(pending()).toBe(once);
  });

  it('does not start a job again once the background run has claimed it', async () => {
    const jobs = memoryStore();
    const startBackground = vi.fn(async (id: string) => {
      await claimJob(jobs, id, NOW);
    });
    const { adapters } = scriptedAdapter({});
    const jobId = '0b7f3c52-1d7e-4f0a-9a4e-3c2b1a0f9e8d';
    const send = () =>
      handleCreateJob(post({ ...validRequest, jobId }), {
        jobs,
        adapters,
        startBackground,
        now: () => NOW,
      });
    await send();
    const second = await send();
    expect(second.status).toBe(202);
    expect(startBackground).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/jobs sent again on a later day', () => {
  it('fails a still-queued job instead of starting it against the old day', async () => {
    const jobs = memoryStore();
    const startBackground = vi.fn(async () => {});
    const { adapters } = scriptedAdapter({});
    const jobId = '0b7f3c52-1d7e-4f0a-9a4e-3c2b1a0f9e8d';
    const send = (now: Date) =>
      handleCreateJob(post({ ...validRequest, jobId }), {
        jobs,
        adapters,
        startBackground,
        now: () => now,
      });
    await send(NOW);
    const next = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    const second = await send(next);
    expect(second.status).toBe(202);
    expect(startBackground).toHaveBeenCalledTimes(1);
    expect((await readJob(jobs, jobId))?.status).toBe('failed');
    expect(jobs.data.get('spend/2026-10-20')).toMatchObject({ pendingUsd: 0 });
  });
});

describe('POST /api/jobs when the job record cannot be written', () => {
  it('hands the reservation back', async () => {
    const jobs = memoryStore();
    const setJSON = jobs.setJSON;
    jobs.setJSON = async (key, value) => {
      if (key.startsWith('jobs/')) throw new Error('down');
      await setJSON(key, value);
    };
    const updateJSON = jobs.updateJSON;
    jobs.updateJSON = async (key, next) => {
      if (key.startsWith('jobs/')) throw new Error('down');
      return updateJSON(key, next);
    };
    const startBackground = vi.fn(async () => {});
    const { adapters } = scriptedAdapter({});
    const response = await handleCreateJob(post(validRequest), {
      jobs,
      adapters,
      startBackground,
      now: () => NOW,
    });
    expect(response.status).toBe(502);
    expect(startBackground).not.toHaveBeenCalled();
    expect(jobs.data.get('spend/2026-10-20')).toMatchObject({
      pendingUsd: 0,
    });
  });
});

describe('generate-background and GET /api/jobs/:id', () => {
  const setup = async () => {
    const jobs = memoryStore();
    const log = memoryStore();
    const fake = scriptedAdapter({
      screening: [reply(STUDY_SCREENING)],
      study_design: [reply(friendshipDesign)],
      wording: [reply(friendshipWording)],
    });
    await handleCreateJob(post({ ...validRequest, comparisonId: 'cmp-9' }), {
      jobs,
      adapters: fake.adapters,
      startBackground: async () => {},
      now: () => NOW,
      newId: () => 'job-9',
    });
    const generate = (logStore = log) =>
      handleGenerate(
        new Request(
          'https://sketch.test/.netlify/functions/generate-background',
          {
            method: 'POST',
            body: JSON.stringify({ jobId: 'job-9' }),
          },
        ),
        {
          jobs,
          log: logStore,
          adapters: fake.adapters,
          now: () => NOW,
          pipeline: { buildOptions: { now: NOW }, review: false },
        },
      );
    return { jobs, log, fake, generate };
  };

  it('runs the job once, then writes the status, log and spend', async () => {
    const { jobs, log, fake, generate } = await setup();
    await generate();
    // A retried invocation finds the job no longer queued.
    await generate();
    expect(fake.requests).toHaveLength(3);

    const response = await handleGetJob('job-9', { jobs });
    const status = (await response.json()) as JobStatus;
    expect(status.status).toBe('succeeded');
    expect(status.result?.attempts).toBe(1);
    expect(status.usage?.costUsd).toBeGreaterThan(0);
    expect(status.finishedAt).toBe(NOW.toISOString());
    expect(status).not.toHaveProperty('description');

    const entry = log.data.get('log/2026-10-20/job-9') as LogEntry;
    expect(entry).toMatchObject({
      jobId: 'job-9',
      description: friendshipDescription,
      provider: 'anthropic',
      status: 'succeeded',
      comparisonId: 'cmp-9',
      models: { design: 'claude-opus-5-5' },
      pipeline: { protocolValid: true },
    });
    expect(jobs.data.get('spend/2026-10-20')).toEqual({
      date: '2026-10-20',
      costUsd: status.usage?.costUsd,
      // The reservation made at POST is released.
      pendingUsd: 0,
      jobs: 1,
    });
  });

  it('runs the paid pipeline once when invoked twice at the same time', async () => {
    const { fake, generate } = await setup();
    const results = await Promise.all([generate(), generate()]);
    expect(fake.requests).toHaveLength(3);
    const bodies = await Promise.all(results.map((r) => r.json()));
    expect(bodies).toContainEqual({ skipped: true });
  });

  it('settles spend even when the research log cannot be written', async () => {
    const { jobs, generate } = await setup();
    const broken = memoryStore();
    broken.setJSON = async () => {
      throw new Error('blobs down');
    };
    const response = await generate(broken);
    expect(response.status).toBe(200);
    const record = await readJob(jobs, 'job-9');
    expect(record?.status).toBe('succeeded');
    expect(jobs.data.get('spend/2026-10-20')).toMatchObject({
      costUsd: record?.usage?.costUsd,
      pendingUsd: 0,
    });
  });

  it('reports a job whose background run died as failed once stale', async () => {
    const { jobs } = await setup();
    const queued = (await readJob(jobs, 'job-9')) as JobRecord;
    const startedAt = NOW.toISOString();
    await writeJob(jobs, {
      ...queued,
      status: 'running',
      startedAt,
      steps: queued.steps.map((s, i) =>
        i === 1 ? { ...s, state: 'active' } : s,
      ),
    });
    const at = (ms: number) => () => new Date(NOW.getTime() + ms);
    const read = async (ms: number) =>
      (await (
        await handleGetJob('job-9', { jobs, now: at(ms) })
      ).json()) as JobStatus;

    expect((await read(10 * 60_000)).status).toBe('running');
    const stale = await read(STALE_JOB_MS + 1);
    expect(stale.status).toBe('failed');
    expect(stale.error).toMatch(/Something went wrong/);
    expect(stale.steps[1]?.state).toBe('failed');
    expect(stale).not.toHaveProperty('startedAt');
    // Written back, so a background retry cannot pick the job up again.
    expect((await readJob(jobs, 'job-9'))?.status).toBe('failed');
  });

  it('keeps polling a stale job whose failure could not be stored', async () => {
    const { jobs } = await setup();
    const queued = (await readJob(jobs, 'job-9')) as JobRecord;
    await writeJob(jobs, {
      ...queued,
      status: 'running',
      startedAt: NOW.toISOString(),
    });
    jobs.updateJSON = async () => {
      throw new Error('blobs down');
    };
    const response = await handleGetJob('job-9', {
      jobs,
      now: () => new Date(NOW.getTime() + STALE_JOB_MS + 1),
    });
    expect(response.status).toBe(503);
    expect((await readJob(jobs, 'job-9'))?.status).toBe('running');
  });

  it('keeps a stale job that a delayed background run claims mid-check', async () => {
    const { jobs } = await setup();
    const late = new Date(NOW.getTime() + STALE_JOB_MS + 1);
    // The background run claims the queued job between the stale check's
    // read and its write.
    const racing: typeof jobs = {
      ...jobs,
      updateJSON: async (key, next) => {
        await claimJob(jobs, 'job-9', late);
        return jobs.updateJSON(key, next);
      },
    };
    const status = (await (
      await handleGetJob('job-9', { jobs: racing, now: () => late })
    ).json()) as JobStatus;
    expect(status.status).toBe('running');
    expect((await readJob(jobs, 'job-9'))?.status).toBe('running');
  });

  it('records a preference against the compared job', async () => {
    const { jobs, log, generate } = await setup();
    await generate();
    const pick = (body: unknown) =>
      handlePreference(
        new Request('https://sketch.test/api/preference', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
        { jobs, log, now: () => NOW },
      );
    expect(
      (await pick({ comparisonId: 'other', preferredJobId: 'job-9' })).status,
    ).toBe(404);
    expect(
      (await pick({ comparisonId: 'cmp-9', preferredJobId: 'job-9' })).status,
    ).toBe(200);
    expect(log.data.get('preference/cmp-9')).toEqual({
      comparisonId: 'cmp-9',
      preferredJobId: 'job-9',
      at: NOW.toISOString(),
    });
    expect(
      (log.data.get('log/2026-10-20/job-9') as LogEntry).preference,
    ).toEqual({ preferred: true, at: NOW.toISOString() });
  });

  it('tries the final job write again when it fails once', async () => {
    const { jobs, generate } = await setup();
    const setJSON = jobs.setJSON;
    let failed = false;
    jobs.setJSON = async (key, value) => {
      const status = (value as { status?: string } | null)?.status;
      if (!failed && key === 'jobs/job-9' && status === 'succeeded') {
        failed = true;
        throw new Error('transient');
      }
      await setJSON(key, value);
    };
    await generate();
    expect(failed).toBe(true);
    expect((await readJob(jobs, 'job-9'))?.status).toBe('succeeded');
  });

  it('logs an outcome the researcher never received as failed', async () => {
    const { jobs, log, generate } = await setup();
    const setJSON = jobs.setJSON;
    jobs.setJSON = async (key, value) => {
      const status = (value as { status?: string } | null)?.status;
      if (key === 'jobs/job-9' && status === 'succeeded')
        throw new Error('down');
      await setJSON(key, value);
    };
    await generate();
    expect(log.data.get('log/2026-10-20/job-9')).toMatchObject({
      status: 'failed',
      pipeline: { protocolValid: true, undeliveredStatus: 'succeeded' },
    });
  });

  it('writes the log before the job reads as finished', async () => {
    const { jobs, log, generate } = await setup();
    const setJSON = jobs.setJSON;
    let loggedFirst: boolean | undefined;
    jobs.setJSON = async (key, value) => {
      const status = (value as { status?: string } | null)?.status;
      if (key === 'jobs/job-9' && status === 'succeeded')
        loggedFirst = log.data.has('log/2026-10-20/job-9');
      await setJSON(key, value);
    };
    await generate();
    expect(loggedFirst).toBe(true);
  });

  it('clears the earlier pick when the preference changes', async () => {
    const { jobs, log, generate } = await setup();
    await generate();
    const first = (await readJob(jobs, 'job-9'))!;
    await writeJob(jobs, { ...first, id: 'job-10' });
    log.data.set('log/2026-10-20/job-10', {
      ...(log.data.get('log/2026-10-20/job-9') as LogEntry),
      jobId: 'job-10',
    });
    const pick = (preferredJobId: string) =>
      handlePreference(
        new Request('https://sketch.test/api/preference', {
          method: 'POST',
          body: JSON.stringify({ comparisonId: 'cmp-9', preferredJobId }),
        }),
        { jobs, log, now: () => NOW },
      );
    await pick('job-9');
    await pick('job-10');
    const entry = (id: string) =>
      (log.data.get(`log/2026-10-20/${id}`) as LogEntry).preference;
    expect(entry('job-9')).toBeNull();
    expect(entry('job-10')).toEqual({ preferred: true, at: NOW.toISOString() });
  });

  it('leaves one pick after a changed preference is retried', async () => {
    const { jobs, log, generate } = await setup();
    await generate();
    const first = (await readJob(jobs, 'job-9'))!;
    await writeJob(jobs, { ...first, id: 'job-10' });
    log.data.set('log/2026-10-20/job-10', {
      ...(log.data.get('log/2026-10-20/job-9') as LogEntry),
      jobId: 'job-10',
    });
    const pick = (preferredJobId: string) =>
      handlePreference(
        new Request('https://sketch.test/api/preference', {
          method: 'POST',
          body: JSON.stringify({ comparisonId: 'cmp-9', preferredJobId }),
        }),
        { jobs, log, now: () => NOW },
      );
    await pick('job-9');
    const setJSON = log.setJSON;
    let failOnce = true;
    log.setJSON = async (key, value) => {
      if (key === 'log/2026-10-20/job-9' && failOnce) {
        failOnce = false;
        throw new Error('blobs down');
      }
      await setJSON(key, value);
    };
    await pick('job-10').catch(() => {});
    await pick('job-10');
    const entry = (id: string) =>
      (log.data.get(`log/2026-10-20/${id}`) as LogEntry).preference;
    expect(entry('job-9')).toBeNull();
    expect(entry('job-10')).toEqual({ preferred: true, at: NOW.toISOString() });
  });

  it('adds a finished seed job to the comparison started from it', async () => {
    const { jobs, log, fake, generate } = await setup();
    await generate();
    const seed = (await readJob(jobs, 'job-9'))!;
    await writeJob(jobs, { ...seed, comparisonId: null });
    const seedKey = 'log/2026-10-20/job-9';
    log.data.set(seedKey, {
      ...(log.data.get(seedKey) as LogEntry),
      comparisonId: null,
    });
    await handleCreateJob(
      post({
        ...validRequest,
        provider: 'anthropic',
        comparisonId: 'cmp-new',
        seedJobId: 'job-9',
      }),
      {
        jobs,
        log,
        adapters: fake.adapters,
        startBackground: async () => {},
        now: () => NOW,
        newId: () => 'job-11',
      },
    );
    expect((await readJob(jobs, 'job-9'))?.comparisonId).toBe('cmp-new');
    expect((log.data.get(seedKey) as LogEntry).comparisonId).toBe('cmp-new');
    expect(
      (
        await handlePreference(
          new Request('https://sketch.test/api/preference', {
            method: 'POST',
            body: JSON.stringify({
              comparisonId: 'cmp-new',
              preferredJobId: 'job-9',
            }),
          }),
          { jobs, log, now: () => NOW },
        )
      ).status,
    ).toBe(200);
  });

  it('does not start a comparison whose seed could not join it', async () => {
    const { jobs, log, fake, generate } = await setup();
    await generate();
    const seed = (await readJob(jobs, 'job-9'))!;
    await writeJob(jobs, { ...seed, comparisonId: null });
    const updateJSON = jobs.updateJSON;
    jobs.updateJSON = async (key, next) => {
      if (key === 'jobs/job-9') throw new Error('blobs down');
      return updateJSON(key, next);
    };
    const res = await handleCreateJob(
      post({
        ...validRequest,
        provider: 'anthropic',
        comparisonId: 'cmp-new',
        seedJobId: 'job-9',
      }),
      {
        jobs,
        log,
        adapters: fake.adapters,
        startBackground: async () => {},
        now: () => NOW,
        newId: () => 'job-11',
      },
    );
    expect(res.status).toBe(503);
    expect((await readJob(jobs, 'job-11'))?.status).toBe('failed');
    expect(jobs.data.get('spend/2026-10-20')).toMatchObject({ pendingUsd: 0 });
  });

  it('does not start a comparison whose seed belongs to another one', async () => {
    const { jobs, log, fake, generate } = await setup();
    await generate();
    expect((await readJob(jobs, 'job-9'))?.comparisonId).toBe('cmp-9');
    const startBackground = vi.fn(async () => {});
    const res = await handleCreateJob(
      post({
        ...validRequest,
        provider: 'anthropic',
        comparisonId: 'cmp-new',
        seedJobId: 'job-9',
      }),
      {
        jobs,
        log,
        adapters: fake.adapters,
        startBackground,
        now: () => NOW,
        newId: () => 'job-11',
      },
    );
    expect(res.status).toBe(409);
    expect(startBackground).not.toHaveBeenCalled();
    expect((await readJob(jobs, 'job-11'))?.status).toBe('failed');
  });

  it('keeps a seed already in the comparison when a retry fails to start', async () => {
    const { jobs, log, fake, generate } = await setup();
    await generate();
    expect((await readJob(jobs, 'job-9'))?.comparisonId).toBe('cmp-9');
    const res = await handleCreateJob(
      post({
        ...validRequest,
        provider: 'anthropic',
        comparisonId: 'cmp-9',
        seedJobId: 'job-9',
      }),
      {
        jobs,
        log,
        adapters: fake.adapters,
        startBackground: async () => {
          throw new Error('502');
        },
        now: () => NOW,
        newId: () => 'job-12',
      },
    );
    expect(res.status).toBe(202);
    expect((await readJob(jobs, 'job-9'))?.comparisonId).toBe('cmp-9');
  });

  it('leaves the seed free when the comparison job is refused or fails to start', async () => {
    const { jobs, log, fake, generate } = await setup();
    await generate();
    const seed = (await readJob(jobs, 'job-9'))!;
    await writeJob(jobs, { ...seed, comparisonId: null });
    const create = (startBackground: () => Promise<void>) =>
      handleCreateJob(
        post({
          ...validRequest,
          provider: 'anthropic',
          comparisonId: 'cmp-new',
          seedJobId: 'job-9',
        }),
        {
          jobs,
          log,
          adapters: fake.adapters,
          startBackground,
          now: () => NOW,
          newId: () => 'job-11',
        },
      );
    await addSpend(jobs, NOW, 999);
    expect((await create(async () => {})).status).toBe(429);
    expect((await readJob(jobs, 'job-9'))?.comparisonId).toBeNull();
    jobs.data.delete('spend/2026-10-20');
    const res = await create(async () => {
      throw new Error('502');
    });
    expect(res.status).toBe(202);
    expect((await readJob(jobs, 'job-9'))?.comparisonId).toBeNull();
  });

  it('keeps a joined seed when tagging its log entry fails, and tags it when either run is preferred', async () => {
    const { jobs, log, fake, generate } = await setup();
    await generate();
    const seed = (await readJob(jobs, 'job-9'))!;
    await writeJob(jobs, { ...seed, comparisonId: null });
    const setJSON = log.setJSON;
    let failures = 1;
    log.setJSON = async (key, value) => {
      if (key === 'log/2026-10-20/job-9' && failures-- > 0)
        throw new Error('blobs down');
      return setJSON(key, value);
    };
    const res = await handleCreateJob(
      post({
        ...validRequest,
        provider: 'anthropic',
        comparisonId: 'cmp-new',
        seedJobId: 'job-9',
      }),
      {
        jobs,
        log,
        adapters: fake.adapters,
        startBackground: async () => {},
        now: () => NOW,
        newId: () => 'job-11',
      },
    );
    expect(res.status).toBe(202);
    expect((await readJob(jobs, 'job-9'))?.comparisonId).toBe('cmp-new');
    const seedKey = 'log/2026-10-20/job-9';
    // the tag failed, so the entry still names its earlier comparison
    expect((log.data.get(seedKey) as LogEntry).comparisonId).toBe('cmp-9');
    const preferred = await handlePreference(
      new Request('https://sketch.test/api/preference', {
        method: 'POST',
        body: JSON.stringify({
          comparisonId: 'cmp-new',
          preferredJobId: 'job-11',
        }),
      }),
      { jobs, log, now: () => NOW },
    );
    expect(preferred.status).toBe(200);
    expect((log.data.get(seedKey) as LogEntry).comparisonId).toBe('cmp-new');
  });

  it('joins the seed before restarting a queued comparison job', async () => {
    const { jobs, log, fake, generate } = await setup();
    await generate();
    const create = (
      extra: Record<string, string>,
      startBackground: () => Promise<void>,
    ) =>
      handleCreateJob(
        post({
          ...validRequest,
          provider: 'anthropic',
          comparisonId: 'cmp-new',
          ...extra,
        }),
        {
          jobs,
          log,
          adapters: fake.adapters,
          startBackground,
          now: () => NOW,
          newId: () => 'job-retry-0000000011',
        },
      );
    // a first create that stopped before its seed joined leaves job-11 queued
    expect((await create({}, async () => {})).status).toBe(202);
    expect((await readJob(jobs, 'job-retry-0000000011'))?.status).toBe(
      'queued',
    );
    // job-9 already belongs to cmp-9, so the retry cannot add it
    const start = vi.fn(async () => {});
    const taken = await create(
      { jobId: 'job-retry-0000000011', seedJobId: 'job-9' },
      start,
    );
    expect(taken.status).toBe(409);
    expect(start).not.toHaveBeenCalled();
    expect((await readJob(jobs, 'job-retry-0000000011'))?.status).toBe(
      'failed',
    );

    const seed = (await readJob(jobs, 'job-9'))!;
    await writeJob(jobs, { ...seed, comparisonId: null });
    jobs.data.delete('jobs/job-retry-0000000011');
    expect((await create({}, async () => {})).status).toBe(202);
    const joined = await create(
      { jobId: 'job-retry-0000000011', seedJobId: 'job-9' },
      start,
    );
    expect(joined.status).toBe(202);
    expect(start).toHaveBeenCalledWith('job-retry-0000000011');
    expect((await readJob(jobs, 'job-9'))?.comparisonId).toBe('cmp-new');
  });

  it('frees a seed a queued retry added when its start fails', async () => {
    const { jobs, log, fake, generate } = await setup();
    await generate();
    const seed = (await readJob(jobs, 'job-9'))!;
    await writeJob(jobs, { ...seed, comparisonId: null });
    const id = 'job-retry-0000000012';
    const create = (
      extra: Record<string, string>,
      startBackground: () => Promise<void>,
    ) =>
      handleCreateJob(
        post({
          ...validRequest,
          provider: 'anthropic',
          comparisonId: 'cmp-new',
          ...extra,
        }),
        {
          jobs,
          log,
          adapters: fake.adapters,
          startBackground,
          now: () => NOW,
          newId: () => id,
        },
      );
    expect((await create({}, async () => {})).status).toBe(202);
    const retry = { jobId: id, seedJobId: 'job-9' };
    const failed = await create(retry, async () => {
      throw new Error('502');
    });
    // the job is failed while still queued, so the seed is free again
    expect(failed.status).toBe(202);
    expect((await readJob(jobs, id))?.status).toBe('failed');
    expect((await readJob(jobs, 'job-9'))?.comparisonId).toBeNull();
  });

  it('keeps the seed when a retry fails to start a job another request started', async () => {
    const { jobs, log, fake, generate } = await setup();
    await generate();
    const seed = (await readJob(jobs, 'job-9'))!;
    await writeJob(jobs, { ...seed, comparisonId: null });
    const id = 'job-retry-0000000013';
    const deps = (startBackground: () => Promise<void>) => ({
      jobs,
      log,
      adapters: fake.adapters,
      startBackground,
      now: () => NOW,
      newId: () => id,
    });
    const body = {
      ...validRequest,
      provider: 'anthropic',
      comparisonId: 'cmp-new',
    };
    expect(
      (
        await handleCreateJob(
          post(body),
          deps(async () => {}),
        )
      ).status,
    ).toBe(202);
    // a concurrent retry claims the job just before this one's start fails
    const res = await handleCreateJob(
      post({ ...body, jobId: id, seedJobId: 'job-9' }),
      deps(async () => {
        const job = (await readJob(jobs, id))!;
        await writeJob(jobs, { ...job, status: 'running' });
        throw new Error('502');
      }),
    );
    expect(res.status).toBe(202);
    expect((await readJob(jobs, id))?.status).toBe('running');
    expect((await readJob(jobs, 'job-9'))?.comparisonId).toBe('cmp-new');
  });

  it('answers 404 for unknown jobs', async () => {
    expect((await handleGetJob('nope', { jobs: memoryStore() })).status).toBe(
      404,
    );
    expect((await handleGetJob('../x', { jobs: memoryStore() })).status).toBe(
      404,
    );
  });
});

describe('GET /api/config', () => {
  it('reports which providers are available', async () => {
    const response = handleConfig(scriptedAdapter({}).adapters);
    const body = (await response.json()) as {
      providers: { provider: string; available: boolean }[];
    };
    expect(body.providers.map((p) => [p.provider, p.available])).toEqual([
      ['anthropic', true],
      ['openai', false],
    ]);
  });
});
