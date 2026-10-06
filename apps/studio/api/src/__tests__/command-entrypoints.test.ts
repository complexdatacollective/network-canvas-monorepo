import { describe, expect, it } from 'vitest';

import { startEntrypoint } from './support/entrypoint.ts';
import { testKeyringEntry } from './support/secrets.ts';

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

describe.each(Object.entries(REFUSALS))(
  'the %s command with an environment it cannot read',
  (entry, { args }) => {
    it('prints why, without a stack, and exits 1', async () => {
      const command = startEntrypoint(
        entry,
        {
          STUDIO_SECRETS_KEY: testKeyringEntry('k1'),
          STUDIO_SECRETS_KEY_FILE: '/run/secrets/studio_secrets_key',
        },
        args,
      );
      try {
        const { code, signal } = await command.exited;
        expect({ code, signal }).toEqual({ code: 1, signal: null });
        expect(command.output()).toMatch(
          /STUDIO_SECRETS_KEY and STUDIO_SECRETS_KEY_FILE are both set/,
        );
        expect(command.output()).not.toMatch(/^\s+at /m);
      } finally {
        command.child.kill('SIGKILL');
      }
    });
  },
);

describe('the maintenance command', () => {
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
