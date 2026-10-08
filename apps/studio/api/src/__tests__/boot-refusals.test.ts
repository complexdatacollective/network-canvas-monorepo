// How a deployed process starts, run as a deployment runs it: a process of its
// own, with the deployment's environment, against a real database. Two kinds of
// answer are told apart here. An environment it cannot read, or a keyring that
// cannot open what the database stores, is a refusal: the process exits 1 with
// one sentence. A schema that is absent or another build's is not a refusal
// (#1901): an upgrade starts the new image before `migrate` runs, so the
// process comes up closed — the API answering every request with the
// maintenance page and naming why in `/readyz`, the worker running nothing —
// and opens by itself once the schema is current, with no restart.
import { randomUUID } from 'node:crypto';

import { Console, Effect, Exit, Redacted, Schema } from 'effect';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { MAINTENANCE_PROBLEM_TYPE } from '@codaco/studio-contract/schema/problem';

import { applySchema } from '../../scripts/apply.ts';
import { SCHEMA_FINGERPRINT } from '../db/fingerprint.generated.ts';
import { schemaProblemMessage } from '../db/schema.ts';
import { reportingRefusals } from '../programs/command.ts';
import { SecretKeyMissing } from '../secrets/verify.ts';
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
import {
  testCipher,
  testKeyring,
  testKeyringEntry,
} from './support/secrets.ts';

const db = await reachableDb();

const APPLY_TIMEOUT_MS = 180_000;

/** A boot, one or two three-second schema retries, and the requests between. */
const WAITING_CASE_TIMEOUT_MS = 120_000;

/** The schema gate re-reads the fingerprint every three seconds. */
const SCHEMA_WAIT_MS = 60_000;

/** One schema retry (three seconds) and a margin; see the worker case. */
const NOTHING_BUILT_WINDOW_MS = 5_000;

/** The maintenance flag is read through a one-second cache. */
const FLAG_WAIT_MS = 10_000;

const ENTRYPOINTS = [
  ['the web process', 'src/index.ts'],
  ['the worker', 'src/worker.ts'],
] as const;

const STACK_FRAME = /^\s+at /m;

const BOOT_CHECKS_PASSED = /Schema current and keyring verified; serving\./;

const WORKER_STARTED = /Network Canvas Studio worker started/;

/** The deployment's environment, minus the development lane's defaults. */
const deployed = async (
  overrides: Record<string, string>,
): Promise<Record<string, string>> => ({
  NODE_ENV: 'production',
  STUDIO_DEV_DEFAULTS: '',
  SMTP_URL: '',
  EMAIL_FROM: '',
  PORT: String(await freePort()),
  WORKER_HEALTH_PORT: String(await freePort()),
  ...overrides,
});

async function refusalOf(
  entry: string,
  overrides: Record<string, string>,
): Promise<{ code: number | null; output: string }> {
  const child = startEntrypoint(entry, await deployed(overrides));
  try {
    const { code } = await child.exited;
    return { code, output: child.output() };
  } finally {
    child.child.kill('SIGKILL');
  }
}

/** A deployment logs one JSON object per line; anything else is skipped. */
const LogLine = Schema.fromJsonString(
  Schema.Struct({
    message: Schema.String,
    cause: Schema.optional(Schema.String),
  }),
);

const loggedMessages = (output: string): string[] =>
  output.split('\n').flatMap((line) => {
    const decoded = Schema.decodeUnknownOption(LogLine)(line);
    return decoded._tag === 'Some' ? [decoded.value.message] : [];
  });

/**
 * Everything a log line carries as text, decoded: the message, and the `cause`
 * a logger attaches. A stack inside either is escaped (`\n    at …`) in the
 * raw output, so a pattern run over `output()` never sees one.
 */
const loggedText = (output: string): string[] =>
  output.split('\n').flatMap((line) => {
    const decoded = Schema.decodeUnknownOption(LogLine)(line);
    return decoded._tag === 'Some'
      ? [decoded.value.message, decoded.value.cause ?? '']
      : [];
  });

const expectNoStackInLog = (output: string): void => {
  const lines = loggedText(output);
  // A decoder that reads nothing would pass for any log.
  expect(lines.length).toBeGreaterThan(0);
  for (const text of lines) expect(text).not.toMatch(STACK_FRAME);
};

const Readiness = Schema.Struct({
  status: Schema.String,
  checks: Schema.Record(Schema.String, Schema.String),
});

async function readReadiness(
  port: number,
): Promise<{ status: number; body: typeof Readiness.Type }> {
  const response = await fetch(`http://127.0.0.1:${port}/readyz`);
  return {
    status: response.status,
    body: Schema.decodeUnknownSync(Readiness)(await response.json()),
  };
}

/** What the API's own gate names as the reason it is closed, or `ok`. */
const gateReason = async (port: number): Promise<string | undefined> =>
  (await readReadiness(port)).body.checks.maintenance;

async function postRpc(
  port: number,
): Promise<{ status: number; retryAfter: string | null; body: unknown }> {
  const response = await fetch(`http://127.0.0.1:${port}/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const text = await response.text();
  return {
    status: response.status,
    retryAfter: response.headers.get('retry-after'),
    body: response.headers.get('content-type')?.includes('json')
      ? (JSON.parse(text) as unknown)
      : text,
  };
}

const MAINTENANCE_ANSWER = {
  status: 503,
  retryAfter: '30',
  body: {
    type: MAINTENANCE_PROBLEM_TYPE,
    title: 'Down for maintenance',
    status: 503,
  },
};

/** Fails the case at once if the process exits while it is meant to wait. */
function stillRunning(child: Entrypoint, entry: string): Promise<never> {
  return child.exited.then(({ code }) => {
    throw new Error(
      `${entry} exited ${code} while waiting:\n${child.output()}`,
    );
  });
}

describe.each(ENTRYPOINTS)('%s refusing to start', (_name, entry) => {
  it('prints an environment it cannot read as the one sentence, and exits 1', async () => {
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

describe.skipIf(!db)('refusing a keyring that cannot open the database', () => {
  let unopenable: Awaited<ReturnType<typeof createScratchDatabase>>;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    unopenable = await createScratchDatabase(db);
    await applySchema(unopenable.pool);
    await seedTeam(unopenable.pool, 'team-boot-refusal');
    await unopenable.pool.query(
      `INSERT INTO webhook_subscriptions
         (id, team_id, url, event_types, secret_ciphertext, secret_key_id, created_by_user_id)
       VALUES ($1, 'team-boot-refusal', 'https://hooks.example.org/studio',
               ARRAY['interview.completed'], '\\x01020304'::bytea, 'gone', 'user-boot')`,
      [randomUUID()],
    );
  }, APPLY_TIMEOUT_MS);

  afterAll(async () => {
    await unopenable?.dispose();
  });

  // Still fatal, after #1901 as before it: no amount of waiting produces a
  // key the keyring does not carry. The web process is listening by the time
  // its check runs, closed (`http/__tests__/maintenance.test.ts` proves the
  // gate holds until the checks pass), so it prints its listening line first
  // and the refusal is the line after.
  it.each(ENTRYPOINTS)(
    '%s prints the one sentence, and exits 1',
    async (_name, entry) => {
      const { code, output } = await refusalOf(entry, {
        DATABASE_URL: unopenable.db.url,
        STUDIO_SECRETS_KEY: testKeyringEntry('boot-1'),
      });
      expect(code).toBe(1);
      expect(output.trim().split('\n').at(-1)).toBe(
        new SecretKeyMissing({ keyIds: ['gone'] }).message,
      );
      expect(output).not.toMatch(STACK_FRAME);
      expect(output).not.toMatch(BOOT_CHECKS_PASSED);
      expect(output).not.toMatch(WORKER_STARTED);
    },
  );
});

describe.skipIf(!db)('waiting closed for a schema that is not current', () => {
  let current: Awaited<ReturnType<typeof createScratchDatabase>>;
  let unprovisioned: Awaited<ReturnType<typeof createScratchDatabase>>;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    [current, unprovisioned] = await Promise.all([
      createScratchDatabase(db),
      createScratchDatabase(db),
    ]);
    await applySchema(current.pool);
  }, APPLY_TIMEOUT_MS);

  afterAll(async () => {
    await current?.dispose();
    await unprovisioned?.dispose();
  });

  const stamp = (pool: pg.Pool, fingerprint: string) =>
    pool.query('update "schemaFingerprint" set "fingerprint" = $1', [
      fingerprint,
    ]);

  const setFlag = (pool: pg.Pool, on: boolean) =>
    pool.query(
      'update deployment_state set maintenance = $1, reason = $2',
      on ? [true, 'Upgrading'] : [false, null],
    );

  it(
    'the web process serves the maintenance page for an older build’s schema, and opens once it is current and the flag is clear',
    async () => {
      await stamp(current.pool, 'an-older-build');
      const port = await freePort();
      const entry = 'src/index.ts';
      const api = startEntrypoint(
        entry,
        await deployed({
          DATABASE_URL: current.db.url,
          STUDIO_SECRETS_KEY: testKeyringEntry('boot-1'),
          PORT: String(port),
        }),
      );
      const exited = stillRunning(api, entry);
      exited.catch(() => undefined);
      const whileRunning = <A>(step: Promise<A>) =>
        Promise.race([step, exited]);

      try {
        await whileRunning(api.waitForOutput(/listening on/));
        await whileRunning(
          api.waitForOutput(/The database schema is not this build’s\./),
        );
        expect(api.output()).toContain('docker compose run --rm migrate');

        // Closed, and saying why: the schema, with no flag set.
        expect(await whileRunning(postRpc(port))).toEqual(MAINTENANCE_ANSWER);
        const closed = await whileRunning(readReadiness(port));
        expect(closed.status).toBe(503);
        expect(closed.body.checks.maintenance).toBe(
          'failed: the database schema is not this build’s',
        );
        expect(
          (await whileRunning(fetch(`http://127.0.0.1:${port}/healthz`)))
            .status,
        ).toBe(200);

        // The operator's window opens over it, and readiness names that first.
        await setFlag(current.pool, true);
        await whileRunning(
          vi.waitFor(
            async () =>
              expect(await gateReason(port)).toBe(
                'failed: maintenance mode is on: Upgrading',
              ),
            { timeout: FLAG_WAIT_MS, interval: 100 },
          ),
        );

        // `migrate` lands: the process sees it by itself, and the flag still
        // holds the gate.
        await stamp(current.pool, SCHEMA_FINGERPRINT);
        await whileRunning(
          api.waitForOutput(BOOT_CHECKS_PASSED, SCHEMA_WAIT_MS),
        );
        expect(await whileRunning(postRpc(port))).toEqual(MAINTENANCE_ANSWER);
        expect(await whileRunning(gateReason(port))).toBe(
          'failed: maintenance mode is on: Upgrading',
        );

        // Cleared: open, in the same process.
        await setFlag(current.pool, false);
        await whileRunning(
          vi.waitFor(async () => expect(await gateReason(port)).toBe('ok'), {
            timeout: FLAG_WAIT_MS,
            interval: 100,
          }),
        );
        expect((await whileRunning(postRpc(port))).status).not.toBe(503);
        expect(api.child.exitCode).toBeNull();
      } finally {
        api.child.kill('SIGKILL');
        await setFlag(current.pool, false);
        await stamp(current.pool, SCHEMA_FINGERPRINT);
      }
    },
    WAITING_CASE_TIMEOUT_MS,
  );

  // The new image's api starts between `up -d` and `migrate`, against the older
  // schema. If that schema lacks a column the newer build's release read names,
  // the maintenance flag must still be read: readiness names the operator's
  // window for as long as the flag is set, not the schema.
  it(
    'the web process still reads the maintenance flag against a schema whose release columns are not this build’s',
    async () => {
      await stamp(current.pool, 'an-older-build');
      await current.pool.query(
        'alter table deployment_state rename column latest_schema_change to latest_schema_change_renamed',
      );
      await setFlag(current.pool, true);
      const port = await freePort();
      const entry = 'src/index.ts';
      const api = startEntrypoint(
        entry,
        await deployed({
          DATABASE_URL: current.db.url,
          STUDIO_SECRETS_KEY: testKeyringEntry('boot-1'),
          PORT: String(port),
        }),
      );
      const exited = stillRunning(api, entry);
      exited.catch(() => undefined);
      const whileRunning = <A>(step: Promise<A>) =>
        Promise.race([step, exited]);

      try {
        await whileRunning(
          api.waitForOutput(/The database schema is not this build’s\./),
        );
        await whileRunning(
          vi.waitFor(
            async () =>
              expect(await gateReason(port)).toBe(
                'failed: maintenance mode is on: Upgrading',
              ),
            { timeout: FLAG_WAIT_MS, interval: 100 },
          ),
        );
        expect(await whileRunning(postRpc(port))).toEqual(MAINTENANCE_ANSWER);
      } finally {
        api.child.kill('SIGKILL');
        await current.pool.query(
          'alter table deployment_state rename column latest_schema_change_renamed to latest_schema_change',
        );
        await setFlag(current.pool, false);
        await stamp(current.pool, SCHEMA_FINGERPRINT);
      }
    },
    WAITING_CASE_TIMEOUT_MS,
  );

  it(
    'the web process serves the maintenance page for a database with no schema',
    async () => {
      const port = await freePort();
      const entry = 'src/index.ts';
      const api = startEntrypoint(
        entry,
        await deployed({
          DATABASE_URL: unprovisioned.db.url,
          STUDIO_SECRETS_KEY: testKeyringEntry('boot-1'),
          PORT: String(port),
        }),
      );
      const exited = stillRunning(api, entry);
      exited.catch(() => undefined);
      const whileRunning = <A>(step: Promise<A>) =>
        Promise.race([step, exited]);
      try {
        await whileRunning(api.waitForOutput(/listening on/));
        await whileRunning(
          api.waitForOutput(/Waiting for it, with no restart needed/),
        );
        const warning = loggedMessages(api.output()).find((message) =>
          message.includes('Waiting for it'),
        );
        // The deployed remedy, word for word, then what the process does
        // about it.
        const remedy = `${schemaProblemMessage({ kind: 'absent' }, 'deployed')}\n`;
        expect(warning?.slice(0, remedy.length)).toBe(remedy);
        expectNoStackInLog(api.output());

        expect(await whileRunning(postRpc(port))).toEqual(MAINTENANCE_ANSWER);
        const closed = await whileRunning(readReadiness(port));
        expect(closed.status).toBe(503);
        // The roles exist cluster-wide in this harness, so the readings
        // succeed and name the schema; on a cluster that has never seen
        // Studio they fail open, and `starting` is what closes the gate.
        expect(closed.body.checks.maintenance).toBe(
          'failed: the database has no Studio schema',
        );
      } finally {
        api.child.kill('SIGKILL');
      }
    },
    WAITING_CASE_TIMEOUT_MS,
  );

  it(
    'the worker reports itself not ready and builds no queue until the schema is current',
    async () => {
      await stamp(current.pool, 'an-older-build');
      const healthPort = await freePort();
      const entry = 'src/worker.ts';
      const worker = startEntrypoint(
        entry,
        await deployed({
          DATABASE_URL: current.db.url,
          STUDIO_SECRETS_KEY: testKeyringEntry('boot-1'),
          WORKER_HEALTH_PORT: String(healthPort),
          // No rate-limit store: readiness then carries exactly the checks
          // this case is about.
          REDIS_URL: '',
        }),
      );
      const exited = stillRunning(worker, entry);
      exited.catch(() => undefined);
      const whileRunning = <A>(step: Promise<A>) =>
        Promise.race([step, exited]);

      // The queue's client is the only one named `studio-worker`; it exists
      // once `JobWorker` is built, holding its `LISTEN`.
      const queueConnections = async (): Promise<number> => {
        const { rows } = await current.pool.query<{ count: number }>(
          `select count(*)::int as count from pg_stat_activity
            where datname = current_database()
              and application_name = 'studio-worker'`,
        );
        return rows[0]?.count ?? 0;
      };

      try {
        await whileRunning(
          worker.waitForOutput(/The database schema is not this build’s\./),
        );
        // "Builds nothing" has no event to wait on, so it is held for a
        // window instead: longer than one schema retry, and longer than a
        // worker that had passed the gate takes to build its queue and say so.
        // A single read straight after the warning would race that build and
        // pass against a worker that builds on a stale schema.
        const heldUntil = Date.now() + NOTHING_BUILT_WINDOW_MS;
        while (Date.now() < heldUntil) {
          const waiting = await whileRunning(readReadiness(healthPort));
          expect(waiting.status).toBe(503);
          expect(waiting.body.status).toBe('failing');
          expect(waiting.body.checks.jobs).toBe('failed: not started');
          expect(waiting.body.checks.schema).toMatch(
            /^failed: not this build's schema/,
          );
          expect(await queueConnections()).toBe(0);
          expect(worker.output()).not.toMatch(WORKER_STARTED);
          await new Promise((settled) => setTimeout(settled, 250));
        }

        await stamp(current.pool, SCHEMA_FINGERPRINT);
        await whileRunning(
          worker.waitForOutput(WORKER_STARTED, SCHEMA_WAIT_MS),
        );
        await whileRunning(
          vi.waitFor(
            async () =>
              expect(await readReadiness(healthPort)).toEqual({
                status: 200,
                body: {
                  status: 'ok',
                  checks: { db: 'ok', schema: 'ok', jobs: 'ok' },
                },
              }),
            { timeout: FLAG_WAIT_MS, interval: 100 },
          ),
        );
        expect(await queueConnections()).toBeGreaterThan(0);
        expect(worker.child.exitCode).toBeNull();
      } finally {
        worker.child.kill('SIGKILL');
        await stamp(current.pool, SCHEMA_FINGERPRINT);
      }
    },
    WAITING_CASE_TIMEOUT_MS,
  );
});

describe.skipIf(!db)('opening a keyring that matches the database', () => {
  let sealed: Awaited<ReturnType<typeof createScratchDatabase>>;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    sealed = await createScratchDatabase(db);
    await applySchema(sealed.pool);
    await seedTeam(sealed.pool, 'team-boot-sealed');
    const subscriptionId = randomUUID();
    const secret = testCipher(testKeyring(['boot-1'])).sealWebhookSecret(
      { teamId: 'team-boot-sealed', subscriptionId },
      Redacted.make('whsec-boot'),
    );
    await sealed.pool.query(
      `INSERT INTO webhook_subscriptions
         (id, team_id, url, event_types, secret_ciphertext, secret_key_id, created_by_user_id)
       VALUES ($1, 'team-boot-sealed', 'https://hooks.example.org/studio',
               ARRAY['interview.completed'], $2, $3, 'user-boot')`,
      [subscriptionId, secret.ciphertext, secret.keyId],
    );
  }, APPLY_TIMEOUT_MS);

  afterAll(async () => {
    await sealed?.dispose();
  });

  it.each([
    ['the web process', 'src/index.ts', BOOT_CHECKS_PASSED],
    ['the worker', 'src/worker.ts', WORKER_STARTED],
  ] as const)(
    '%s opens a stored secret and starts',
    async (_name, entry, started) => {
      const child = startEntrypoint(
        entry,
        await deployed({
          DATABASE_URL: sealed.db.url,
          STUDIO_SECRETS_KEY: testKeyringEntry('boot-1'),
        }),
      );
      try {
        await Promise.race([
          child.waitForOutput(started),
          stillRunning(child, entry),
        ]);
      } finally {
        child.child.kill('SIGKILL');
      }
    },
  );
});

describe('a process that broke rather than refused', () => {
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
