import { afterAll, describe, expect, it } from '@effect/vitest';
import {
  Context,
  Effect,
  Exit,
  Fiber,
  Layer,
  ManagedRuntime,
  Scope,
} from 'effect';
import { HttpRouter, HttpServer } from 'effect/http';
import { TestClock } from 'effect/testing';

import { createStudio } from '../app.ts';
import { OwnerDatabase, ReadinessDatabase } from '../db/client.ts';
import { migrateDatabaseEffect } from '../db/migrate.ts';
import { resolve } from '../env/resolve.ts';
import {
  databaseCheck,
  type HealthChecks,
  HealthRoutes,
  readiness,
  schemaCheckOn,
} from '../http/health.ts';
import { WebSocketDrain } from '../platform/ws-drain.ts';
import { freePort } from './support/entrypoint.ts';
import { committedMigrations } from './support/migrations.ts';
import { createScratchDatabase, reachableDb } from './support/postgres.ts';
import { testKeyringEntry } from './support/secrets.ts';
import { composeStudio } from './support/serve.ts';
import {
  openRateLimitStore,
  reachableRedis,
  REDIS_DATABASES,
} from './support/valkey.ts';

const db = await reachableDb();
const redis = await reachableRedis(REDIS_DATABASES.health);

const PROVISION_TIMEOUT_MS = 180_000;

const AUTH = {
  BETTER_AUTH_SECRET: 'a'.repeat(40),
  PUBLIC_URL: 'http://127.0.0.1:3000',
};

async function request(
  variables: Parameters<typeof resolve>[0],
  path: string,
  extraChecks: HealthChecks = {},
): Promise<{ response: Response; dispose: () => Promise<void> }> {
  const env = resolve(variables);
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
    Effect.gen(function* () {
      const running = yield* Effect.forkChild(
        readiness({ db: Effect.never, schema: ok }),
      );
      yield* TestClock.adjust('1 second');
      const result = yield* Fiber.join(running);
      expect(result.status).toBe('failing');
      expect(result.checks.db).toBe('failed: timed out after 1000ms');
      expect(result.checks.schema).toBe('ok');
    }),
  );
});

describe('the schema check on the readiness client', () => {
  it('names the database error when it cannot connect', async () => {
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
    const { response, dispose } = await request(
      { NODE_ENV: 'test' },
      '/healthz',
    );
    try {
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('{"status":"ok"}');
    } finally {
      await dispose();
    }
  });

  it('omits a check for a surface this deployment has not configured', async () => {
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
    const env = resolve({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://studio:studio@127.0.0.1:59999/studio',
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

      expect((await stack.request('/healthz')).status).toBe(200);
    } finally {
      await stack.dispose();
      await probe.dispose();
    }
  });
});

describe('a draining web process', () => {
  it('is ready until a drain starts, then 503 and names it', async () => {
    const scope = Scope.makeUnsafe();
    const built = await Effect.runPromise(
      Layer.buildWithScope(WebSocketDrain.layer, scope),
    );
    const drain = Context.get(built, WebSocketDrain);
    const { handler, dispose } = HttpRouter.toWebHandler(
      HealthRoutes({ limiter: Effect.succeed('degraded') }).pipe(
        Layer.provide(Layer.succeed(WebSocketDrain, drain)),
        Layer.provide(HttpServer.layerServices),
      ),
      { disableLogger: true },
    );
    const readyz = () =>
      handler(new Request(new URL('/readyz', 'http://studio.test')));
    try {
      const before = await readyz();
      expect(before.status).toBe(200);
      expect(await before.json()).toEqual({
        status: 'degraded',
        checks: { limiter: 'degraded' },
      });

      await Effect.runPromise(drain.drain);

      const during = await readyz();
      expect(during.status).toBe(503);
      expect(await during.json()).toEqual({
        status: 'failing',
        checks: { limiter: 'degraded', draining: 'failed: draining' },
      });
    } finally {
      await dispose();
      await Effect.runPromise(Scope.close(scope, Exit.void));
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
        STUDIO_SECRETS_KEY: testKeyringEntry('test-1'),
        ...AUTH,
      } as const;

      const probe = await readinessOver(scratch.db.url);
      const checks = {
        db: databaseCheck(probe.sql),
        schema: schemaCheckOn(probe.sql),
      };

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

      await Effect.runPromise(
        migrateDatabaseEffect(committedMigrations()).pipe(
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
