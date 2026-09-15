import { Hono } from 'hono';
import type pg from 'pg';

import { checkSchema } from './db/schema.ts';

// The two health routes, shared by both processes (#1897, #1909). The web
// process mounts them on its own listener (src/app.ts); the worker serves them
// on a loopback listener of its own, because a container healthcheck is the
// only reader a process that answers no request otherwise can have.
//
// It deliberately imports neither src/app.ts nor the RPC router: the worker
// reaches this module, and src/__tests__/process-separation.test.ts holds that
// graph to what a process which runs jobs may load.

/**
 * What a check reports when it did not fail. `degraded` is for a dependency
 * whose loss changes behaviour without making the process unfit to serve —
 * PR 3's Valkey limiter, which fails open.
 */
export type CheckVerdict = 'ok' | 'degraded';

/** Resolving is the verdict; throwing is `failed`, with the message as reason. */
export type HealthCheck = () => Promise<CheckVerdict>;

/**
 * The checks this process runs, named. A check that does not apply — the
 * object store on a deployment that configures none — is left out rather than
 * reported: an unconfigured surface refuses by design, and reporting it as
 * failed would make a deployment that never wanted one permanently unready.
 */
export type HealthChecks = Readonly<Record<string, HealthCheck>>;

export type ReadinessStatus = 'ok' | 'degraded' | 'failing';

export type Readiness = {
  status: ReadinessStatus;
  checks: Record<string, string>;
};

/**
 * Each check gets a second. A readiness probe has a deadline of its own, and a
 * check that hangs on a wedged socket must report the reason rather than let
 * the probe time out with nothing to say — a timed-out probe names no failing
 * dependency, which is the whole point of answering at all.
 */
const CHECK_TIMEOUT_MS = 1000;

/** One line, bounded: this ends up in a container runtime's status output. */
function reasonOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const single = message.replaceAll(/\s+/g, ' ').trim();
  return single.length > 200 ? `${single.slice(0, 197)}...` : single;
}

async function runCheck(check: HealthCheck): Promise<string> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const attempt = check();
    // The losing promise stays pending; nothing listens to it after the race,
    // so a late rejection would be unhandled.
    attempt.catch(() => undefined);
    return await Promise.race([
      attempt,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timed out after ${CHECK_TIMEOUT_MS}ms`)),
          CHECK_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (error) {
    return `failed: ${reasonOf(error)}`;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Can this process reach the database, as the role it actually runs as? Each
 * process passes its own pool — the application pool in the web process, the
 * maintenance pool in the worker — so a grant or role problem that only one of
 * them has is reported by that one.
 */
export function databaseCheck(pool: pg.Pool): HealthCheck {
  return async () => {
    await pool.query('select 1');
    return 'ok';
  };
}

/**
 * Is the database this build's? Both processes refuse a stale schema at boot
 * (src/boot.ts), but the development lane waits instead of exiting, and a
 * database can be recreated under a running process — so readiness has to say
 * so rather than infer it from the process still being alive.
 */
export function schemaCheck(pool: pg.Pool): HealthCheck {
  return async () => {
    const state = await checkSchema(pool);
    if (state.kind === 'current') return 'ok';
    throw new Error(
      state.kind === 'absent'
        ? 'no Studio schema'
        : `not this build's schema (${state.reason})`,
    );
  };
}

export async function readiness(checks: HealthChecks): Promise<Readiness> {
  // Concurrently: the budget is a second for the probe, not a second per
  // dependency, and a serial run would let one slow check hide the next one's
  // failure behind the runtime's own deadline.
  const results = await Promise.all(
    Object.entries(checks).map(
      async ([name, check]) => [name, await runCheck(check)] as const,
    ),
  );
  const verdicts = results.map(([, verdict]) => verdict);
  const status: ReadinessStatus = verdicts.some((verdict) =>
    verdict.startsWith('failed'),
  )
    ? 'failing'
    : verdicts.includes('degraded')
      ? 'degraded'
      : 'ok';
  return { status, checks: Object.fromEntries(results) };
}

/**
 * `/healthz` is liveness and says nothing about dependencies: a process that
 * answers it is running, which is what a container runtime restarts on.
 * `/readyz` is what a deployment reads before it sends traffic, and what names
 * the failing dependency when it will not. 503 only for `failing` — a degraded
 * process still serves.
 */
export function createHealthRoutes(checks: HealthChecks): Hono {
  const app = new Hono();

  app.get('/healthz', (c) => c.json({ status: 'ok' }));

  app.get('/readyz', async (c) => {
    const result = await readiness(checks);
    return c.json(result, result.status === 'failing' ? 503 : 200);
  });

  return app;
}
