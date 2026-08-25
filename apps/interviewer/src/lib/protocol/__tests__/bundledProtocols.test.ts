import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type VersionedProtocol } from '@codaco/protocol-validation';
import developmentProtocol from '@codaco/protocols/development';

import { resolveAssets } from '../bundledAssets';
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

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const developmentProtocolWithLegacyColors = (): unknown => {
  const document: unknown = structuredClone(developmentProtocol);
  if (!isRecord(document)) {
    throw new Error('Development protocol fixture has no stages');
  }
  const stages = document.stages;
  if (!Array.isArray(stages)) {
    throw new Error('Development protocol fixture has no stages');
  }

  const findStage = (type: string): UnknownRecord => {
    const stage = stages.find(
      (candidate) => isRecord(candidate) && candidate.type === type,
    );
    if (!isRecord(stage)) throw new Error(`Missing ${type} fixture stage`);
    return stage;
  };

  const narrative = findStage('NarrativePedigree');
  if (!Array.isArray(narrative.diseases) || !isRecord(narrative.diseases[0])) {
    throw new Error('Narrative Pedigree fixture has no disease');
  }
  narrative.diseases[0].color = '#cc0000';

  const geospatial = findStage('Geospatial');
  if (!isRecord(geospatial.mapOptions)) {
    throw new Error('Geospatial fixture has no map options');
  }
  geospatial.mapOptions.color = '#3399ff';

  return document;
};

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

  it('repairs shipped colors before admitting a current-version protocol', async () => {
    const result = await importBundledProtocol({
      name: 'Legacy Development Protocol',
      assets: [],
      // Deliberately legacy-shaped (raw hex colors the repair rewrites), so
      // it can only be described by widening — the same runtime path the
      // malformed-document test above exercises.
      document: developmentProtocolWithLegacyColors() as VersionedProtocol,
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error(`Expected import success, received ${result.error}`);
    }
    expect(result.migrated).toBe(false);
    const narrative = result.protocol.stages.find(
      (stage) => stage.type === 'NarrativePedigree',
    );
    const geospatial = result.protocol.stages.find(
      (stage) => stage.type === 'Geospatial',
    );
    expect(narrative).toMatchObject({
      diseases: [{ color: 'node-color-seq-1' }],
    });
    expect(geospatial).toMatchObject({
      mapOptions: { color: 'ord-color-seq-6' },
    });
    expect(saveProtocol).toHaveBeenCalledTimes(1);
  });
});

describe('resolveAssets manifest identity', () => {
  // The manifest KEY is the asset id; the inline `id` field is an optional
  // legacy echo (schema 8 keeps it optional). The Development protocol's
  // canonical source carries no inline ids, and requiring one silently
  // dropped every bundled asset — installs "succeeded" with an empty asset
  // store, so roster stages resolved no rows and synthetic generation's
  // feasibility gate refused the whole protocol.
  it('resolves entries that carry no inline id, keyed by the manifest key', () => {
    const bytes = new TextEncoder().encode('uid,name\n1,Community Clinic\n')
      .buffer as ArrayBuffer;
    const assets = resolveAssets(
      {
        assetManifest: {
          'HIVServices-csv': {
            name: 'HIVServices.csv',
            source: 'HIVServices.csv',
            type: 'network',
          },
          'mapbox-key': {
            name: 'Mapbox token',
            type: 'apikey',
            value: 'pk.test',
          },
        },
      },
      { '/x/assets/HIVServices.csv': bytes },
    );

    expect(assets.map((asset) => asset.id).toSorted()).toEqual([
      'HIVServices-csv',
      'mapbox-key',
    ]);
    expect(assets.find((a) => a.id === 'HIVServices-csv')?.data).toBeInstanceOf(
      Blob,
    );
    expect(assets.find((a) => a.id === 'mapbox-key')?.data).toBe('pk.test');
  });

  // The dev bundle eagerly globs ~25MB of assets (a 24MB video included);
  // transforming that to arraybuffer modules can exceed the default timeout
  // on a contended CI runner, so this test gets generous headroom.
  it(
    'resolves every Development protocol manifest entry',
    { timeout: 120_000 },
    async () => {
      const { loadBundledDevelopmentProtocol } =
        await import('../bundledDevelopmentProtocol');
      const bundled = await loadBundledDevelopmentProtocol();
      const manifest =
        (bundled.document as { assetManifest?: Record<string, unknown> })
          .assetManifest ?? {};

      expect(Object.keys(manifest).length).toBeGreaterThan(0);
      expect(bundled.assets.map((asset) => asset.id).toSorted()).toEqual(
        Object.keys(manifest).toSorted(),
      );
    },
  );
});
