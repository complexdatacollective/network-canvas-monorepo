import { describe, expect, it } from 'vitest';

import {
  type CurrentProtocol,
  CurrentProtocolSchema,
  GEOSPATIAL_OUTSIDE_AREAS_PROBABILITY,
  type Stage,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type VariableValue,
} from '@codaco/shared-consts';

import { simulateGeospatial } from '../Geospatial';
import { harnessFor, type Harness } from './harness';

/**
 * C4 for Geospatial: the interface stores a STRING per alter per prompt — a
 * value the map's `targetFeatureProperty` carries, or the outside-areas word —
 * and nothing else. The old engine wrote `{x, y}` here, which is the
 * divergence these tests exist to keep closed.
 */

const OUTSIDE = 'outside-selectable-areas';
const AREAS = ['Downtown', 'Uptown', 'Riverside'];

const codebook = {
  node: {
    venue: {
      name: 'Venue',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        name: { name: 'name', type: 'text', component: 'Text' },
        age: { name: 'age', type: 'number' },
        location: { name: 'location', type: 'location' },
        second_location: { name: 'second_location', type: 'location' },
      },
    },
  },
};

/** The stage that named the venues this one places. */
const priorStage = {
  id: 'earlier',
  type: 'NameGeneratorQuickAdd',
  label: 'Earlier',
  subject: { entity: 'node', type: 'venue' },
  quickAdd: 'name',
  prompts: [{ id: 'earlier-prompt', text: 'Where do you go?' }],
};

const DEFAULT_PROMPTS = [
  { id: 'p1', text: 'Where is it?', variable: 'location' },
];

const mapOptions = {
  tokenAssetId: 'mapbox-token',
  style: 'mapbox://styles/mapbox/standard',
  center: [-74, 40.7],
  initialZoom: 10,
  dataSourceAssetId: 'regions',
  color: 'ord-color-seq-6',
  targetFeatureProperty: 'name',
};

/**
 * A map stage only parses beside the manifest entries it names, so this
 * fixture parses the whole protocol rather than reaching for the shared
 * harness's codebook-and-stages helper.
 */
const parseGeoProtocol = (stages: unknown[]): CurrentProtocol =>
  CurrentProtocolSchema.parse({
    name: 'Geospatial simulator test protocol',
    description: 'Drives the Geospatial simulator the way the walk does.',
    schemaVersion: 8,
    codebook,
    stages,
    assetManifest: {
      'mapbox-token': {
        id: 'mapbox-token',
        name: 'Mapbox token',
        type: 'apikey',
        value: 'pk.test',
      },
      'regions': {
        id: 'regions',
        name: 'Regions',
        type: 'geojson',
        source: 'regions.geojson',
      },
    },
  });

const stageWith = ({
  prompts = DEFAULT_PROMPTS,
  filter,
}: { prompts?: Record<string, unknown>[]; filter?: unknown } = {}) => ({
  id: 'geospatial',
  type: 'Geospatial',
  label: 'Places',
  subject: { entity: 'node', type: 'venue' },
  mapOptions,
  prompts,
  ...(filter ? { filter } : {}),
});

const setUp = ({
  stage = stageWith(),
  alters = 0,
  areas = AREAS,
  attributes,
  seed,
  corrupt,
}: {
  stage?: Record<string, unknown>;
  alters?: number;
  /** `'unresolved'` is the host resolving nothing for this stage (D18). */
  areas?: (string | number)[] | 'unresolved';
  attributes?: (index: number) => Record<string, VariableValue>;
  seed?: number;
  corrupt?: Record<string, unknown>;
} = {}): Harness => {
  const protocol = parseGeoProtocol([priorStage, stage]);
  if (corrupt) Object.assign(protocol.stages[1] ?? {}, corrupt);
  const harness = harnessFor(protocol, {
    ...(seed === undefined ? {} : { seed }),
    assetData:
      areas === 'unresolved'
        ? {}
        : { geojsonPropertyValues: { geospatial: areas } },
  });
  harness.seedAlters(alters, {
    nodeType: 'venue',
    ...(attributes ? { attributes } : {}),
  });
  return harness;
};

const runStage = (harness: Harness, promptBound?: number): void => {
  const stage = harness.context.protocol.stages[1];
  if (!stage) throw new Error('fixture is missing the stage under test');
  simulateGeospatial(
    stage as Extract<Stage, { type: 'Geospatial' }>,
    harness.context,
    promptBound,
  );
};

const placements = (harness: Harness, variable = 'location'): unknown[] =>
  harness.nodes().map((node) => node[entityAttributesProperty][variable]);

describe('simulateGeospatial', () => {
  it('places every alter the stage shows', () => {
    const harness = setUp({ alters: 12 });
    runStage(harness);

    for (const value of placements(harness)) {
      expect([...AREAS, OUTSIDE]).toContain(value);
    }
  });

  it('only ever writes a string', () => {
    // The old engine wrote a `{x, y}` position here, which is a value the map
    // interface cannot produce and no exporter reads as a place.
    const harness = setUp({ alters: 60 });
    runStage(harness);

    for (const value of placements(harness)) {
      expect(typeof value).toBe('string');
    }
  });

  it('creates nobody', () => {
    const harness = setUp({ alters: 5 });
    runStage(harness);

    expect(harness.nodes()).toHaveLength(5);
  });

  it('produces nothing on an empty network', () => {
    const harness = setUp();
    runStage(harness);

    expect(harness.nodes()).toHaveLength(0);
  });

  it('writes no stage metadata', () => {
    // The interface dispatches `updateNode` and nothing else: the map's
    // geometry is the researcher's data, not the participant's.
    const harness = setUp({ alters: 6 });
    runStage(harness);

    expect(harness.engine.draft.stageMetadata).toEqual({});
  });

  it('leaves alters of another node type alone', () => {
    const harness = setUp({ alters: 3 });
    harness.engine.addNode({
      nodeType: 'place',
      uid: 'place-1',
      attributeData: { name: 'Somewhere' },
      allowUnknownAttributes: true,
      currentStep: 0,
    });
    runStage(harness);

    const place = harness
      .nodes()
      .find((node) => node[entityPrimaryKeyProperty] === 'place-1');

    expect(place?.[entityAttributesProperty].location).toBeUndefined();
  });

  it('writes one placement per prompt', () => {
    const harness = setUp({
      alters: 6,
      stage: stageWith({
        prompts: [
          ...DEFAULT_PROMPTS,
          { id: 'p2', text: 'And where else?', variable: 'second_location' },
        ],
      }),
    });
    runStage(harness);

    for (const node of harness.nodes()) {
      expect([...AREAS, OUTSIDE]).toContain(
        node[entityAttributesProperty].location,
      );
      expect([...AREAS, OUTSIDE]).toContain(
        node[entityAttributesProperty].second_location,
      );
    }
  });

  it('applies only the prompts below a stop-at bound', () => {
    const harness = setUp({
      alters: 6,
      stage: stageWith({
        prompts: [
          ...DEFAULT_PROMPTS,
          { id: 'p2', text: 'And where else?', variable: 'second_location' },
        ],
      }),
    });
    runStage(harness, 1);

    for (const node of harness.nodes()) {
      expect([...AREAS, OUTSIDE]).toContain(
        node[entityAttributesProperty].location,
      );
      expect(node[entityAttributesProperty].second_location).toBeUndefined();
    }
  });

  describe('the stage filter', () => {
    const filter = {
      join: 'AND',
      rules: [
        {
          id: 'rule-1',
          type: 'node',
          options: {
            type: 'venue',
            attribute: 'age',
            operator: 'GREATER_THAN',
            value: 30,
          },
        },
      ],
    };

    it('places only the alters that pass it', () => {
      const harness = setUp({
        stage: stageWith({ filter }),
        alters: 6,
        attributes: (index) => ({ name: `Venue ${index}`, age: index * 20 }),
      });
      runStage(harness);

      for (const node of harness.nodes()) {
        const age = Number(node[entityAttributesProperty].age);
        const placed = node[entityAttributesProperty].location;
        if (age > 30) {
          expect([...AREAS, OUTSIDE]).toContain(placed);
        } else {
          expect(placed).toBeUndefined();
        }
      }
    });
  });

  describe('the map’s own areas', () => {
    it('draws from the values the host resolved and no others', () => {
      const harness = setUp({ alters: 200, areas: ['Only Place'] });
      runStage(harness);

      expect(new Set(placements(harness))).toEqual(
        new Set(['Only Place', OUTSIDE]),
      );
    });

    it('answers outside every area when the host resolved nothing', () => {
      // D18: an absent key is a source the host could not resolve, and the
      // outside word is the only answer producible without a map.
      const harness = setUp({ alters: 40, areas: 'unresolved' });
      runStage(harness);

      expect(new Set(placements(harness))).toEqual(new Set([OUTSIDE]));
    });

    it('answers outside every area when the map has none', () => {
      const harness = setUp({ alters: 40, areas: [] });
      runStage(harness);

      expect(new Set(placements(harness))).toEqual(new Set([OUTSIDE]));
    });

    it('reaches outside the areas at the schema’s declared share', () => {
      const harness = setUp({ alters: 4000 });
      runStage(harness);

      const values = placements(harness);
      const outside = values.filter((value) => value === OUTSIDE).length;

      expect(
        Math.abs(
          outside / values.length - GEOSPATIAL_OUTSIDE_AREAS_PROBABILITY,
        ),
      ).toBeLessThan(0.02);
    });

    it('spreads placements across the areas on offer', () => {
      // A stage that answered with one area every time would satisfy every
      // membership assertion above while reporting a map nobody moved on.
      const harness = setUp({ alters: 300 });
      runStage(harness);

      const inside = placements(harness).filter((value) => value !== OUTSIDE);
      expect(new Set(inside)).toEqual(new Set(AREAS));
    });
  });

  describe('determinism', () => {
    it('places the same alters the same way on the same seed', () => {
      const first = setUp({ alters: 30, seed: 99 });
      runStage(first);
      const second = setUp({ alters: 30, seed: 99 });
      runStage(second);

      expect(placements(first)).toEqual(placements(second));
    });

    it('places them differently on a different seed', () => {
      const first = setUp({ alters: 30, seed: 99 });
      runStage(first);
      const second = setUp({ alters: 30, seed: 100 });
      runStage(second);

      expect(placements(first)).not.toEqual(placements(second));
    });
  });

  describe('protocols the codebook contradicts', () => {
    it('refuses a subject the codebook does not define', () => {
      const harness = setUp({
        alters: 2,
        corrupt: { subject: { entity: 'node', type: 'ghost' } },
      });

      expect(() => runStage(harness)).toThrow(/node type "ghost"/);
    });

    it('refuses a prompt variable the node type does not carry', () => {
      const harness = setUp({
        alters: 2,
        corrupt: {
          prompts: [{ id: 'p1', text: 'Where?', variable: 'nowhere' }],
        },
      });

      expect(() => runStage(harness)).toThrow(/nowhere/);
    });
  });
});

describe('numeric selectable areas', () => {
  it('stores a numeric feature value exactly as the tap forwards it', () => {
    // The live click handler forwards the tapped feature's
    // `targetFeatureProperty` value unchanged — its `as string` is
    // compile-time only — so a map keyed by numeric identifiers stores those
    // numbers, and the pool carries them verbatim.
    const harness = setUp({
      alters: 12,
      areas: [101, 205],
    });
    runStage(harness);

    const values = harness
      .nodes()
      .map((node) => node[entityAttributesProperty].location)
      .filter((value) => value !== 'outside-selectable-areas');
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      expect([101, 205]).toContain(value);
    }
  });
});
