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
  tier: 'standard',
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
      dailyBudgetUsd(undefined) - estimateJobCostUsd('anthropic', 'standard'),
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
      reservedUsd: estimateJobCostUsd('anthropic', 'standard'),
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

  it('defaults to $20 a day', () => {
    expect(dailyBudgetUsd(undefined)).toBe(20);
    expect(dailyBudgetUsd('nonsense')).toBe(20);
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
      tier: 'standard',
      comparisonId: 'cmp-1',
      models: { design: 'claude-sonnet-5-5', wording: 'claude-haiku-5-5' },
      modelLabels: { design: 'Claude Sonnet 5.5' },
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
      (await handleCreateJob(post({ ...validRequest, tier: 'max' }), deps))
        .status,
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
    expect(response.status).toBe(502);
    expect((await readJob(jobs, 'job-2'))?.status).toBe('failed');
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
          pipeline: { buildOptions: { now: NOW } },
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
      models: { design: 'claude-sonnet-5-5' },
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
