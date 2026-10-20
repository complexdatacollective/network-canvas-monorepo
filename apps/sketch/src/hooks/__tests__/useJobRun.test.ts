import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  describeCall,
  jobStatus,
  jsonResponse,
  stepsAt,
  succeededJob,
} from '../../__tests__/fixtures.ts';
import type { CreateJobRequest, JobStatus } from '../../shared/api.ts';
import {
  POLL_INTERVAL_MS,
  POLL_TIMEOUT_MS,
  TIMEOUT_MESSAGE,
  useJobRun,
} from '../useJobRun.ts';

const request: CreateJobRequest = {
  description: 'Nurses on a ward name who they go to for advice.',
  provider: 'anthropic',
};

// Answers POST /api/jobs with job-1 and each GET with the next status in
// `statuses` (repeating the last one).
const mockServer = (statuses: (JobStatus | Error)[]) => {
  let polls = 0;
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const { url, method } = describeCall(input, init);
    if (method === 'POST' && url === '/api/jobs')
      return jsonResponse({ jobId: 'job-1' });
    if (method === 'GET' && url === '/api/jobs/job-1') {
      const next = statuses[Math.min(polls, statuses.length - 1)];
      polls += 1;
      if (next instanceof Error) throw next;
      return jsonResponse(next);
    }
    return jsonResponse({ error: 'unexpected' }, 500);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, polls: () => polls };
};

// Let pending fetch promises and state updates settle.
const flush = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useJobRun', () => {
  it('creates the job, polls every 1.5 s and stops when it succeeds', async () => {
    const done = succeededJob();
    const server = mockServer([
      jobStatus({ steps: stepsAt(1) }),
      jobStatus({ steps: stepsAt(3) }),
      done,
    ]);

    const { result } = renderHook(() => useJobRun(request));
    await flush();

    const [, firstInit] = server.fetchMock.mock.calls[0] ?? [];
    expect(firstInit?.method).toBe('POST');
    expect(JSON.parse(String(firstInit?.body))).toEqual({
      ...request,
      jobId: expect.any(String),
    });
    expect(result.current.jobId).toBe('job-1');
    expect(server.polls()).toBe(1);
    expect(
      result.current.job?.steps.filter((s) => s.state === 'done'),
    ).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS - 1);
    });
    expect(server.polls()).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(server.polls()).toBe(2);
    expect(
      result.current.job?.steps.filter((s) => s.state === 'done'),
    ).toHaveLength(3);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(server.polls()).toBe(3);
    expect(result.current.job?.status).toBe('succeeded');
    expect(result.current.error).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 5);
    });
    expect(server.polls()).toBe(3);
  });

  it('reports the job id before the create answers, and keeps it if the answer is lost', async () => {
    let posted = '';
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test double reading its own request
      posted = (JSON.parse(String(init?.body)) as { jobId: string }).jobId;
      throw new TypeError('network down');
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useJobRun(request));
    await flush();
    expect(posted).not.toBe('');
    expect(result.current.jobId).toBe(posted);
    expect(result.current.error).not.toBeNull();
  });

  it('keeps the job id when the create fails on the server side', async () => {
    let posted = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: unknown, init?: RequestInit) => {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test double reading its own request
        posted = (JSON.parse(String(init?.body)) as { jobId: string }).jobId;
        return new Response(JSON.stringify({ error: 'Try again.' }), {
          status: 502,
        });
      }),
    );
    const { result } = renderHook(() => useJobRun(request));
    await flush();
    expect(result.current.jobId).toBe(posted);
    expect(result.current.error).toBe('Try again.');
  });

  it('drops the job id when the server refuses the create', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'Budget spent.' }), {
            status: 429,
          }),
      ),
    );
    const { result } = renderHook(() => useJobRun(request));
    await flush();
    expect(result.current.jobId).toBeNull();
    expect(result.current.error).toBe('Budget spent.');
  });

  it('waits longer than the server can run a job', () => {
    expect(POLL_TIMEOUT_MS).toBeGreaterThan(15 * 60 * 1000);
  });

  it('stops after POLL_TIMEOUT_MS with an error', async () => {
    const server = mockServer([jobStatus()]);
    const { result } = renderHook(() => useJobRun(request));
    await flush();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_TIMEOUT_MS + POLL_INTERVAL_MS * 2);
    });
    expect(result.current.error).toBe(TIMEOUT_MESSAGE);
    const polls = server.polls();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 5);
    });
    expect(server.polls()).toBe(polls);
  });

  it('gives up at the deadline even when a poll never answers', async () => {
    let aborted = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const { method } = describeCall(input, init);
        if (method === 'POST') return jsonResponse({ jobId: 'job-1' });
        // A stalled connection: never settles until aborted.
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            aborted = true;
            reject(new DOMException('aborted', 'AbortError'));
          });
        });
      }),
    );
    const { result } = renderHook(() => useJobRun(request));
    await flush();
    expect(result.current.error).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_TIMEOUT_MS + 1);
    });
    expect(result.current.error).toBe(TIMEOUT_MESSAGE);
    expect(aborted).toBe(true);
  });

  it('gives up at the deadline even when creating the job never answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: unknown, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      ),
    );
    const { result } = renderHook(() => useJobRun(request));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_TIMEOUT_MS + 1);
    });
    expect(result.current.error).toBe(TIMEOUT_MESSAGE);
  });

  it('rides out a failed poll but gives up after three in a row', async () => {
    const server = mockServer([
      new TypeError('offline'),
      jobStatus(),
      new TypeError('offline'),
    ]);
    const { result } = renderHook(() => useJobRun(request));
    await flush();
    expect(result.current.error).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(result.current.job?.status).toBe('running');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
    });
    expect(server.polls()).toBe(5);
    expect(result.current.error).toMatch(/could not reach/);
  });

  it('reports a job that could not be created', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ error: 'Sketch has used up today’s budget.' }, 429),
      ),
    );
    const { result } = renderHook(() => useJobRun(request));
    await flush();
    expect(result.current.error).toBe('Sketch has used up today’s budget.');
  });

  it('stops polling on unmount', async () => {
    const server = mockServer([jobStatus()]);
    const { unmount } = renderHook(() => useJobRun(request));
    await flush();
    expect(server.polls()).toBe(1);
    unmount();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 4);
    expect(server.polls()).toBe(1);
  });

  it('does nothing without a request', async () => {
    const server = mockServer([jobStatus()]);
    const { result } = renderHook(() => useJobRun(null));
    await flush();
    expect(server.fetchMock).not.toHaveBeenCalled();
    expect(result.current).toEqual({ jobId: null, job: null, error: null });
  });
});
