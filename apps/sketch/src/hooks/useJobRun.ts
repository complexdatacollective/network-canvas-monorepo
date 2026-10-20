// Starts a generation job and polls it until it finishes.
//
// POST /api/jobs, then GET /api/jobs/:id straight away and every 1.5 s after,
// until the job succeeds, fails or is refused. Polling gives up after
// POLL_TIMEOUT_MS (even if a request hangs), or after three requests in a
// row fail. Unmounting (or a new request) stops polling. With `resumeJobId`
// it skips the POST and follows a job that is already running.

import { useEffect, useState } from 'react';

import { createJob, getJob } from '../api/client.ts';
import type { CreateJobRequest, JobStatus } from '../shared/api.ts';

export const POLL_INTERVAL_MS = 1500;
// Must stay above the longest a job can run on the server: the background
// function's 15-minute ceiling, and the pipeline's worst case (screening 1 min
// + design 6 min + design retry 6 min + wording 2 min). Giving up sooner
// abandons a run the server still finishes and bills.
export const POLL_TIMEOUT_MS = 16 * 60 * 1000;
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
  // A job created earlier for this request, followed instead of a new one.
  resumeJobId?: string | null;
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
    resumeJobId = null,
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
    let finished = false;

    const fail = (message: string) => {
      if (signal.aborted) return;
      setRun((current) => ({ ...current, error: message }));
    };

    // The per-poll check below never runs again if a request hangs, so one
    // deadline covers the whole run. The error is set before aborting
    // because fail() ignores calls after abort.
    const deadline = setTimeout(() => {
      if (finished) return;
      fail(TIMEOUT_MESSAGE);
      controller.abort();
      clearTimeout(timer);
    }, timeoutMs);

    const settle = () => {
      finished = true;
      clearTimeout(deadline);
    };

    const poll = async (jobId: string) => {
      if (signal.aborted) return;
      if (Date.now() - startedAt > timeoutMs) {
        settle();
        fail(TIMEOUT_MESSAGE);
        return;
      }
      try {
        const job = await getJob(jobId, signal);
        if (signal.aborted) return;
        failures = 0;
        setRun(() => ({ jobId, job, error: null }));
        if (isFinished(job)) {
          settle();
          return;
        }
      } catch (error) {
        if (isAbort(error) || signal.aborted) return;
        failures += 1;
        if (failures >= MAX_CONSECUTIVE_FAILURES) {
          settle();
          fail(messageOf(error));
          return;
        }
      }
      timer = setTimeout(() => void poll(jobId), pollIntervalMs);
    };

    const start = async () => {
      try {
        const { jobId } = resumeJobId
          ? { jobId: resumeJobId }
          : await createJob(request, signal);
        if (signal.aborted) return;
        setRun(() => ({ jobId, job: null, error: null }));
        await poll(jobId);
      } catch (error) {
        if (isAbort(error)) return;
        settle();
        fail(messageOf(error));
      }
    };

    void start();

    return () => {
      controller.abort();
      clearTimeout(timer);
      clearTimeout(deadline);
    };
  }, [request, pollIntervalMs, timeoutMs, resumeJobId]);

  return state.request === request ? state.run : EMPTY;
};
