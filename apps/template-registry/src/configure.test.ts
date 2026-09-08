import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'vitest';

import { runRegistryConfigure } from './configure.ts';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

test('accepts bounded private stdin and returns no Registry secret', async () => {
  const root = await mkdtemp(join(tmpdir(), 'registry-configure-cli-'));
  roots.push(root);
  const output = join(root, 'configuration');
  const input = Buffer.from(
    JSON.stringify({
      domain: 'registry.example.test',
      mailFrom: 'registry@example.test',
      smtpUrl: 'smtps://private-user:private-password@mail.example.test',
      registryImage: `ghcr.io/example/registry@sha256:${'1'.repeat(64)}`,
      minioImage: `ghcr.io/example/minio@sha256:${'2'.repeat(64)}`,
      output,
    }),
  );
  const result = await runRegistryConfigure(input, 'deployment');
  expect(result).toBe('{"configured":true}\n');
  expect(result).not.toContain('private-password');
  expect(await readFile(join(output, 'registry.env'), 'utf8')).toContain(
    'private-password',
  );
});

test('refuses empty and oversized configuration input before writing', async () => {
  await expect(runRegistryConfigure(Buffer.alloc(0))).rejects.toThrow(
    'REGISTRY_CONFIGURATION_ARGUMENTS_INVALID',
  );
  await expect(runRegistryConfigure(Buffer.alloc(16_385))).rejects.toThrow(
    'REGISTRY_CONFIGURATION_ARGUMENTS_INVALID',
  );
});
