import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CompareScreen } from '../screens/CompareScreen.tsx';
import type { CreateJobRequest } from '../shared/api.ts';
import {
  configResponse,
  describeCall,
  jobStatus,
  jsonResponse,
  sampleResult,
  succeededJob,
} from './fixtures.ts';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const openaiResult = () => {
  const result = sampleResult();
  return {
    ...result,
    attempts: 2,
    fixedIssues: ['A missing variable', 'An unknown input control'],
    summary: {
      ...result.summary,
      name: 'First-Year Friendships',
      stages: [
        { label: 'Introduction', type: 'Information' },
        { label: 'Friend details', type: 'AlterForm' },
      ],
      stageCount: 2,
    },
  };
};

describe('CompareScreen', () => {
  it('picks up comparison runs left running instead of starting new ones', async () => {
    const posts: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const { url, method } = describeCall(input, init);
        if (method === 'POST') {
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test double reading its own request
          const body = JSON.parse(String(init?.body)) as CreateJobRequest;
          posts.push(body.jobId);
          return jsonResponse({ jobId: body.jobId ?? 'job-new' });
        }
        if (url === '/api/jobs/job-a')
          return jsonResponse(jobStatus({ id: 'job-a', status: 'running' }));
        if (url === '/api/jobs/job-o')
          return jsonResponse(
            jobStatus({ id: 'job-o', provider: 'openai', status: 'running' }),
          );
        return jsonResponse({ error: 'unexpected' }, 500);
      }),
    );
    const reported = vi.fn();
    render(
      <CompareScreen
        description="Students name their friends."
        providers={configResponse(true).providers}
        resume={{
          description: 'Students name their friends.',
          comparisonId: 'cmp-1',
          jobIds: { anthropic: 'job-a', openai: 'job-o' },
        }}
        onUnfinished={reported}
        onNew={() => {}}
        onRefused={() => {}}
      />,
    );
    await waitFor(() =>
      expect(reported).toHaveBeenLastCalledWith({
        description: 'Students name their friends.',
        comparisonId: 'cmp-1',
        jobIds: { anthropic: 'job-a', openai: 'job-o' },
      }),
    );
    // the creates are sent again with the same ids, so no new job starts
    expect(new Set(posts)).toEqual(new Set(['job-a', 'job-o']));
  });

  it('keeps a finished side in the record while the other side runs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const { url, method } = describeCall(input, init);
        if (url === '/api/jobs' && method === 'POST') {
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test double reading its own request
          const body = JSON.parse(String(init?.body)) as CreateJobRequest;
          return jsonResponse({ jobId: `job-${body.provider}` });
        }
        if (url === '/api/jobs/job-anthropic')
          return jsonResponse(succeededJob({ id: 'job-anthropic' }));
        if (url === '/api/jobs/job-openai')
          return jsonResponse(
            jobStatus({
              id: 'job-openai',
              provider: 'openai',
              status: 'running',
            }),
          );
        return jsonResponse({ error: 'unexpected' }, 500);
      }),
    );
    const reported = vi.fn();
    render(
      <CompareScreen
        description="Students name their friends."
        providers={configResponse(true).providers}
        onUnfinished={reported}
        onNew={() => {}}
        onRefused={() => {}}
      />,
    );
    await waitFor(() =>
      expect(reported).toHaveBeenLastCalledWith(
        expect.objectContaining({
          jobIds: { anthropic: 'job-anthropic', openai: 'job-openai' },
        }),
      ),
    );
  });

  it('runs both providers with one comparison id and records the pick', async () => {
    const created: CreateJobRequest[] = [];
    const preferences: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const { url, method } = describeCall(input, init);
        if (url === '/api/jobs' && method === 'POST') {
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test double reading its own request
          const body = JSON.parse(String(init?.body)) as CreateJobRequest;
          created.push(body);
          return jsonResponse({ jobId: `job-${body.provider}` });
        }
        if (url === '/api/jobs/job-anthropic') {
          return jsonResponse(succeededJob({ id: 'job-anthropic' }));
        }
        if (url === '/api/jobs/job-openai') {
          return jsonResponse(
            succeededJob({
              id: 'job-openai',
              provider: 'openai',
              modelLabels: { design: 'GPT-6 Astra', wording: 'GPT-6 Luna' },
              durationMs: 52_000,
              usage: {
                inputTokens: 1,
                outputTokens: 1,
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
                costUsd: 0.16,
              },
              result: openaiResult(),
            }),
          );
        }
        if (url === '/api/preference' && method === 'POST') {
          preferences.push(JSON.parse(String(init?.body)));
          return jsonResponse({ ok: true });
        }
        return jsonResponse({ error: 'unexpected' }, 500);
      }),
    );

    render(
      <CompareScreen
        description="Students name their friends."
        providers={configResponse(true).providers}
        onUnfinished={() => {}}
        onNew={() => {}}
        onRefused={() => {}}
      />,
    );

    const claude = within(
      await screen.findByRole('article', { name: 'Claude' }),
    );
    const chatgpt = within(screen.getByRole('article', { name: 'ChatGPT' }));
    expect(await claude.findByText('Friendship and Wellbeing')).toBeTruthy();
    expect(await chatgpt.findByText('First-Year Friendships')).toBeTruthy();

    expect(created.map((r) => r.provider).toSorted()).toEqual([
      'anthropic',
      'openai',
    ]);
    expect(created[0]?.comparisonId).toBeTruthy();
    expect(created[0]?.comparisonId).toBe(created[1]?.comparisonId);

    expect(claude.getByText('$0.19')).toBeTruthy();
    expect(claude.getByText('First try')).toBeTruthy();
    expect(chatgpt.getByText('$0.16')).toBeTruthy();
    expect(chatgpt.getByText('1 retry')).toBeTruthy();
    expect(chatgpt.getByText('A missing variable')).toBeTruthy();
    // Claude has a name generator and a sociogram ChatGPT lacks; ChatGPT has
    // a per-alter form Claude lacks. Information is in both.
    expect(claude.getAllByText('Only here')).toHaveLength(2);
    expect(chatgpt.getAllByText('Only here')).toHaveLength(1);

    fireEvent.click(chatgpt.getByRole('button', { name: 'Prefer this one' }));
    await waitFor(() => expect(preferences).toHaveLength(1));
    expect(preferences[0]).toEqual({
      comparisonId: created[0]?.comparisonId,
      preferredJobId: 'job-openai',
    });
    expect(chatgpt.getByRole('button', { name: 'Preferred' })).toHaveProperty(
      'ariaPressed',
      'true',
    );
    expect(chatgpt.getByText('Your pick')).toBeTruthy();
  });

  it('restarts the elapsed clock when a run is tried again', async () => {
    let clock = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
    let openaiPosts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const { url, method } = describeCall(input, init);
        if (url === '/api/jobs' && method === 'POST') {
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test double reading its own request
          const body = JSON.parse(String(init?.body)) as CreateJobRequest;
          if (body.provider === 'anthropic')
            return jsonResponse({ jobId: 'job-anthropic' });
          openaiPosts += 1;
          return openaiPosts === 1
            ? jsonResponse({ error: 'The model is busy.' }, 503)
            : jsonResponse({ jobId: 'job-openai' });
        }
        if (url === '/api/jobs/job-anthropic')
          return jsonResponse(succeededJob({ id: 'job-anthropic' }));
        if (url === '/api/jobs/job-openai')
          return jsonResponse(
            jobStatus({ id: 'job-openai', provider: 'openai' }),
          );
        return jsonResponse({ error: 'unexpected' }, 500);
      }),
    );

    render(
      <CompareScreen
        description="Students name their friends."
        providers={configResponse(true).providers}
        onUnfinished={() => {}}
        onNew={() => {}}
        onRefused={() => {}}
      />,
    );
    const chatgpt = () =>
      within(screen.getByRole('article', { name: 'ChatGPT' }));
    expect(await chatgpt().findByText('The model is busy.')).toBeTruthy();

    clock += 150_000;
    fireEvent.click(chatgpt().getByRole('button', { name: 'Try again' }));
    expect(await chatgpt().findByText(/Elapsed/)).toBeTruthy();
    // Let useElapsed tick once.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(chatgpt().getByText('Elapsed 0:00')).toBeTruthy();
  });

  it('follows the same job again when trying after polling failed', async () => {
    let openaiPosts = 0;
    let reachable = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const { url, method } = describeCall(input, init);
        if (url === '/api/jobs' && method === 'POST') {
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test double reading its own request
          const body = JSON.parse(String(init?.body)) as CreateJobRequest;
          if (body.provider === 'anthropic')
            return jsonResponse({ jobId: 'job-anthropic' });
          // like the server: a create sent again with a known id is that job
          if (body.jobId !== 'job-openai') openaiPosts += 1;
          return jsonResponse({ jobId: 'job-openai' });
        }
        if (url === '/api/jobs/job-anthropic')
          return jsonResponse(succeededJob({ id: 'job-anthropic' }));
        if (url === '/api/jobs/job-openai')
          return reachable
            ? jsonResponse(jobStatus({ id: 'job-openai', provider: 'openai' }))
            : jsonResponse({ error: 'Sketch lost the connection.' }, 503);
        return jsonResponse({ error: 'unexpected' }, 500);
      }),
    );

    render(
      <CompareScreen
        description="Students name their friends."
        providers={configResponse(true).providers}
        onUnfinished={() => {}}
        onNew={() => {}}
        onRefused={() => {}}
      />,
    );
    const chatgpt = () =>
      within(screen.getByRole('article', { name: 'ChatGPT' }));
    expect(
      await chatgpt().findByText(
        'Sketch lost the connection.',
        {},
        { timeout: 8000 },
      ),
    ).toBeTruthy();

    reachable = true;
    fireEvent.click(chatgpt().getByRole('button', { name: 'Try again' }));
    expect(await chatgpt().findByText(/Elapsed/)).toBeTruthy();
    expect(openaiPosts).toBe(1);
  }, 15_000);
});
