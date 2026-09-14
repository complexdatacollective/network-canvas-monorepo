// The worker as a deployment actually runs it: a process started from the
// image's second command (#1895). Everything here is a property of the whole
// process — what it prints at boot, that it listens on nothing, and that a
// container stop ends it cleanly — none of which an in-process test of
// `createJobWorker` can answer.
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { createConnection, createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applySchema } from '../../scripts/apply.ts';
import { createScratchDatabase, reachableDb } from './support/postgres.ts';

const db = await reachableDb();

const WORKER_ENTRY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../worker.ts',
);

/** drizzle-kit push against a fresh database, and it shares the CI runner. */
const APPLY_TIMEOUT_MS = 180_000;
const BOOT_TIMEOUT_MS = 30_000;
const STOP_TIMEOUT_MS = 10_000;

/** What `spawn` returns for this stdio shape: no stdin, both outputs piped. */
type WorkerProcess = ChildProcessByStdio<null, Readable, Readable>;

type Worker = {
  child: WorkerProcess;
  /** Everything the process has printed, both streams, in arrival order. */
  output: () => string;
  waitForOutput: (pattern: RegExp, timeoutMs?: number) => Promise<void>;
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
};

/**
 * The deployment's environment, minus the development lane: the committed
 * `.env.development` this suite runs under would otherwise hand the child a
 * console mailer and the lenient schema wait, which are precisely the two
 * behaviours these cases are about.
 */
function startWorker(overrides: Record<string, string>): Worker {
  const child: WorkerProcess = spawn(process.execPath, [WORKER_ENTRY], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      STUDIO_DEV_DEFAULTS: '',
      // No transport at all, so the worker has to say so rather than falling
      // back to the development console mailer.
      SMTP_URL: '',
      EMAIL_FROM: '',
      ...overrides,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  const listeners: (() => void)[] = [];
  const record = (chunk: Buffer) => {
    output += chunk.toString();
    for (const notify of listeners) notify();
  };
  child.stdout.on('data', record);
  child.stderr.on('data', record);

  const exited = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((done) => {
    child.on('exit', (code, signal) => done({ code, signal }));
  });

  return {
    child,
    output: () => output,
    waitForOutput: (pattern, timeoutMs = BOOT_TIMEOUT_MS) =>
      new Promise<void>((settled, failed) => {
        const check = () => {
          if (!pattern.test(output)) return;
          clearTimeout(timer);
          settled();
        };
        const timer = setTimeout(() => {
          failed(
            new Error(
              `the worker never printed ${String(pattern)}; it printed:\n${output}`,
            ),
          );
        }, timeoutMs);
        listeners.push(check);
        // The line may already have arrived before this call.
        check();
      }),
    exited,
  };
}

/** A port nothing is using, so that a refused connection means nobody bound it. */
async function freePort(): Promise<number> {
  const server = createServer();
  const port = await new Promise<number>((settled) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      settled(typeof address === 'object' && address ? address.port : 0);
    });
  });
  await new Promise<void>((settled) => server.close(() => settled()));
  return port;
}

function connectionRefused(port: number): Promise<boolean> {
  return new Promise((settled) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.on('connect', () => {
      socket.destroy();
      settled(false);
    });
    socket.on('error', () => settled(true));
  });
}

describe.skipIf(!db)('the worker entrypoint', () => {
  let applied: Awaited<ReturnType<typeof createScratchDatabase>>;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    applied = await createScratchDatabase(db);
    await applySchema(applied.pool);
  }, APPLY_TIMEOUT_MS);

  afterAll(async () => {
    await applied.dispose();
  });

  it('starts, reports the missing transport, binds nothing, and stops on SIGTERM', async () => {
    const port = await freePort();
    const worker = startWorker({
      DATABASE_URL: applied.db.url,
      // Nothing should bind this; the probe below is the assertion.
      PORT: String(port),
    });
    try {
      await worker.waitForOutput(
        /Network Canvas Studio worker \d+\.\d+\.\d+.* started/,
      );
      // Unset SMTP is a supported state, not a refusal: the jobs queue until
      // a worker with mail configured returns (#1895). It only has to be loud.
      await worker.waitForOutput(/No mail transport is configured/);
      expect(worker.output()).toMatch(/invitation-delivery and sign-in-email/);

      // Two independent readings of "it binds no port": it never announced a
      // listener, and the port it was given refuses a connection.
      expect(worker.output()).not.toMatch(/listening on/i);
      expect(await connectionRefused(port)).toBe(true);

      worker.child.kill('SIGTERM');
      // A container stop is a SIGTERM and a deadline. Anything but a clean
      // zero here is a stop the orchestrator would eventually have to kill.
      const timeout = setTimeout(
        () => worker.child.kill('SIGKILL'),
        STOP_TIMEOUT_MS,
      );
      const { code, signal } = await worker.exited;
      clearTimeout(timeout);
      expect({ code, signal }).toEqual({ code: 0, signal: null });
    } finally {
      worker.child.kill('SIGKILL');
    }
  });

  it('refuses to run with no database at all', async () => {
    // The web process serves a useful surface without one; a worker has no
    // work, and a container that stayed up would look healthy while running
    // nothing.
    const worker = startWorker({ DATABASE_URL: '' });
    try {
      const { code } = await worker.exited;
      expect(code).toBe(1);
      expect(worker.output()).toMatch(
        /DATABASE_URL is required for the worker process/,
      );
    } finally {
      worker.child.kill('SIGKILL');
    }
  });

  it('refuses a database this build did not create', async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    // Outside development a stale or absent schema is an answer, not a
    // transient failure — the same verdict the web process boots on, reached
    // through the same boot module.
    const empty = await createScratchDatabase(db);
    const worker = startWorker({ DATABASE_URL: empty.db.url });
    try {
      const { code } = await worker.exited;
      expect(code).toBe(1);
      expect(worker.output()).toMatch(/The database has no Studio schema/);
    } finally {
      worker.child.kill('SIGKILL');
      await empty.dispose();
    }
  });
});
