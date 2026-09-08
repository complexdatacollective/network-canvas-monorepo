import {
  chmod,
  mkdtemp,
  rm,
  symlink,
  truncate,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'vitest';

import { templateBytesHash } from '@codaco/studio-sync/template-exchange';

import { readRegistryRecoveryReconciliation } from './recovery-reconciliation.ts';

const evidence = {
  format: 'template-registry-recovery-reconciliation',
  version: 1,
  users: [],
};
const bytes = Buffer.from(JSON.stringify(evidence) + '\n');

it('verifies the exact private evidence bytes before parsing', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'registry-evidence-'));
  const path = join(directory, 'current.json');
  try {
    await writeFile(path, bytes, { mode: 0o600 });
    await expect(
      readRegistryRecoveryReconciliation(path, templateBytesHash(bytes)),
    ).resolves.toEqual(evidence);
    await expect(
      readRegistryRecoveryReconciliation(
        path,
        templateBytesHash(bytes.subarray(0, -1)),
      ),
    ).rejects.toThrow('REGISTRY_RECOVERY_RECONCILIATION_INVALID');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it.each(['symlink', 'readable-by-others', 'oversized', 'empty', 'malformed'])(
  'refuses %s evidence without accepting the expected hash alone',
  async (kind) => {
    const directory = await mkdtemp(
      join(tmpdir(), 'registry-evidence-invalid-'),
    );
    const path = join(directory, 'current.json');
    try {
      await writeFile(path, bytes, { mode: 0o600 });
      let target = path;
      let expected = templateBytesHash(bytes);
      if (kind === 'symlink') {
        target = join(directory, 'link');
        await symlink(path, target);
      }
      if (kind === 'readable-by-others') await chmod(path, 0o644);
      if (kind === 'oversized') await truncate(path, 16 * 1024 * 1024 + 1);
      if (kind === 'empty') {
        await truncate(path, 0);
        expected = templateBytesHash(new Uint8Array());
      }
      if (kind === 'malformed') {
        const invalid = Buffer.from('{');
        await writeFile(path, invalid);
        expected = templateBytesHash(invalid);
      }
      await expect(
        readRegistryRecoveryReconciliation(target, expected),
      ).rejects.toThrow('REGISTRY_RECOVERY_RECONCILIATION_INVALID');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
