// The two one-shot commands as an operator runs them: a process of their own,
// refused before they touch anything. What only the real process can show is
// what that refusal looks like on the terminal — the one sentence to act on,
// and nothing else — and that the exit code says it was a refusal.
import { describe, expect, it } from 'vitest';

import { startEntrypoint } from './support/entrypoint.ts';

/** The refusal each command prints with no database configured. */
const REFUSALS = {
  'src/migrate.ts':
    'DATABASE_URL is required for migrate: there is no database to create the schema in.',
  'src/rotate-secrets.ts':
    'DATABASE_URL is not set; there are no stored secrets to re-encrypt.',
} as const;

describe.each(Object.entries(REFUSALS))(
  'the %s command with no database',
  (entry, refusal) => {
    it('prints the refusal alone and exits 1', async () => {
      // Mutation: drop `disableErrorReporting` from the entry, or
      // `reportingRefusals` from the program — the sentence arrives wrapped
      // in the runtime's report (a timestamp, `ERROR (#1)`, the class name, a
      // stack), or twice, and the equality below fails.
      const command = startEntrypoint(entry, { DATABASE_URL: '' });
      try {
        const { code, signal } = await command.exited;
        expect({ code, signal }).toEqual({ code: 1, signal: null });
        expect(command.output().trim()).toBe(refusal);
      } finally {
        command.child.kill('SIGKILL');
      }
    });
  },
);
