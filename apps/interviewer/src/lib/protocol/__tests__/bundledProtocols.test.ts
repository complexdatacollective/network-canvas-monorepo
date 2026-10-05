import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import developmentProtocol from '@codaco/protocols/development';

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

const developmentProtocolWithRawColors = (): unknown => {
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
      document: {
        schemaVersion: 8,
        name: 'Invalid Protocol',
        codebook: {},
        stages: 'not an array',
      },
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

  it('rejects raw colors in a current-version protocol', async () => {
    const result = await importBundledProtocol({
      name: 'Invalid Development Protocol',
      assets: [],
      document: developmentProtocolWithRawColors(),
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error('Expected raw protocol colors to fail validation');
    }
    expect(result.error).toBe('validation-failed');
    expect(
      result.issues?.filter((issue) => issue.path.endsWith('.color')),
    ).toHaveLength(2);
    expect(saveProtocol).not.toHaveBeenCalled();
  });
});
