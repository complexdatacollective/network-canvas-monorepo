import type pg from 'pg';
import { expect, it, vi } from 'vitest';

import { templateBytesHash } from '@codaco/studio-sync/template-exchange';

import { template } from './__tests__/fixtures.ts';
import type { RegistryBlobStore } from './blob-store.ts';
import { verifyRegistryRecoveryArtifacts } from './recovery.ts';

it('probes an empty store and keeps both pinned transactions alive after each artifact', async () => {
  const { bytes, artifact } = await template('Recovery proof');
  const rawHash = templateBytesHash(bytes);
  const rows = [
    {
      root: artifact.manifest.merkle_root,
      raw_hash: rawHash,
      byte_size: bytes.byteLength,
      template: artifact.manifest.template,
      metadata: artifact.metadata,
      license: artifact.license,
    },
  ];
  const ownerQuery = vi
    .fn()
    .mockResolvedValueOnce({ rows })
    .mockResolvedValue({ rows: [{ '?column?': 1 }] });
  const backupQuery = vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] });
  const blobs: RegistryBlobStore = {
    ready: vi.fn(async () => undefined),
    get: vi.fn(async () => bytes),
    put: vi.fn(),
    delete: vi.fn(),
    scan: vi.fn(),
    close: vi.fn(),
  } as RegistryBlobStore;

  await verifyRegistryRecoveryArtifacts(
    { query: ownerQuery } as unknown as pg.PoolClient,
    { query: backupQuery } as unknown as pg.PoolClient,
    blobs,
  );

  expect(blobs.ready).toHaveBeenCalledOnce();
  expect(ownerQuery).toHaveBeenNthCalledWith(2, 'SELECT 1');
  expect(backupQuery).toHaveBeenCalledOnce();
  expect(backupQuery).toHaveBeenCalledWith('SELECT 1');
});

it('probes object storage even when no artifacts exist', async () => {
  const ownerQuery = vi.fn().mockResolvedValue({ rows: [] });
  const ready = vi.fn(async () => {
    throw new Error('object store unavailable');
  });
  const blobs = { ready } as unknown as RegistryBlobStore;

  await expect(
    verifyRegistryRecoveryArtifacts(
      { query: ownerQuery } as unknown as pg.PoolClient,
      { query: vi.fn() } as unknown as pg.PoolClient,
      blobs,
    ),
  ).rejects.toThrow('object store unavailable');
  expect(ownerQuery).not.toHaveBeenCalled();
});
