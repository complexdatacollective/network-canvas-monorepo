import { afterAll, describe, expect, it } from '@effect/vitest';
import { Effect, Fiber, Layer, ManagedRuntime } from 'effect';
import { TestClock } from 'effect/testing';

import { renderSchemaDdl } from '../../scripts/render-schema-ddl.ts';
import { createStudio } from '../app.ts';
import { OwnerDatabase, ReadinessDatabase } from '../db/client.ts';
import { migrateDatabaseEffect } from '../db/migrate.ts';
import { resolve } from '../env/resolve.ts';
import {
  databaseCheck,
  type HealthChecks,
  readiness,
  schemaCheckOn,
} from '../http/health.ts';
import { freePort } from './support/entrypoint.ts';
import { createScratchDatabase, reachableDb } from './support/postgres.ts';
import { testKeyringEntry } from './support/secrets.ts';
import { composeStudio } from './support/serve.ts';
import {
  openRateLimitStore,
  reachableRedis,
  REDIS_DATABASES,
} from './support/valkey.ts';

// Liveness and readiness on the web process (#1897, #1909). The worker serves
// the same two routes on a loopback listener of its own, which only a real
// process can show — that half is in worker-entrypoint.test.ts.

const db = await reachableDb();
const redis = await reachableRedis(REDIS_DATABASES.health);

/** Rendering the DDL imports drizzle-kit; the migrate itself takes a second. */
const PROVISION_TIMEOUT_MS = 180_000;

const AUTH = {
  BETTER_AUTH_SECRET: 'a'.repeat(40),
  PUBLIC_URL: 'http://127.0.0.1:3000',
};

/** The composed stack this process serves, for a case that reads a route. */
async function request(
  variables: Parameters<typeof resolve>[0],
  path: string,
  extraChecks: HealthChecks = {},
): Promise<{ response: Response; dispose: () => Promise<void> }> {
  const env = resolve(variables);
  // The limiter the program would build: over `REDIS_URL`'s store when the
  // variables name one, over no store when they do not.
  const limits = await openRateLimitStore(env.redis);
  const studio = createStudio(env, { limiter: limits.limiter() });
  const stack = composeStudio(env, studio, {
    ...studio.checks,
    ...extraChecks,
  });
  return {
    response: await stack.request(path),
    dispose: async () => {
      await stack.dispose();
      await limits.dispose();
    },
  };
}

/** The application role's readiness client over `url`, as the web program builds it. */
async function readinessOver(url: string) {
  const runtime = ManagedRuntime.make(
    Layer.orDie(ReadinessDatabase.layer('app', { url })),
  );
  const { sql } = await runtime.runPromise(ReadinessDatabase);
  return { sql, dispose: () => runtime.dispose() };
}

const ok = Effect.succeed('ok' as const);

describe('a readiness verdict', () => {
  it.effect('is ok when every check is', () =>
    Effect.gen(function* () {
      expect(yield* readiness({ db: ok, schema: ok })).toEqual({
        status: 'ok',
        checks: { db: 'ok', schema: 'ok' },
      });
    }),
  );

  it.effect('is degraded, not failing, when a check reports degraded', () =>
    // The shape the Valkey limiter reports: it fails open, so losing it
    // changes what a deployment enforces without making the process unfit to
    // serve — and taking the container out of rotation for it would turn a
    // rate-limit outage into an availability one.
    Effect.gen(function* () {
      expect(
        yield* readiness({ db: ok, limiter: Effect.succeed('degraded') }),
      ).toEqual({
        status: 'degraded',
        checks: { db: 'ok', limiter: 'degraded' },
      });
    }),
  );

  it.effect('names the reason a check failed', () =>
    // Naming it is the point: an operator reading a 503 has to learn which
    // dependency, from the response, without a shell on the container.
    Effect.gen(function* () {
      const result = yield* readiness({
        db: Effect.fail(new Error('connect ECONNREFUSED')),
        schema: ok,
      });
      expect(result.status).toBe('failing');
      expect(result.checks.db).toBe('failed: connect ECONNREFUSED');
      expect(result.checks.schema).toBe('ok');
    }),
  );

  it.effect('fails a check that hangs rather than hanging with it', () =>
    // A wedged socket is the case this exists for: without the bound, the
    // probe times out at the runtime's deadline with nothing to say, and every
    // check's verdict is lost along with the one that hung.
    //
    // Mutation: drop the `Effect.timeoutOrElse` and this never resolves, even
    // with the clock moved a second forward.
    Effect.gen(function* () {
      const running = yield* Effect.forkChild(
        readiness({ db: Effect.never, schema: ok }),
      );
      yield* TestClock.adjust('1 second');
      const result = yield* Fiber.join(running);
      expect(result.status).toBe('failing');
      expect(result.checks.db).toBe('failed: timed out after 1000ms');
      // The others still answered, which is what running them concurrently
      // buys.
      expect(result.checks.schema).toBe('ok');
    }),
  );
});

describe('the schema check on the readiness client', () => {
  it('names the database error when it cannot connect', async () => {
    // What a worker container's `/readyz` says when Postgres is down — the
    // only diagnostic it exposes, so the reason has to be the driver's.
    const probe = await readinessOver(
      'postgres://studio:studio@127.0.0.1:59999/studio',
    );
    try {
      const result = await Effect.runPromise(
        readiness({ schema: schemaCheckOn(probe.sql) }),
      );
      expect(result.status).toBe('failing');
      expect(result.checks.schema).toMatch(
        /^failed: connect ECONNREFUSED 127\.0\.0\.1:59999/,
      );
    } finally {
      await probe.dispose();
    }
  });
});

describe('the web process routes', () => {
  it('answers /healthz without asking anything', async () => {
    // Liveness: a process that answers is running. It must not consult a
    // dependency — a container runtime restarts on this, and restarting a
    // healthy process because Postgres is down is how an outage doubles.
    const { response, dispose } = await request(
      { NODE_ENV: 'test' },
      '/healthz',
    );
    try {
      expect(response.status).toBe(200);
      // Byte-identical to what the route has always answered, because a container
      // healthcheck may be a literal string comparison.
      expect(await response.text()).toBe('{"status":"ok"}');
    } finally {
      await dispose();
    }
  });

  it('omits a check for a surface this deployment has not configured', async () => {
    // No database and no object store: both refuse by design, and reporting
    // them failed would make a deployment that never wanted one permanently
    // unready.
    const { response, dispose } = await request(
      { NODE_ENV: 'test' },
      '/readyz',
    );
    try {
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: 'ok', checks: {} });
    } finally {
      await dispose();
    }
  });

  it('omits the limiter where no rate-limit store is configured', async () => {
    // The same rule every other unconfigured surface takes: nothing is
    // enforced, nothing is checked, and an instance that never wanted a store
    // is not permanently degraded for not having one.
    const { response, dispose } = await request(
      { NODE_ENV: 'test' },
      '/readyz',
    );
    try {
      expect(await response.json()).toEqual({ status: 'ok', checks: {} });
    } finally {
      await dispose();
    }
  });

  it('is degraded, and still 200, when the rate-limit store is unreachable', async () => {
    // The limiter fails open (#1909), so the process still serves every
    // request — it just stops enforcing a limit. Answering 503 here would
    // take the container out of rotation and turn a rate-limit outage into an
    // availability one.
    const env = resolve({
      NODE_ENV: 'test',
      REDIS_URL: `redis://127.0.0.1:${await freePort()}`,
    });
    const limits = await openRateLimitStore(env.redis);
    const studio = createStudio(env, { limiter: limits.limiter() });
    const stack = composeStudio(env, studio);
    try {
      const response = await stack.request('/readyz');
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        status: 'degraded',
        checks: { limiter: 'degraded' },
      });
      // And a request still goes through, which is what degraded means here.
      expect((await stack.request('/api/v1/status')).status).toBe(200);
    } finally {
      await stack.dispose();
      await limits.dispose();
    }
  });

  it.skipIf(!redis)(
    'names the limiter ok while the store answers',
    async () => {
      const { response, dispose } = await request(
        { NODE_ENV: 'test', ...(redis ? { REDIS_URL: redis } : {}) },
        '/readyz',
      );
      try {
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
          status: 'ok',
          checks: { limiter: 'ok' },
        });
      } finally {
        await dispose();
      }
    },
  );

  it('is 503 and names the database when the pool cannot connect', async () => {
    // An unroutable loopback port: nothing answers it, and nothing real is
    // dialled.
    const env = resolve({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://studio:studio@127.0.0.1:59999/studio',
      // A database needs a keyring (#1900); the check under test never
      // reaches it.
      STUDIO_SECRETS_KEY: testKeyringEntry('test-1'),
      ...AUTH,
    });
    const probe = await readinessOver(env.db!.url);
    const studio = createStudio(env, { readiness: probe.sql });
    const stack = composeStudio(env, studio);
    try {
      const response = await stack.request('/readyz');
      expect(response.status).toBe(503);
      const body = (await response.json()) as {
        status: string;
        checks: Record<string, string>;
      };
      expect(body.status).toBe('failing');
      expect(body.checks.db).toMatch(/^failed: /);

      // And liveness is unaffected: the process is running, the database is
      // not.
      expect((await stack.request('/healthz')).status).toBe(200);
    } finally {
      await stack.dispose();
      await probe.dispose();
    }
  });
});

describe.skipIf(!db)('the web process against a real database', () => {
  const scratches: { dispose: () => Promise<void> }[] = [];

  afterAll(async () => {
    await Promise.allSettled(scratches.map((scratch) => scratch.dispose()));
  });

  it(
    'is ready once the schema is this build’s',
    async () => {
      if (!db) throw new Error('unreachable: probe guaranteed a database');
      const scratch = await createScratchDatabase(db);
      scratches.push(scratch);
      const variables = {
        NODE_ENV: 'test',
        DATABASE_URL: scratch.db.url,
        // A database needs a keyring (#1900); nothing here opens a secret.
        STUDIO_SECRETS_KEY: testKeyringEntry('test-1'),
        ...AUTH,
      } as const;

      // The `db` and `schema` checks are the program's, so the suite supplies
      // them the way the worker program does, over a readiness client.
      const probe = await readinessOver(scratch.db.url);
      const checks = {
        db: databaseCheck(probe.sql),
        schema: schemaCheckOn(probe.sql),
      };

      // Before the schema exists, readiness says so by name rather than
      // reporting a healthy process with nothing behind it.
      const before = await request(variables, '/readyz', checks);
      try {
        expect(before.response.status).toBe(503);
        expect(
          (
            (await before.response.json()) as {
              checks: Record<string, string>;
            }
          ).checks.schema,
        ).toMatch(/^failed: /);
      } finally {
        await before.dispose();
      }

      const ddl = await renderSchemaDdl();
      await Effect.runPromise(
        migrateDatabaseEffect(ddl).pipe(
          Effect.provide(OwnerDatabase.layer({ url: scratch.db.url })),
        ),
      );

      const after = await request(variables, '/readyz', checks);
      try {
        expect(after.response.status).toBe(200);
        expect(await after.response.json()).toEqual({
          status: 'ok',
          checks: { db: 'ok', schema: 'ok' },
        });
      } finally {
        await after.dispose();
        await probe.dispose();
      }
    },
    PROVISION_TIMEOUT_MS,
  );
});
