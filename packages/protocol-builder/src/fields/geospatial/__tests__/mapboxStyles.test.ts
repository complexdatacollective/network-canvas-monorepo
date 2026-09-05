import { describe, expect, it } from 'vitest';

import { CurrentProtocolSchema } from '@codaco/protocol-validation';
import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';

import { MAP_STYLE_OPTIONS } from '../mapboxStyles.ts';

type Stage = Record<string, unknown>;

/** The shared protocol, with the geospatial stage drawn on one basemap. */
function protocolWithStyle(style: string): unknown {
  const protocol = structuredClone(allInterfaces) as Record<string, unknown>;
  const stages = protocol.stages;
  if (!Array.isArray(stages)) throw new Error('the fixture has no stages');
  const stage = stages.find(
    (candidate: Stage) => candidate.type === 'Geospatial',
  ) as Stage | undefined;
  if (stage === undefined) {
    throw new Error('the fixture has no geospatial stage');
  }
  const mapOptions = stage.mapOptions;
  if (typeof mapOptions !== 'object' || mapOptions === null) {
    throw new Error('the geospatial stage has no map options');
  }
  Reflect.set(mapOptions, 'style', style);
  return protocol;
}

/**
 * The basemaps this package offers have to be basemaps the protocol schema
 * accepts. A label is this package's to choose; a value is not, and offering
 * one the schema rejects produces a stage that cannot be saved.
 */
describe('the basemaps a geospatial stage may be drawn on', () => {
  it.each(MAP_STYLE_OPTIONS.map((option) => option.value))(
    'is one the protocol schema accepts: %s',
    async (style) => {
      const result = await CurrentProtocolSchema.safeParseAsync(
        protocolWithStyle(style),
      );

      expect(result.success).toBe(true);
    },
  );

  /** The oracle above can fail: a basemap the schema does not know is refused. */
  it('refuses a basemap the schema does not know', async () => {
    const result = await CurrentProtocolSchema.safeParseAsync(
      protocolWithStyle('mapbox://styles/mapbox/invented-v1'),
    );

    expect(result.success).toBe(false);
  });

  it('names each basemap distinctly, so one can be chosen by name', () => {
    const labels = MAP_STYLE_OPTIONS.map((option) => option.label);
    const values = MAP_STYLE_OPTIONS.map((option) => option.value);

    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(values).size).toBe(values.length);
    expect(labels.every((label) => label.trim() !== '')).toBe(true);
  });
});
