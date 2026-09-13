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

it.each([false, true])(
  'bounds artifact inventory pages and checks the final page (corrupt=%s)',
  async (corrupt) => {
    const fixtures = await Promise.all(
      Array.from({ length: 65 }, (_, index) =>
        template(`Paged recovery ${index}`),
      ),
    );
    const artifacts = fixtures
      .map(({ bytes, artifact }) => ({
        root: artifact.manifest.merkle_root,
        raw_hash: templateBytesHash(bytes),
        byte_size: bytes.byteLength,
        template: artifact.manifest.template,
        metadata: artifact.metadata,
        license: artifact.license,
      }))
      .sort((a, b) => a.root.localeCompare(b.root));
    const objects = new Map(
      fixtures.map(({ bytes }) => [templateBytesHash(bytes), bytes]),
    );
    const finalHash = artifacts.at(-1)?.raw_hash;
    const batchSizes: number[] = [];
    const ownerQuery = vi.fn(
      async (sql: string, parameters?: readonly unknown[]) => {
        if (sql === 'SELECT 1') return { rows: [{ '?column?': 1 }] };
        const cursor =
          typeof parameters?.[0] === 'string' ? parameters[0] : null;
        const limit =
          typeof parameters?.[1] === 'number'
            ? parameters[1]
            : artifacts.length;
        const rows = artifacts
          .filter((row) => cursor === null || row.root > cursor)
          .slice(0, limit);
        batchSizes.push(rows.length);
        return { rows };
      },
    );
    const get = vi.fn(async (hash: string) =>
      corrupt && hash === finalHash ? null : (objects.get(hash) ?? null),
    );
    const blobs = {
      ready: vi.fn(async () => undefined),
      get,
    } as unknown as RegistryBlobStore;
    const verification = verifyRegistryRecoveryArtifacts(
      { query: ownerQuery } as unknown as pg.PoolClient,
      {
        query: vi.fn(async () => ({ rows: [{ '?column?': 1 }] })),
      } as unknown as pg.PoolClient,
      blobs,
    );
    if (corrupt)
      await expect(verification).rejects.toThrow(
        'REGISTRY_RECOVERY_ARTIFACT_INVALID',
      );
    else await expect(verification).resolves.toBeUndefined();
    expect(Math.max(...batchSizes)).toBeLessThanOrEqual(64);
    expect(batchSizes.length).toBeGreaterThan(1);
    expect(get.mock.calls.map(([hash]) => hash)).toEqual(
      artifacts.map((row) => row.raw_hash),
    );
  },
);
