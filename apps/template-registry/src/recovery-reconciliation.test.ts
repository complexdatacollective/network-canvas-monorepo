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

import {
  copyRegistryRecoveryReconciliation,
  createRegistryRecoveryInventory,
  readRegistryRecoveryReconciliation,
} from './recovery-reconciliation.ts';

const emptyInventory = createRegistryRecoveryInventory('users', []);
const evidence = {
  format: 'template-registry-recovery-reconciliation' as const,
  version: 3 as const,
  inventories: {
    users: emptyInventory,
    publishers: createRegistryRecoveryInventory('publishers', []),
    operators: createRegistryRecoveryInventory('operators', []),
    entries: createRegistryRecoveryInventory('entries', []),
  },
};
const bytes = Buffer.from(JSON.stringify(evidence) + '\n');

it('builds canonical, ordered inventories that bind every authority field', () => {
  const entry = createRegistryRecoveryInventory('entries', [
    {
      id: '00000000-0000-4000-8000-00000000000A',
      publisherId: '00000000-0000-4000-8000-00000000000B',
      artifactRoot: 'c'.repeat(64),
    },
  ]);
  expect(entry.count).toBe('1');
  expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(
    createRegistryRecoveryInventory('entries', [
      {
        id: '00000000-0000-4000-8000-00000000000a',
        publisherId: '00000000-0000-4000-8000-00000000000b',
        artifactRoot: 'd'.repeat(64),
      },
    ]).sha256,
  ).not.toBe(entry.sha256);
  expect(() =>
    createRegistryRecoveryInventory('users', [
      { id: 'z', email: 'z@example.test', emailVerified: true },
      { id: 'a', email: 'a@example.test', emailVerified: true },
    ]),
  ).toThrow('strictly ordered');
  expect(
    createRegistryRecoveryInventory('users', [
      {
        id: 'publisher',
        email: 'Researcher@EXAMPLE.TEST',
        emailVerified: true,
      },
    ]),
  ).toEqual(
    createRegistryRecoveryInventory('users', [
      {
        id: 'publisher',
        email: 'Researcher@example.test',
        emailVerified: true,
      },
    ]),
  );
  expect(() =>
    copyRegistryRecoveryReconciliation({
      ...evidence,
      version: 2 as never,
    }),
  ).toThrow();
});

it('keeps independently prepared evidence bounded for large populations', () => {
  function* entries() {
    for (let index = 0; index < 200_000; index += 1)
      yield {
        id: `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
        publisherId: '00000000-0000-4000-8000-000000000001',
        artifactRoot: index.toString(16).padStart(64, '0'),
      };
  }
  const large = {
    ...evidence,
    inventories: {
      ...evidence.inventories,
      entries: createRegistryRecoveryInventory('entries', entries()),
    },
  };
  expect(large.inventories.entries.count).toBe('200000');
  expect(Buffer.byteLength(JSON.stringify(large))).toBeLessThan(1024);
});

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
    const legacy = Buffer.from(JSON.stringify({ ...evidence, version: 2 }));
    await writeFile(path, legacy, { mode: 0o600 });
    await expect(
      readRegistryRecoveryReconciliation(path, templateBytesHash(legacy)),
    ).rejects.toThrow('REGISTRY_RECOVERY_RECONCILIATION_INVALID');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it.each([
  `{ "format":"template-registry-recovery-reconciliation", "version":3, "version":2, "inventories":${JSON.stringify(evidence.inventories)} }`,
  `{ "format":"template-registry-recovery-reconciliation", "version":3, "inventories":{ "users":${JSON.stringify(emptyInventory)}, "users":${JSON.stringify(emptyInventory)}, "publishers":${JSON.stringify(emptyInventory)}, "operators":${JSON.stringify(emptyInventory)}, "entries":${JSON.stringify(emptyInventory)} } }`,
])(
  'rejects duplicate recovery evidence members before parsing: %s',
  async (text) => {
    const directory = await mkdtemp(
      join(tmpdir(), 'registry-evidence-duplicate-'),
    );
    const path = join(directory, 'current.json');
    try {
      const duplicateBytes = Buffer.from(text);
      await writeFile(path, duplicateBytes, { mode: 0o600 });
      await expect(
        readRegistryRecoveryReconciliation(
          path,
          templateBytesHash(duplicateBytes),
        ),
      ).rejects.toThrow('REGISTRY_RECOVERY_RECONCILIATION_INVALID');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

it('rejects malformed UTF-8 recovery evidence before JSON parsing', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'registry-evidence-utf8-'));
  const path = join(directory, 'current.json');
  try {
    const malformed = Buffer.from([
      0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d,
    ]);
    await writeFile(path, malformed, { mode: 0o600 });
    await expect(
      readRegistryRecoveryReconciliation(path, templateBytesHash(malformed)),
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
