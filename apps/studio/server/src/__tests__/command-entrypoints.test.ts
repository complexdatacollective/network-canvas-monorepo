// The one-shot commands as an operator runs them: a process of their own,
// refused before they touch anything. What only the real process can show is
// what that refusal looks like on the terminal — the one sentence to act on,
// and nothing else — and that the exit code says it was a refusal.
import { describe, expect, it } from 'vitest';

import { startEntrypoint } from './support/entrypoint.ts';

/**
 * The refusal each command prints with no database configured, and the
 * arguments it is run with — `maintenance` needs a valid subcommand to get as
 * far as asking for a database.
 */
const REFUSALS = {
  'src/migrate.ts': {
    args: [],
    refusal:
      'DATABASE_URL is required for migrate: there is no database to create the schema in.',
  },
  'src/maintenance.ts': {
    args: ['on', 'Upgrading'],
    refusal:
      'DATABASE_URL is required for maintenance: there is no deployment to open or close.',
  },
  'src/rotate-secrets.ts': {
    args: [],
    refusal:
      'DATABASE_URL is not set; there are no stored secrets to re-encrypt.',
  },
} as const;

describe.each(Object.entries(REFUSALS))(
  'the %s command with no database',
  (entry, { args, refusal }) => {
    it('prints the refusal alone and exits 1', async () => {
      // Mutation: drop `disableErrorReporting` from the entry, or
      // `reportingRefusals` from the program — the sentence arrives wrapped
      // in the runtime's report (a timestamp, `ERROR (#1)`, the class name, a
      // stack), or twice, and the equality below fails.
      const command = startEntrypoint(entry, { DATABASE_URL: '' }, args);
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

describe('the maintenance command', () => {
  // Refused before the environment is read at all: a mistyped subcommand is
  // the operator's mistake whatever the deployment is, and the deploy script
  // (#1910) must see it as a failure rather than as a window opened with no
  // reason or closed by accident.
  it.each([
    [[] as string[], 'Usage: studio-api maintenance on [reason…] | off'],
    [['sideways'], 'Usage: studio-api maintenance on [reason…] | off'],
    [['off', 'now'], 'Usage: studio-api maintenance on [reason…] | off'],
    [
      ['on', '   '],
      'The maintenance reason must be 1 to 280 characters and not only whitespace.',
    ],
    [
      ['on', 'x'.repeat(281)],
      'The maintenance reason must be 1 to 280 characters and not only whitespace.',
    ],
  ])('refuses %j and exits 1', async (args, refusal) => {
    const command = startEntrypoint(
      'src/maintenance.ts',
      { DATABASE_URL: '' },
      args,
    );
    try {
      const { code, signal } = await command.exited;
      expect({ code, signal }).toEqual({ code: 1, signal: null });
      expect(command.output().trim()).toBe(refusal);
    } finally {
      command.child.kill('SIGKILL');
    }
  });
});
