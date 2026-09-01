import { describe, expect, it } from 'vitest';

import { collectAssetReferences } from '../collectEntityAttributeReferences.ts';

// Walks the REAL protocol schema, so this covers both the walker and the
// `assetReference` tagging of each schema spot. Stage fixtures are minimal:
// the stage union discriminates on `type`, and the walker only descends into
// reference-bearing fields, so unrelated required fields can be omitted.
const protocol = {
  schemaVersion: 8,
  stages: [
    {
      id: 'roster',
      type: 'NameGeneratorRoster',
      subject: { entity: 'node', type: 'person' },
      dataSource: 'roster-asset',
    },
    {
      id: 'ng',
      type: 'NameGenerator',
      subject: { entity: 'node', type: 'person' },
      panels: [
        { id: 'panel-1', title: 'From roster', dataSource: 'panel-asset' },
        // The sentinel names the interview network, not the manifest.
        { id: 'panel-2', title: 'Already added', dataSource: 'existing' },
      ],
    },
    {
      id: 'soc',
      type: 'Sociogram',
      subject: { entity: 'node', type: 'person' },
      background: { image: 'background-asset' },
    },
    {
      id: 'geo',
      type: 'Geospatial',
      subject: { entity: 'node', type: 'person' },
      mapOptions: {
        tokenAssetId: 'token-asset',
        style: 'mapbox://styles/mapbox/standard',
        center: [0, 0],
        initialZoom: 1,
        dataSourceAssetId: 'map-data-asset',
        color: 'node-color-seq-1',
        targetFeatureProperty: 'name',
      },
    },
    {
      id: 'info',
      type: 'Information',
      title: 'About this study',
      items: [
        { id: 'i1', type: 'text', content: 'Some words about the study.' },
        { id: 'i2', type: 'asset', content: 'information-asset' },
      ],
    },
    {
      id: 'ped',
      type: 'FamilyPedigree',
      introScreen: {
        items: [
          { id: 'ii1', type: 'text', content: 'Introductory words.' },
          { id: 'ii2', type: 'asset', content: 'intro-asset' },
        ],
      },
    },
  ],
};

const assetIdsIn = (value: unknown) =>
  collectAssetReferences(value)
    .map((hit) => hit.assetId)
    .sort();

describe('collectAssetReferences', () => {
  it('finds every asset a protocol names, from the schema tags alone', () => {
    expect(assetIdsIn(protocol)).toEqual([
      'background-asset',
      'information-asset',
      'intro-asset',
      'map-data-asset',
      'panel-asset',
      'roster-asset',
      'token-asset',
    ]);
  });

  it('reports where each asset is used, as a path into the protocol', () => {
    const paths = Object.fromEntries(
      collectAssetReferences(protocol).map((hit) => [
        hit.assetId,
        hit.path.join('.'),
      ]),
    );

    expect(paths).toMatchObject({
      'roster-asset': 'stages.0.dataSource',
      'panel-asset': 'stages.1.panels.0.dataSource',
      'background-asset': 'stages.2.background.image',
      'token-asset': 'stages.3.mapOptions.tokenAssetId',
      'map-data-asset': 'stages.3.mapOptions.dataSourceAssetId',
      'information-asset': 'stages.4.items.1.content',
      'intro-asset': 'stages.5.introScreen.items.1.content',
    });
  });

  /**
   * `'existing'` occupies an asset site without being an asset id. A consumer
   * that treats every collected value as a manifest key would show it as a
   * resource in use and offer it for deletion.
   */
  it("does not report a panel's 'existing' sentinel as an asset", () => {
    expect(assetIdsIn(protocol)).not.toContain('existing');
  });

  /**
   * The whole point of deriving this from the schema: an Information item's
   * `content` is an asset id on the `asset` branch and plain prose on the
   * `text` branch, and only the tagged branch may be collected. A path list
   * that named `items[].content` could not tell them apart.
   */
  it('reads an item body as an asset only on the asset branch', () => {
    expect(assetIdsIn(protocol)).not.toContain('Some words about the study.');
    expect(assetIdsIn(protocol)).not.toContain('Introductory words.');
  });

  it('finds nothing in a protocol that names no assets', () => {
    expect(assetIdsIn({ schemaVersion: 8, stages: [] })).toEqual([]);
    expect(assetIdsIn(undefined)).toEqual([]);
  });

  it('does not index an empty value from an invalid asset-reference field', () => {
    expect(
      collectAssetReferences({
        schemaVersion: 8,
        stages: [
          {
            id: 'empty-asset',
            type: 'Information',
            title: 'Invalid asset item',
            items: [{ id: 'item-1', type: 'asset', content: '' }],
          },
        ],
      }),
    ).toEqual([]);
  });
});
