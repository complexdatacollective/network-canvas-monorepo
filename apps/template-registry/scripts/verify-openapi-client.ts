import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import { getRequestListener } from '@hono/node-server';

import { createRegistryApp } from '../src/app.ts';
import type { RegistryAuth } from '../src/auth/service.ts';
import type { RegistryStore } from '../src/store.ts';

const generatorVersion = '0.29.0';
const generatedParent = await mkdtemp(
  join(tmpdir(), 'registry-openapi-client-'),
);
const generated = join(generatedParent, 'registry_client');
let receivedLimit: number | undefined;
let receivedQuery: string | undefined;
const artifactRoot = 'a'.repeat(64);
const artifactBytes = new Uint8Array([80, 75, 3, 4, 17, 34]);
// The localhost gate deliberately exposes two public read operations. The complete
// store is covered by the service suite, and no authenticated handler runs.
// oxlint-disable typescript/no-unsafe-type-assertion
const store = {
  list: async (input: { limit: number; query?: string }) => {
    receivedLimit = input.limit;
    receivedQuery = input.query;
    return { data: [], next_cursor: null, has_more: false };
  },
  artifact: async (root: string) => {
    if (root !== artifactRoot)
      throw new Error('REGISTRY_ARTIFACT_ROOT_MISMATCH');
    return { bytes: artifactBytes, rawHash: 'b'.repeat(64), yanked: false };
  },
} as unknown as RegistryStore;
const auth = {} as unknown as RegistryAuth;
// oxlint-enable typescript/no-unsafe-type-assertion
const app = createRegistryApp({
  store,
  auth,
  accepting: () => true,
  ready: async () => true,
  onDiagnostic: () => undefined,
});
const server = createServer(
  getRequestListener(app.fetch, { overrideGlobalObjects: false }),
);

try {
  const installedVersion = (
    await run('python3', [
      '-c',
      "from importlib.metadata import version; print(version('openapi-python-client'))",
    ])
  ).trim();
  if (installedVersion !== generatorVersion)
    throw new Error(
      `REGISTRY_CLIENT_GENERATOR_VERSION_MISMATCH: expected ${generatorVersion}, received ${installedVersion}`,
    );
  const generation = await run('python3', [
    '-m',
    'openapi_python_client',
    'generate',
    '--path',
    new URL('../spec/openapi-3.0.json', import.meta.url).pathname,
    '--config',
    new URL('./openapi-python-client.yaml', import.meta.url).pathname,
    '--output-path',
    generated,
    '--meta',
    'none',
  ]);
  if (/warning|unable to process/i.test(generation))
    throw new Error(`REGISTRY_CLIENT_GENERATION_WARNING\n${generation}`);

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('REGISTRY_CLIENT_TEST_LISTENER_FAILED');
  const probe = await run('python3', [
    new URL('./python-client-round-trip.py', import.meta.url).pathname,
    dirname(generated),
    `http://127.0.0.1:${address.port}`,
  ]);
  if (receivedLimit !== 7 || receivedQuery !== 'a/b?c#d&x=y+z')
    throw new Error(
      `REGISTRY_CLIENT_QUERY_ROUND_TRIP_FAILED: received limit=${String(receivedLimit)} query=${String(receivedQuery)}`,
    );
  process.stdout.write(
    `openapi-python-client ${generatorVersion}: generated without warnings; localhost round trip passed\n${probe}`,
  );
} finally {
  if (server.listening) server.close();
  await rm(generatedParent, { recursive: true, force: true });
}

async function run(command: string, args: string[]): Promise<string> {
  const child = spawn(command, args, {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
  child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
  const [code] = await once(child, 'close');
  const output = Buffer.concat([...stdout, ...stderr]).toString('utf8');
  if (code !== 0)
    throw new Error(
      `REGISTRY_CLIENT_COMMAND_FAILED: ${command} ${args.map((argument) => basename(argument)).join(' ')}\n${output}`,
    );
  return output;
}
