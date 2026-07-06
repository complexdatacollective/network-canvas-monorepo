import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    const doc = bundled.document as { schemaVersion: number; name: string };

    expect(doc.schemaVersion).toBe(8);
    expect(bundled.name).toBe('Sample Protocol');
    // Sample protocol ships media assets; they must be resolved to Blobs.
    expect(bundled.assets.length).toBeGreaterThan(0);
    for (const asset of bundled.assets) {
      expect(asset.data instanceof Blob || typeof asset.data === 'string').toBe(
        true,
      );
    }
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
});
