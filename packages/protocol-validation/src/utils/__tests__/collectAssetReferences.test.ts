import { describe, expect, it } from 'vitest';

import { collectAssetReferences } from '../collectEntityAttributeReferences.ts';
import { localized } from '../test-utils.ts';

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
      allAddedNotice: localized('There is nothing left to add from this list.'),
      unnamedLabel: localized('Unnamed {count}'),
      subject: { entity: 'node', types: ['person'] },
      dataSource: 'roster-asset',
    },
    {
      id: 'ng',
      type: 'NameGenerator',
      subject: { entity: 'node', types: ['person'] },
      panels: [
        {
          id: 'panel-1',
          title: localized('From roster'),
          dataSource: 'panel-asset',
        },
        // The sentinel names the interview network, not the manifest.
        { id: 'panel-2', title: 'Already added', dataSource: 'existing' },
      ],
    },
    {
      id: 'soc',
      type: 'Sociogram',
      subject: { entity: 'node', types: ['person'] },
      background: { image: 'background-asset' },
    },
    {
      id: 'geo',
      type: 'Geospatial',
      offlineNotice: localized(
        'You are offline — the map will not load until you reconnect.',
      ),
      mapUnavailable: localized(
        'This can happen if your browser or device does not support the features the map requires (for example, WebGL). Try a different browser or device, or contact the study organizer. You may be able to continue your interview by selecting the next arrow.',
      ),
      outsideAreasLabel: localized('Outside Selectable Areas'),
      subject: { entity: 'node', types: ['person'] },
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
      content: localized(
        '# About this study\n\nSome words about the study.\n\n![](asset:information-asset)',
      ),
    },
  ],
};

const assetIdsIn = (value: unknown) =>
  collectAssetReferences(value)
    .map((hit) => hit.assetId)
    .toSorted();

describe('collectAssetReferences', () => {
  it('finds every asset a protocol names, from the schema tags alone', () => {
    expect(assetIdsIn(protocol)).toEqual([
      'background-asset',
      'information-asset',
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
      'information-asset': 'stages.4.content.en',
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
   * An Information page's `content` is prose with files shown as blocks
   * among it, and only the blocks name assets: the words around them are
   * not ids.
   */
  it('reads a page as naming only the assets its blocks name', () => {
    expect(assetIdsIn(protocol)).not.toContain('Some words about the study.');
    expect(assetIdsIn(protocol)).not.toContain('# About this study');
  });

  describe('files shown as blocks in text', () => {
    const page = (content: unknown) => ({
      schemaVersion: 9,
      stages: [{ id: 'info', type: 'Information', content }],
    });
    const found = (content: unknown) =>
      collectAssetReferences(page(content)).map((hit) => [
        hit.assetId,
        hit.path.join('.'),
      ]);

    it('collects the blocks of every language, each at its translation', () => {
      expect(
        found({
          en: '![A](asset:one)\n\n![B](asset:two)',
          fr: '![C](asset:three)',
        }),
      ).toEqual([
        ['one', 'stages.0.content.en'],
        ['two', 'stages.0.content.en'],
        ['three', 'stages.0.content.fr'],
      ]);
    });

    it('collects an asset named twice once for each time it is named', () => {
      expect(
        found({
          en: '![A](asset:one)\n\n![B](asset:one?size=small)',
          fr: '![C](asset:one)',
        }),
      ).toEqual([
        ['one', 'stages.0.content.en'],
        ['one', 'stages.0.content.en'],
        ['one', 'stages.0.content.fr'],
      ]);
    });

    it('collects a block in any version a select chooses between', () => {
      expect(
        found({
          en: '{kind, select, a {![A](asset:one)} other {![B](asset:two)}}',
        }),
      ).toEqual([
        ['one', 'stages.0.content.en'],
        ['two', 'stages.0.content.en'],
      ]);
    });

    it('does not collect an image that does not name a file of the protocol', () => {
      expect(found({ en: '![A](https://example.com/a.png)' })).toEqual([]);
    });

    it('does not collect a block that names no asset', () => {
      expect(found({ en: '![A](asset:)' })).toEqual([]);
    });

    it('does not throw on a draft whose translation is not text', () => {
      expect(found({ en: 42, fr: null, de: '![A](asset:one)' })).toEqual([
        ['one', 'stages.0.content.de'],
      ]);
      expect(found('![A](asset:one)')).toEqual([]);
      expect(found(undefined)).toEqual([]);
    });

    it('does not collect an image in text not declared to hold blocks', () => {
      expect(
        collectAssetReferences({
          schemaVersion: 9,
          stages: [
            {
              id: 'finish',
              type: 'FinishSession',
              content: { en: '![A](asset:one)' },
            },
          ],
        }),
      ).toEqual([]);
    });
  });

  it("finds the images a node type's custom shapes draw with", () => {
    const hits = collectAssetReferences({
      schemaVersion: 9,
      codebook: {
        node: {
          person: {
            name: 'Person',
            color: 'node-color-seq-1',
            shape: { default: 'custom:star' },
            customShapes: {
              star: { name: 'Star', asset: 'star-asset' },
              moon: { name: 'Moon', asset: 'moon-asset' },
            },
          },
        },
      },
      stages: [],
    });

    expect(
      Object.fromEntries(hits.map((hit) => [hit.assetId, hit.path.join('.')])),
    ).toEqual({
      'moon-asset': 'codebook.node.person.customShapes.moon.asset',
      'star-asset': 'codebook.node.person.customShapes.star.asset',
    });
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
            content: localized('![Invalid asset item](asset:)'),
          },
        ],
      }),
    ).toEqual([]);
  });
});
