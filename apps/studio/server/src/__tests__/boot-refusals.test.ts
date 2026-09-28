// How the long-running processes refuse to start, as an operator reads it: the
// same one sentence the one-shot commands print (src/programs/command.ts),
// with no runtime report around it and no stack, and exit 1. A process that
// broke rather than refused still prints its stack.
import { randomUUID } from 'node:crypto';

import { Console, Effect, Exit } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applySchema } from '../../scripts/apply.ts';
import { StaleSchema } from '../platform/schema-gate.ts';
import { reportingRefusals } from '../programs/command.ts';
import { SecretKeyMissingError } from '../secrets/boot.ts';
import { freePort, startEntrypoint } from './support/entrypoint.ts';
import {
  createScratchDatabase,
  reachableDb,
  seedTeam,
} from './support/postgres.ts';
import { testKeyringEntry } from './support/secrets.ts';

const db = await reachableDb();

/** drizzle-kit push against a fresh database, and it shares the CI runner. */
const APPLY_TIMEOUT_MS = 180_000;

const ENTRYPOINTS = [
  ['the web process', 'src/index.ts'],
  ['the worker', 'src/worker.ts'],
] as const;

/** A line of a stack trace, which no refusal may carry. */
const STACK_FRAME = /^\s+at /m;

/**
 * The deployment's environment rather than this suite's: the committed
 * `.env.development` the child would otherwise inherit makes the schema gate
 * wait instead of refuse.
 */
async function refusalOf(
  entry: string,
  overrides: Record<string, string>,
): Promise<{ code: number | null; output: string }> {
  const child = startEntrypoint(entry, {
    NODE_ENV: 'production',
    STUDIO_DEV_DEFAULTS: '',
    SMTP_URL: '',
    EMAIL_FROM: '',
    PORT: String(await freePort()),
    WORKER_HEALTH_PORT: String(await freePort()),
    ...overrides,
  });
  try {
    const { code } = await child.exited;
    return { code, output: child.output() };
  } finally {
    child.child.kill('SIGKILL');
  }
}

describe.each(ENTRYPOINTS)('%s refusing to start', (_name, entry) => {
  it('prints an environment it cannot read as the one sentence, and exits 1', async () => {
    // Mutation: drop `reportingRefusals` and `disableErrorReporting` from the
    // entry — the sentence arrives inside `ERROR (#1): EnvironmentInvalid: …`
    // with its stack.
    const { code, output } = await refusalOf(entry, {
      STUDIO_SECRETS_KEY: testKeyringEntry('boot-1'),
      STUDIO_SECRETS_KEY_FILE: '/run/secrets/studio_secrets_key',
    });
    expect(code).toBe(1);
    expect(output.trim()).toBe(
      'STUDIO_SECRETS_KEY and STUDIO_SECRETS_KEY_FILE are both set; set exactly one.',
    );
    expect(output).not.toMatch(STACK_FRAME);
  });
});

describe('the worker refusing to start', () => {
  it('prints a missing database as the one sentence, and exits 1', async () => {
    const { code, output } = await refusalOf('src/worker.ts', {
      DATABASE_URL: '',
    });
    expect(code).toBe(1);
    expect(output.trim()).toBe(
      'DATABASE_URL is required for the worker process: there are no jobs to run without a database.',
    );
  });
});

describe.skipIf(!db)('refusing a database', () => {
  let unprovisioned: Awaited<ReturnType<typeof createScratchDatabase>>;
  let applied: Awaited<ReturnType<typeof createScratchDatabase>>;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    unprovisioned = await createScratchDatabase(db);
    applied = await createScratchDatabase(db);
    await applySchema(applied.pool);
    await seedTeam(applied.pool, 'team-boot-refusal');
    // One secret under a key id no keyring below carries.
    await applied.pool.query(
      `INSERT INTO webhook_subscriptions
         (id, team_id, url, event_types, secret_ciphertext, secret_key_id, created_by_user_id)
       VALUES ($1, 'team-boot-refusal', 'https://hooks.example.org/studio',
               ARRAY['interview.completed'], '\\x01020304'::bytea, 'gone', 'user-boot')`,
      [randomUUID()],
    );
  }, APPLY_TIMEOUT_MS);

  afterAll(async () => {
    await unprovisioned?.dispose();
    await applied?.dispose();
  });

  describe.each(ENTRYPOINTS)('%s', (_name, entry) => {
    it('prints a database with no schema as the gate’s refusal, and exits 1', async () => {
      const { code, output } = await refusalOf(entry, {
        DATABASE_URL: unprovisioned.db.url,
        STUDIO_SECRETS_KEY: testKeyringEntry('boot-1'),
      });
      expect(code).toBe(1);
      expect(output.trim()).toBe(
        StaleSchema.fromState({ kind: 'absent' }).message,
      );
      expect(output).not.toMatch(STACK_FRAME);
    });

    it('prints a keyring that cannot read the database as the one sentence, and exits 1', async () => {
      const { code, output } = await refusalOf(entry, {
        DATABASE_URL: applied.db.url,
        STUDIO_SECRETS_KEY: testKeyringEntry('boot-1'),
      });
      expect(code).toBe(1);
      expect(output.trim()).toBe(new SecretKeyMissingError(['gone']).message);
      expect(output).not.toMatch(STACK_FRAME);
    });
  });
});

describe('a process that broke rather than refused', () => {
  /** What `reportingRefusals` writes to stderr for an effect's outcome. */
  const reported = async <A, E>(
    effect: Effect.Effect<A, E>,
  ): Promise<string[]> => {
    const lines: string[] = [];
    const exit = await Effect.runPromiseExit(
      reportingRefusals(effect).pipe(
        Effect.provideService(Console.Console, {
          ...console,
          error: (...args: ReadonlyArray<unknown>) => {
            lines.push(args.map(String).join(' '));
          },
        }),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    return lines;
  };

  it('prints a defect with its stack, so it can be found', async () => {
    const [line] = await reported(Effect.die(new Error('the pool broke')));
    expect(line).toContain('the pool broke');
    expect(line).toMatch(STACK_FRAME);
  });

  it('prints a refusal as its sentence alone', async () => {
    const [line] = await reported(
      Effect.fail(new Error('a sentence to act on')),
    );
    expect(line).toBe('a sentence to act on');
  });

  it('prints nothing for an interruption', async () => {
    expect(await reported(Effect.interrupt)).toEqual([]);
  });
});
