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
  type LogEntry,
  readJob,
} from '../jobs.ts';
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
      jobs: 2,
    });
  });

  it('defaults to $5 a day', () => {
    expect(dailyBudgetUsd(undefined)).toBe(5);
    expect(dailyBudgetUsd('nonsense')).toBe(5);
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
    const generate = () =>
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
          log,
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
    expect(
      (jobs.data.get('spend/2026-10-20') as { costUsd: number }).costUsd,
    ).toBe(status.usage?.costUsd);
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
