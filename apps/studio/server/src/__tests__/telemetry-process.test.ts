import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const CANARY =
  'private-person@example.test/protocol/SecretProcessCanary?token=PrivateToken';
const entry = fileURLToPath(new URL('../index.ts', import.meta.url));

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No local port');
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function runProcess(
  telemetry: string | undefined,
  mode: 'managed' | 'self-hosted',
  failure: 'exception' | 'rejection' | 'signal',
  stalled = false,
) {
  const received: string[] = [];
  let markReceived: (() => void) | undefined;
  const firstReceived = new Promise<void>((resolve) => {
    markReceived = resolve;
  });
  const sink = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    received.push(Buffer.concat(chunks).toString('utf8'));
    markReceived?.();
    if (!stalled) {
      response.setHeader('Content-Type', 'application/json');
      response.end('{"status":1}');
    }
  });
  sink.listen(0, '127.0.0.1');
  await once(sink, 'listening');
  const address = sink.address();
  if (!address || typeof address === 'string')
    throw new Error('Sink did not bind');
  const directory = await mkdtemp(join(tmpdir(), 'studio-telemetry-process-'));
  const preload = join(directory, 'observe.mjs');
  // Use the real SDK and an actual HTTP receiver. Only the test preload maps
  // the fixed relay hostname onto that receiver; no request can reach it live.
  await writeFile(
    preload,
    `
    import { registerHooks } from 'node:module';
    process.stderr.write('TELEMETRY_TEST_CHILD_BOOTING\\n');
    const original = globalThis.fetch;
    registerHooks({ resolve(specifier, context, next) {
      if (specifier === 'posthog-node') process.send({ type: 'sdk-import' });
      return next(specifier, context);
    } });
    globalThis.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url ?? input.href);
      process.send({ type: 'egress', host: url.hostname });
      if (url.hostname !== 'ph-relay.networkcanvas.com') throw new Error('Unapproved test egress');
      return original('http://127.0.0.1:${address.port}' + url.pathname + url.search, init);
    };
    process.on('message', message => {
      if (message === 'exception') setImmediate(() => { throw new Error(${JSON.stringify(CANARY)}); });
      if (message === 'rejection') void Promise.reject({ message: ${JSON.stringify(CANARY)}, protocol: ${JSON.stringify(CANARY)} });
    });
  `,
  );
  const port = await freePort();
  const child = spawn(process.execPath, ['--import', preload, entry], {
    // Deliberately no inherited deployment credentials or developer defaults.
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: String(port),
      STUDIO_DEPLOYMENT_MODE: mode,
      ...(telemetry === undefined ? {} : { STUDIO_TELEMETRY: telemetry }),
      CLIENT_DIST: directory,
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  if (!child.stdout || !child.stderr)
    throw new Error('Child pipes unavailable');
  const stdout = child.stdout;
  const messages: unknown[] = [];
  let output = '';
  child.on('message', (message: unknown) => messages.push(message));
  child.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  const exited = once(child, 'exit');
  try {
    await new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(
        () => reject(new Error(`Child never started: ${output}`)),
        20_000,
      );
      stdout.on('data', () => {
        if (output.includes('STUDIO_SERVER_STARTED')) {
          clearTimeout(deadline);
          resolve();
        }
      });
      child.once('exit', () => {
        clearTimeout(deadline);
        reject(new Error(`Child exited before ready: ${output}`));
      });
    });
    const response = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(response.status).toBe(200);
    // Negative window covers accidentally installed startup flag/poll timers;
    // paired with the enabled fatal path proving the same sink is reachable.
    await delay(250);
    const start = performance.now();
    if (failure === 'signal') child.kill('SIGTERM');
    else child.send(failure);
    if (stalled) {
      await Promise.race([
        firstReceived,
        exited.then(() => {
          throw new Error(
            'Child exited before the telemetry receiver was reached',
          );
        }),
      ]);
      expect(child.exitCode).toBeNull();
      await expect(
        fetch(`http://127.0.0.1:${port}/healthz`, {
          signal: AbortSignal.timeout(300),
        }),
      ).rejects.toThrow();
    }
    const [code, signal] = await exited;
    return {
      code,
      signal,
      elapsed: performance.now() - start,
      received,
      messages,
      output,
    };
  } finally {
    if (child.exitCode === null) child.kill('SIGKILL');
    sink.closeAllConnections();
    await new Promise<void>((resolve) => sink.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
}

describe('running Node process telemetry', () => {
  it.each(['managed', 'self-hosted'] as const)(
    'off has zero SDK imports/egress and retains fatal exit in %s',
    async (mode) => {
      const result = await runProcess('false', mode, 'exception');
      expect(result.code).toBe(1);
      expect(result.signal).toBeNull();
      expect(result.output).toContain('STUDIO_PROCESS_FAILED');
      expect(result.messages).toEqual([]);
      expect(result.received).toEqual([]);
      expect(result.output).not.toContain(CANARY);
    },
  );

  it.each(['managed', 'self-hosted'] as const)(
    'unset reports a sanitized fatal error through the real sink in %s',
    async (mode) => {
      const result = await runProcess(undefined, mode, 'exception');
      expect(result.code).toBe(1);
      expect(result.received).toHaveLength(1);
      expect(result.messages).toContainEqual({ type: 'sdk-import' });
      expect(result.messages).toContainEqual({
        type: 'egress',
        host: 'ph-relay.networkcanvas.com',
      });
      expect(result.received[0]).toContain('server_uncaught_exception');
      expect(result.received[0]).toContain('"handled":false');
      expect(JSON.stringify(result)).not.toMatch(
        /SecretProcessCanary|PrivateToken|private-person/,
      );
    },
  );

  it('reports a non-Error unhandled rejection and preserves exit 1', async () => {
    const result = await runProcess('true', 'self-hosted', 'rejection');
    expect(result.code).toBe(1);
    expect(result.received).toHaveLength(1);
    expect(result.received[0]).toContain('server_unhandled_rejection');
    expect(JSON.stringify(result)).not.toContain(CANARY);
  });

  it('exits within the fatal flush bound even when the receiver never answers', async () => {
    const result = await runProcess('true', 'self-hosted', 'exception', true);
    expect(result.code).toBe(1);
    expect(result.received).toHaveLength(1);
    expect(result.elapsed).toBeLessThan(2_000);
  });

  it.each(['true', 'false'])(
    'retains clean SIGTERM exit without synthesizing an exception when telemetry=%s',
    async (enabled) => {
      const result = await runProcess(enabled, 'self-hosted', 'signal');
      expect(result.code).toBe(0);
      expect(result.received).toEqual([]);
      expect(
        result.messages.filter(
          (item) =>
            typeof item === 'object' &&
            item !== null &&
            'type' in item &&
            item.type === 'egress',
        ),
      ).toEqual([]);
    },
  );
});
