// The keyring refusals as a deployment meets them: a process started from the
// image, with an environment, against a real database (#1900). What is being
// checked is that each refusal is fatal to the process and says which key is
// missing — neither of which an in-process test of the check can answer,
// because the exit and the boot ordering are the behaviour.
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applySchema } from '../../scripts/apply.ts';
import {
  type Entrypoint,
  freePort,
  startEntrypoint,
} from './support/entrypoint.ts';
import {
  createScratchDatabase,
  reachableDb,
  seedTeam,
} from './support/postgres.ts';
import { testKeyringEntry } from './support/secrets.ts';

const db = await reachableDb();

/** drizzle-kit push against a fresh database, and it shares the CI runner. */
const APPLY_TIMEOUT_MS = 180_000;

const TEAM = 'team-boot';
/** The id the fixture row is sealed under, which no keyring here can produce. */
const MISSING_KEY_ID = 'gone';

const ENTRYPOINTS = [
  ['the web process', 'src/index.ts'],
  ['the worker', 'src/worker.ts'],
] as const;

describe.skipIf(!db)('refusing to boot without the keys in use', () => {
  let applied: Awaited<ReturnType<typeof createScratchDatabase>>;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    applied = await createScratchDatabase(db);
    await applySchema(applied.pool);
    await seedTeam(applied.pool, TEAM);
    // One row sealed under a key id no keyring below carries: the state a
    // half-removed rotation entry, or a restore from a backup older than the
    // keyring, leaves behind.
    await applied.pool.query(
      `INSERT INTO webhook_subscriptions
         (id, team_id, url, event_types, secret_ciphertext, secret_key_id, created_by_user_id)
       VALUES ($1, $2, 'https://hooks.example.org/studio', ARRAY['interview.completed'],
               '\\x01020304'::bytea, $3, 'user-boot')`,
      [randomUUID(), TEAM, MISSING_KEY_ID],
    );
  }, APPLY_TIMEOUT_MS);

  afterAll(async () => {
    await applied.dispose();
  });

  /**
   * The deployment's environment rather than this suite's: the committed
   * `.env.development` the child would otherwise inherit carries a keyring and
   * the lenient schema wait, which are the two things these cases are about.
   */
  async function start(
    entry: string,
    overrides: Record<string, string>,
  ): Promise<Entrypoint> {
    return startEntrypoint(entry, {
      NODE_ENV: 'production',
      STUDIO_DEV_DEFAULTS: '',
      SMTP_URL: '',
      EMAIL_FROM: '',
      // Nothing here should reach a listener; a port of its own keeps a
      // failure from colliding with a development server on 3000.
      PORT: String(await freePort()),
      DATABASE_URL: applied.db.url,
      ...overrides,
    });
  }

  async function refusal(
    entry: string,
    overrides: Record<string, string>,
  ): Promise<{ code: number | null; output: string }> {
    const child = await start(entry, overrides);
    try {
      const { code } = await child.exited;
      return { code, output: child.output() };
    } finally {
      child.child.kill('SIGKILL');
    }
  }

  describe.each(ENTRYPOINTS)('%s', (_name, entry) => {
    it('refuses with no keyring configured at all', async () => {
      const { code, output } = await refusal(entry, {
        STUDIO_SECRETS_KEY: '',
        STUDIO_SECRETS_KEY_FILE: '',
      });
      expect(code).toBe(1);
      expect(output).toMatch(/A secrets keyring is required when DATABASE_URL/);
      // The one rule the refusal has to carry, wherever it is read.
      expect(output).toMatch(
        /Back the keyring up with the database: without it every stored secret is unreadable/,
      );
    });

    it('refuses with both the variable and the file set', async () => {
      const { code, output } = await refusal(entry, {
        STUDIO_SECRETS_KEY: testKeyringEntry('boot-1'),
        STUDIO_SECRETS_KEY_FILE: '/run/secrets/studio_secrets_key',
      });
      expect(code).toBe(1);
      expect(output).toMatch(
        /STUDIO_SECRETS_KEY and STUDIO_SECRETS_KEY_FILE are both set/,
      );
    });

    it('refuses a database whose stored key id it cannot produce, naming it', async () => {
      const { code, output } = await refusal(entry, {
        STUDIO_SECRETS_KEY: testKeyringEntry('boot-1'),
      });
      expect(code).toBe(1);
      expect(output).toMatch(new RegExp(`cannot produce: ${MISSING_KEY_ID}`));
      // And what to do about it, because the two remedies are very different
      // things to reach for.
      expect(output).toMatch(/restore the database backup that matches/);
      // The refusal precedes the listener: a process that served requests
      // first and exited afterwards would take a deployment's traffic and
      // fail the half of it that touches a secret.
      expect(output).not.toMatch(/listening on/i);
    });
  });
});
