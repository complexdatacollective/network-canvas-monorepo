// What a handler is allowed to know about the job it was handed.
//
// Not pg-boss's own `JobWithMetadata`: importing it here would put pg-boss in
// every handler module, and the source policy keeps that import to the four
// modules that construct or drive an instance (src/jobs/__tests__/source-policy.test.ts).
// The shape below is a subset of pg-boss's, so a handler typed against it is
// still accepted by `work()` — structurally, without the import.

/**
 * `data` is `unknown` deliberately: what pg-boss hands back is whatever JSON
 * the job row holds, and the queue's zod schema is the only thing entitled to
 * say it is a payload. A handler that took a typed payload would be trusting
 * a column the enqueue path validated on the way in but nothing revalidates on
 * the way out — including a row written by an older release of this server.
 */
export type HandledJob = {
  id: string;
  data: unknown;
  /** 0 on the first attempt; pg-boss counts retries, not attempts. */
  retryCount: number;
  /** Needs `includeMetadata: true`; without it a handler cannot tell a retry from the last try. */
  retryLimit: number;
};
