// Starts a generation job and polls it until it finishes.
//
// POST /api/jobs, then GET /api/jobs/:id straight away and every 1.5 s after,
// until the job succeeds, fails or is refused. Polling gives up after four
// minutes, or after three requests in a row fail. Unmounting (or a new
// request) stops polling.

import { useEffect, useState } from 'react';

import { createJob, getJob } from '../api/client.ts';
import type { CreateJobRequest, JobStatus } from '../shared/api.ts';

export const POLL_INTERVAL_MS = 1500;
export const POLL_TIMEOUT_MS = 4 * 60 * 1000;
const MAX_CONSECUTIVE_FAILURES = 3;

export const TIMEOUT_MESSAGE =
  'Sketch is taking much longer than usual, so it stopped waiting. Please try again.';

export type JobRun = {
  jobId: string | null;
  job: JobStatus | null;
  // Set when Sketch could not start or follow the job. A job that ran and
  // failed reports through job.status and job.error instead.
  error: string | null;
};

const isFinished = (job: JobStatus | null): boolean =>
  job?.status === 'succeeded' ||
  job?.status === 'failed' ||
  job?.status === 'refused';

const EMPTY: JobRun = { jobId: null, job: null, error: null };

type Options = {
  pollIntervalMs?: number;
  timeoutMs?: number;
};

const messageOf = (error: unknown) =>
  error instanceof Error && error.message
    ? error.message
    : 'Sketch could not reach its server. Please try again.';

const isAbort = (error: unknown) =>
  error instanceof DOMException && error.name === 'AbortError';

// `request` is the identity of a run: pass a new object to start again.
export const useJobRun = (
  request: CreateJobRequest | null,
  {
    pollIntervalMs = POLL_INTERVAL_MS,
    timeoutMs = POLL_TIMEOUT_MS,
  }: Options = {},
): JobRun => {
  // State is tagged with the request it belongs to, so a new request reads
  // as a fresh run without resetting state inside the effect.
  const [state, setState] = useState<{
    request: CreateJobRequest | null;
    run: JobRun;
  }>({ request: null, run: EMPTY });

  useEffect(() => {
    if (!request) return;
    const setRun = (update: (current: JobRun) => JobRun) =>
      setState((current) => ({
        request,
        run: update(current.request === request ? current.run : EMPTY),
      }));

    const controller = new AbortController();
    const { signal } = controller;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    let failures = 0;

    const fail = (message: string) => {
      if (signal.aborted) return;
      setRun((current) => ({ ...current, error: message }));
    };

    const poll = async (jobId: string) => {
      if (signal.aborted) return;
      if (Date.now() - startedAt > timeoutMs) {
        fail(TIMEOUT_MESSAGE);
        return;
      }
      try {
        const job = await getJob(jobId, signal);
        if (signal.aborted) return;
        failures = 0;
        setRun(() => ({ jobId, job, error: null }));
        if (isFinished(job)) return;
      } catch (error) {
        if (isAbort(error) || signal.aborted) return;
        failures += 1;
        if (failures >= MAX_CONSECUTIVE_FAILURES) {
          fail(messageOf(error));
          return;
        }
      }
      timer = setTimeout(() => void poll(jobId), pollIntervalMs);
    };

    const start = async () => {
      try {
        const { jobId } = await createJob(request, signal);
        if (signal.aborted) return;
        setRun(() => ({ jobId, job: null, error: null }));
        await poll(jobId);
      } catch (error) {
        if (isAbort(error)) return;
        fail(messageOf(error));
      }
    };

    void start();

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [request, pollIntervalMs, timeoutMs]);

  return state.request === request ? state.run : EMPTY;
};
