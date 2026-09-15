import type pg from 'pg';

import { isMissingRoleError } from './db/pool.ts';
import {
  checkSchema,
  type SchemaProblem,
  type SchemaState,
  schemaProblemMessage,
} from './db/schema.ts';
import type { StudioEnv } from './env.ts';

// What both entrypoints do before they do their own work: refuse to run
// against a database this build did not create. The web process and the
// worker verify the same fingerprint the same way (#1895) — a worker that
// tolerated a stale schema would run handlers against tables the build no
// longer describes, which is exactly the failure the web process refuses.

const RETRY_INTERVAL_MS = 3000;

export type AwaitCurrentSchemaOptions = {
  /**
   * Called once the schema is current: immediately when it already was, and
   * from the retry otherwise. What each process starts only when it may talk
   * to the database.
   */
  onCurrent: () => void;
};

/**
 * Resolves as soon as the verdict is known, not when the schema is current:
 * the development lane comes up and waits, so the process is already running
 * when `pnpm dev`'s reset finishes.
 */
export async function awaitCurrentSchema(
  pool: pg.Pool,
  env: StudioEnv,
  { onCurrent }: AwaitCurrentSchemaOptions,
): Promise<void> {
  // Outside development a stale or absent schema is a resolved answer, not a
  // transient failure: retrying re-reads the same fingerprint every three
  // seconds. The development lane waits instead, the same way it waits for the
  // container itself: `pnpm dev` finishes its reset before this process starts,
  // but a server started on its own against a database another build applied,
  // or a `db:reset` run beside a running server, should recover by themselves
  // once the schema is current.
  const exitIfFatal = (state: SchemaState): void => {
    if (state.kind !== 'current' && !env.devDefaults) {
      // The deployed remedies: this line is read in a container log, where
      // the checkout's pnpm scripts and drizzle-kit do not exist.
      // oxlint-disable-next-line no-console -- boot diagnostics
      console.error(schemaProblemMessage(state, 'deployed'));
      process.exit(1);
    }
  };

  // One attempt at a time: an attempt against an unreachable host can
  // outlive its tick, and stacking them would exhaust the pool. A mismatch
  // found mid-retry still takes the process down.
  const waitUntilCurrent = () => {
    let attempting = false;
    const retry = setInterval(() => {
      if (attempting) return;
      attempting = true;
      void checkSchema(pool)
        .then((state) => {
          exitIfFatal(state);
          if (state.kind === 'current') {
            clearInterval(retry);
            onCurrent();
            // oxlint-disable-next-line no-console -- boot diagnostics
            console.log('Database schema current.');
          }
          return undefined;
        })
        .catch(() => undefined)
        .finally(() => {
          attempting = false;
        });
    }, RETRY_INTERVAL_MS);
    retry.unref();
  };

  // Everything below `exitIfFatal` is the development lane by construction:
  // outside it the call above has already ended the process, so the pnpm
  // remedies these name are remedies the reader can run.
  const waitForSchema = (state: SchemaProblem) => {
    exitIfFatal(state);
    // oxlint-disable-next-line no-console -- boot diagnostics
    console.warn(
      state.kind === 'absent'
        ? 'Database has no Studio schema; sign-in will fail until it is created: pnpm --filter @codaco/studio-server db:reset'
        : 'Database schema is not from this build; waiting for the development reset (pnpm dev runs it on boot; otherwise: pnpm --filter @codaco/studio-server db:reset)',
    );
    waitUntilCurrent();
  };

  try {
    const state = await checkSchema(pool);
    if (state.kind === 'current') {
      onCurrent();
    } else {
      waitForSchema(state);
    }
  } catch (error) {
    // The pools run as roles the schema apply creates, so a never-applied
    // database refuses the connection before the fingerprint can be read.
    if (isMissingRoleError(error)) {
      waitForSchema({ kind: 'absent' });
    } else {
      if (!env.devDefaults) throw error;
      // oxlint-disable-next-line no-console -- boot diagnostics
      console.warn(
        `Database unreachable; sign-in will fail until it is available: ${String(error)}`,
      );
      waitUntilCurrent();
    }
  }
}
