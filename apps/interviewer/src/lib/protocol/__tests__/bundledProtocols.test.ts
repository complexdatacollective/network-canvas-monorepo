import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type VersionedProtocol } from '@codaco/protocol-validation';

import { loadBundledSampleProtocol } from '../bundledProtocols';
import { importBundledProtocol } from '../importProtocol';

// Any network access during a "bundled" install is a defect: fail loudly.
const throwingFetch = vi.fn(() => {
  throw new Error('fetch must not be called during a bundled install');
});

const saveProtocol = vi.fn(async (..._args: unknown[]) => ({}) as never);
vi.mock('../../db/api', () => ({
  saveProtocol: (...args: unknown[]) => saveProtocol(...args),
}));

describe('bundled sample protocol', () => {
  beforeEach(() => {
    saveProtocol.mockClear();
    vi.stubGlobal('fetch', throwingFetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the bundled sample document and its assets without network', async () => {
    const bundled = await loadBundledSampleProtocol();

    expect(bundled.document.schemaVersion).toBe(8);
    expect(bundled.name).toBe('Sample Protocol');
    // Sample protocol ships media assets; they must be resolved to Blobs.
    expect(bundled.assets.length).toBeGreaterThan(0);
    for (const asset of bundled.assets) {
      expect(asset.data instanceof Blob || typeof asset.data === 'string').toBe(
        true,
      );
    }
    const responsiveBackground = bundled.assets.find(
      (asset) => asset.name === 'responsive-political-compass.svg',
    );
    expect(responsiveBackground?.data).toBeInstanceOf(Blob);
    if (!(responsiveBackground?.data instanceof Blob)) {
      throw new Error('Expected the responsive background to be a Blob');
    }
    expect(responsiveBackground.data.type).toBe('image/svg+xml');
  });

  it('installs through the real detect→validate→save pipeline, no fetch', async () => {
    const bundled = await loadBundledSampleProtocol();
    const phases: string[] = [];

    const result = await importBundledProtocol(bundled, (e) =>
      phases.push(e.phase),
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.migrated).toBe(false); // already schema 8
    }
    expect(saveProtocol).toHaveBeenCalledTimes(1);
    expect(throwingFetch).not.toHaveBeenCalled();
    expect(phases).toContain('saving');
  });

  it('returns schema issue details when validation fails', async () => {
    const result = await importBundledProtocol({
      name: 'Invalid Protocol',
      assets: [],
      // Deliberately malformed. `BundledProtocol.document` is typed as the
      // document a loader asserts it has — the same assertion the archive
      // reader makes — so a document that is *not* one can only be described
      // here by widening, which is exactly the runtime path under test.
      document: {
        schemaVersion: 8,
        name: 'Invalid Protocol',
        codebook: {},
        stages: 'not an array',
      } as unknown as VersionedProtocol,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('validation-failed');
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'stages',
          }),
        ]),
      );
    }
    expect(saveProtocol).not.toHaveBeenCalled();
  });
});
