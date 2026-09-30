import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { createConnection, createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

// Running an entrypoint as a deployment runs it: a process of its own, started
// from one of the image's two commands (#1895). Some properties only exist at
// that scale — what a process prints at boot, what it binds, whether a
// container stop ends it — and no in-process test of the module it loads can
// answer them.

const SERVER_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

/** Enough for a boot that waits on a database and a schema check or two. */
const DEFAULT_BOOT_TIMEOUT_MS = 30_000;

/** What `spawn` returns for this stdio shape: no stdin, both outputs piped. */
type EntrypointProcess = ChildProcessByStdio<null, Readable, Readable>;

export type Entrypoint = {
  child: EntrypointProcess;
  /** Everything the process has printed, both streams, in arrival order. */
  output: () => string;
  waitForOutput: (pattern: RegExp, timeoutMs?: number) => Promise<void>;
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
};

/**
 * @param entry a path under the server package, e.g. `src/worker.ts`.
 * @param env variables layered over this process's own, which carry the
 * committed development defaults the suite runs under. A case whose subject is
 * the deployment lane overrides those deliberately.
 */
export function startEntrypoint(
  entry: string,
  env: Record<string, string>,
): Entrypoint {
  const child: EntrypointProcess = spawn(
    process.execPath,
    [resolve(SERVER_ROOT, entry)],
    {
      /* oxlint-disable-next-line node/no-process-env -- the harness hands this process's whole environment to the child, which is what makes the child a deployment-shaped run of the entrypoint */
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

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
    waitForOutput: (pattern, timeoutMs = DEFAULT_BOOT_TIMEOUT_MS) =>
      new Promise<void>((settled, failed) => {
        const check = () => {
          if (!pattern.test(output)) return;
          clearTimeout(timer);
          settled();
        };
        const timer = setTimeout(() => {
          failed(
            new Error(
              `${entry} never printed ${String(pattern)}; it printed:\n${output}`,
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
export async function freePort(): Promise<number> {
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

/**
 * Whether nothing is listening at `host:port` — a refused connection, or one
 * that never completes.
 *
 * @param host which address to try. The default is the loopback; a caller
 * proving a listener is NOT published passes one of this machine's external
 * addresses instead.
 * @param timeoutMs how long to wait before calling it unreachable. A closed
 * port answers with RST at once, but a host firewall drops the SYN instead
 * (macOS does this for the machine's own LAN address), and waiting for an
 * error that will never arrive would hang the case rather than answer it. The
 * bound is generous for a connection to this same machine, so a listener that
 * IS published still connects well inside it.
 */
export function connectionRefused(
  port: number,
  host = '127.0.0.1',
  timeoutMs = 2000,
): Promise<boolean> {
  return new Promise((settled) => {
    const socket = createConnection({ host, port });
    const done = (refused: boolean) => {
      clearTimeout(timer);
      socket.destroy();
      settled(refused);
    };
    const timer = setTimeout(() => done(true), timeoutMs);
    socket.on('connect', () => done(false));
    socket.on('error', () => done(true));
  });
}
