// One line per job outcome is the whole of what a deployment sees, so which
// level a line is written at is the difference between an operator noticing
// mail that will never be sent and not noticing it.
import { afterEach, describe, expect, it, vi } from 'vitest';

import { logJobOutcome, type JobOutcome } from '../log.ts';

function captured(outcome: JobOutcome, error?: unknown) {
  const error_ = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  logJobOutcome({
    queue: 'invitation-delivery',
    jobId: 'a4f1c0de-0000-4000-8000-000000000001',
    outcome,
    attempt: 3,
    ...(error === undefined ? {} : { error }),
  });
  return {
    errors: error_.mock.calls.map((call) => String(call[0])),
    logs: log.mock.calls.map((call) => String(call[0])),
  };
}

describe('logJobOutcome', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['failed', 'uncertain'] as const)(
    'reports %s at error level',
    (outcome) => {
      const { errors, logs } = captured(outcome);
      expect(logs).toEqual([]);
      expect(errors).toEqual([
        `job invitation-delivery a4f1c0de-0000-4000-8000-000000000001 ${outcome} (attempt 3)`,
      ]);
    },
  );

  it.each(['completed', 'suppressed', 'retrying'] as const)(
    'reports %s at log level',
    (outcome) => {
      const { errors, logs } = captured(outcome);
      expect(errors).toEqual([]);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toContain(outcome);
    },
  );

  it('names the cause when there is one', () => {
    const { errors } = captured('failed', new Error('SMTP refused the sender'));
    expect(errors[0]).toContain(': SMTP refused the sender');
  });

  it('describes a thrown value that is not an Error', () => {
    const { errors } = captured('failed', 'connection reset');
    expect(errors[0]).toContain(': connection reset');
  });
});
