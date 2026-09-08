import { describe, expect, it } from 'vitest';

import {
  fixtureAssetContent,
  fixtureAssetManifest,
} from '../protocolFixture.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Every manifest entry that names a file shipped beside the protocol. */
const sourcedAssets = (): { id: string; source: string }[] =>
  Object.entries(fixtureAssetManifest()).flatMap(([id, entry]) =>
    isRecord(entry) && typeof entry.source === 'string'
      ? [{ id, source: entry.source }]
      : [],
  );

const decode = (bytes: Uint8Array): unknown =>
  JSON.parse(new TextDecoder().decode(bytes));

describe('the files the shared protocol ships beside itself', () => {
  /**
   * The rule, asked of the manifest rather than of a list written out here.
   *
   * An asset the protocol names a file for but this map has no bytes for is
   * seeded with `{}`, and every editor that reads that file shows its "this
   * cannot be read" state instead of what the file holds — which is what the
   * map layer did until it was added. Asking the manifest is what makes the
   * next asset added to the protocol fail here rather than silently.
   */
  it('has the bytes of every asset the protocol names a file for', () => {
    const unseeded = sourcedAssets().filter(
      ({ source }) => fixtureAssetContent(source) === undefined,
    );

    expect(unseeded).toEqual([]);
  });

  it('answers with the roster the name-generator stages draw from', () => {
    const bytes = fixtureAssetContent('roster.json');
    if (bytes === undefined) throw new Error('the roster was not seeded');

    expect(decode(bytes)).toMatchObject({
      nodes: expect.any(Array) as unknown[],
    });
  });

  /**
   * Read as far as the property the geospatial stage targets
   * (`mapOptions.targetFeatureProperty`), because that is what an editor asks
   * this file for: a placeholder body parses as JSON perfectly well and has no
   * features at all, so "it is valid JSON" would pass on the very content this
   * test exists to refuse.
   */
  it('answers with the map layer the geospatial stage targets', () => {
    const bytes = fixtureAssetContent('regions.geojson');
    if (bytes === undefined) throw new Error('the map layer was not seeded');
    const layer = decode(bytes);
    if (!isRecord(layer) || !Array.isArray(layer.features)) {
      throw new Error('the map layer is not a FeatureCollection');
    }

    expect(layer.type).toBe('FeatureCollection');
    expect(
      layer.features.map((feature: unknown) =>
        isRecord(feature) && isRecord(feature.properties)
          ? feature.properties.name
          : undefined,
      ),
    ).toEqual(['Downtown', 'Uptown']);
  });

  it('has no bytes for a file the protocol does not ship', () => {
    expect(fixtureAssetContent('nothing-beside-the-protocol.json')).toBe(
      undefined,
    );
  });
});
