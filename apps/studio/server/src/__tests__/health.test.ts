import { afterAll, describe, expect, it } from 'vitest';

import { renderSchemaDdl } from '../../scripts/render-schema-ddl.ts';
import { createApp } from '../app.ts';
import { createAssetStore } from '../assets.ts';
import { migrateDatabase } from '../db/migrate.ts';
import { resolve } from '../env/resolve.ts';
import { readiness } from '../health.ts';
import { createScratchDatabase, reachableDb } from './support/postgres.ts';

// Liveness and readiness on the web process (#1897, #1909). The worker serves
// the same two routes on a loopback listener of its own, which only a real
// process can show — that half is in worker-entrypoint.test.ts.

const db = await reachableDb();

/** Rendering the DDL imports drizzle-kit; the migrate itself takes a second. */
const PROVISION_TIMEOUT_MS = 180_000;

const AUTH = {
  BETTER_AUTH_SECRET: 'a'.repeat(40),
  PUBLIC_URL: 'http://127.0.0.1:3000',
};

describe('a readiness verdict', () => {
  it('is ok when every check is', async () => {
    expect(
      await readiness({ db: async () => 'ok', schema: async () => 'ok' }),
    ).toEqual({ status: 'ok', checks: { db: 'ok', schema: 'ok' } });
  });

  it('is degraded, not failing, when a check reports degraded', async () => {
    // The shape PR 3's Valkey limiter reports: it fails open, so losing it
    // changes what a deployment enforces without making the process unfit to
    // serve — and taking the container out of rotation for it would turn a
    // rate-limit outage into an availability one.
    expect(
      await readiness({
        db: async () => 'ok',
        limiter: async () => 'degraded',
      }),
    ).toEqual({
      status: 'degraded',
      checks: { db: 'ok', limiter: 'degraded' },
    });
  });

  it('names the reason a check failed', async () => {
    // Naming it is the point: an operator reading a 503 has to learn which
    // dependency, from the response, without a shell on the container.
    const result = await readiness({
      db: () => Promise.reject(new Error('connect ECONNREFUSED')),
      schema: async () => 'ok',
    });
    expect(result.status).toBe('failing');
    expect(result.checks.db).toBe('failed: connect ECONNREFUSED');
    expect(result.checks.schema).toBe('ok');
  });

  it('fails a check that hangs rather than hanging with it', async () => {
    // A wedged socket is the case this exists for: without the bound, the
    // probe times out at the runtime's deadline with nothing to say, and every
    // check's verdict is lost along with the one that hung.
    const result = await readiness({
      db: () => new Promise<never>(() => undefined),
      schema: async () => 'ok',
    });
    expect(result.status).toBe('failing');
    expect(result.checks.db).toMatch(/^failed: timed out after \d+ms$/);
    // The others still answered, which is what running them concurrently buys.
    expect(result.checks.schema).toBe('ok');
  });
});

describe('the object-store check', () => {
  it('aborts the request rather than only giving up on it', async () => {
    // The route can stop waiting on its own, but the SDK would carry on
    // retrying and holding a socket — once per probe, every few seconds, for
    // as long as the endpoint is unreachable. So the deadline is handed to the
    // command as well, and this is what says it arrived: an abort, not the
    // transport error the SDK would have reached on its own.
    const store = createAssetStore({
      endpoint: 'http://127.0.0.1:59998',
      region: 'us-east-1',
      bucket: 'studio-test',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
    });

    await expect(store.head(AbortSignal.timeout(1))).rejects.toThrow(/abort/i);
  });
});

describe('the web process routes', () => {
  it('answers /healthz without asking anything', async () => {
    // Liveness: a process that answers is running. It must not consult a
    // dependency — a container runtime restarts on this, and restarting a
    // healthy process because Postgres is down is how an outage doubles.
    const response = await createApp(resolve({ NODE_ENV: 'test' })).request(
      '/healthz',
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('omits a check for a surface this deployment has not configured', async () => {
    // No database and no object store: both refuse by design, and reporting
    // them failed would make a deployment that never wanted one permanently
    // unready.
    const response = await createApp(resolve({ NODE_ENV: 'test' })).request(
      '/readyz',
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', checks: {} });
  });

  it('is 503 and names the database when the pool cannot connect', async () => {
    // An unroutable loopback port: nothing answers it, and nothing real is
    // dialled.
    const app = createApp(
      resolve({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgres://studio:studio@127.0.0.1:59999/studio',
        ...AUTH,
      }),
    );

    const response = await app.request('/readyz');
    expect(response.status).toBe(503);
    const body = (await response.json()) as {
      status: string;
      checks: Record<string, string>;
    };
    expect(body.status).toBe('failing');
    expect(body.checks.db).toMatch(/^failed: /);

    // And liveness is unaffected: the process is running, the database is not.
    expect((await app.request('/healthz')).status).toBe(200);
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
      const env = resolve({
        NODE_ENV: 'test',
        DATABASE_URL: scratch.db.url,
        ...AUTH,
      });

      // Before the schema exists, readiness says so by name rather than
      // reporting a healthy process with nothing behind it.
      const app = createApp(env);
      const unprovisioned = await app.request('/readyz');
      expect(unprovisioned.status).toBe(503);
      expect(
        ((await unprovisioned.json()) as { checks: Record<string, string> })
          .checks.schema,
      ).toMatch(/^failed: /);

      await migrateDatabase(scratch.pool, await renderSchemaDdl());

      // A second app, because the first one's pool is pinned to studio_app and
      // was refused at connect before that role existed.
      const ready = await createApp(env).request('/readyz');
      expect(ready.status).toBe(200);
      expect(await ready.json()).toEqual({
        status: 'ok',
        checks: { db: 'ok', schema: 'ok' },
      });
    },
    PROVISION_TIMEOUT_MS,
  );
});
