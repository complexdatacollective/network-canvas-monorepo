import type { JobQueueName } from '@codaco/studio-sync/jobs';

// One line per job outcome, which is the whole of #1895's observability:
// structured logging, metrics and a dashboard are the observability aspect of
// #1243. The line names the queue and the job id so a reported failure can be
// traced to a row without reading the job table, which the application role
// cannot do anyway.

export type JobOutcome =
  /** The handler did the work. */
  | 'completed'
  /** The work was no longer wanted — the row it names is already settled. */
  | 'suppressed'
  /** The attempt failed and pg-boss will make another. */
  | 'retrying'
  /** The last attempt failed; a queue with a dead letter also has a copy. */
  | 'failed'
  /**
   * The side effect may have happened and Studio could not record that it
   * did. Terminal for automatic dispatch (#1305, #1307): retrying could
   * duplicate it, so a person decides.
   */
  | 'uncertain';

export type JobOutcomeRecord = {
  queue: JobQueueName;
  jobId: string;
  outcome: JobOutcome;
  /** 1 on the first try; pg-boss counts retries from 0. */
  attempt: number;
  error?: unknown;
};

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function logJobOutcome({
  queue,
  jobId,
  outcome,
  attempt,
  error,
}: JobOutcomeRecord): void {
  const line = [
    `job ${queue} ${jobId} ${outcome} (attempt ${attempt})`,
    error === undefined ? '' : `: ${describe(error)}`,
  ].join('');

  // The two outcomes nothing will retry are the ones an operator has to see:
  // a failed job needs a re-send, and an uncertain one needs a decision.
  if (outcome === 'failed' || outcome === 'uncertain') {
    // oxlint-disable-next-line no-console -- background worker diagnostics
    console.error(line);
    return;
  }
  // oxlint-disable-next-line no-console -- background worker diagnostics
  console.log(line);
}
