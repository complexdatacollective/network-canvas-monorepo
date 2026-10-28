import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAssetById } from '~/utils/assetUtils';

import {
  getGeoJsonVariables,
  readGeoJsonFeatureProperties,
} from '../assetTools';

vi.mock('~/utils/assetUtils', () => ({
  getAssetById: vi.fn(),
}));

const mockedGetAssetById = vi.mocked(getAssetById);

const asBlobAsset = (geoJson: unknown) =>
  ({ data: new Blob([JSON.stringify(geoJson)]) }) as unknown as Awaited<
    ReturnType<typeof getAssetById>
  >;

describe('getGeoJsonVariables', () => {
  beforeEach(() => {
    mockedGetAssetById.mockReset();
  });

  it('unions property keys across all features', async () => {
    mockedGetAssetById.mockResolvedValue(
      asBlobAsset({
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: { name: 'A' } },
          { type: 'Feature', properties: { name: 'B', code: '02' } },
        ],
      }),
    );

    await expect(getGeoJsonVariables('asset-1')).resolves.toEqual([
      'name',
      'code',
    ]);
  });

  it('returns keys even when only a later feature has properties', async () => {
    mockedGetAssetById.mockResolvedValue(
      asBlobAsset({
        type: 'FeatureCollection',
        features: [
          { type: 'Feature' },
          { type: 'Feature', properties: {} },
          { type: 'Feature', properties: { region: 'north' } },
        ],
      }),
    );

    await expect(getGeoJsonVariables('asset-2')).resolves.toEqual(['region']);
  });

  it('returns an empty list when no feature has properties (degenerate case)', async () => {
    mockedGetAssetById.mockResolvedValue(
      asBlobAsset({
        type: 'FeatureCollection',
        features: [{ type: 'Feature' }, { type: 'Feature', properties: {} }],
      }),
    );

    await expect(getGeoJsonVariables('asset-3')).resolves.toEqual([]);
  });
});

describe('readGeoJsonFeatureProperties', () => {
  it('returns the properties of every feature that has them', () => {
    const text = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { name: 'A' } },
        { type: 'Feature' },
        { type: 'Feature', properties: null },
        { type: 'Feature', properties: { name: 'B', code: '02' } },
      ],
    });

    expect(readGeoJsonFeatureProperties(text)).toEqual([
      { name: 'A' },
      { name: 'B', code: '02' },
    ]);
  });

  it.each([
    ['a file with no features', { type: 'FeatureCollection' }],
    ['features that are not a list', { features: { type: 'Feature' } }],
    ['a file that is not an object', [1, 2, 3]],
    ['null', null],
  ])('returns no rows for %s', (_label, geoJson) => {
    expect(readGeoJsonFeatureProperties(JSON.stringify(geoJson))).toEqual([]);
  });

  it('skips entries of the feature list that are not objects', () => {
    const text = JSON.stringify({
      features: [null, 'x', { properties: { name: 'A' } }],
    });

    expect(readGeoJsonFeatureProperties(text)).toEqual([{ name: 'A' }]);
  });
});
