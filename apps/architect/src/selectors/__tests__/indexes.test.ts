import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { getMockState } from '~/__tests__/helpers';
import type { RootState } from '~/ducks/modules/root';

import {
  getAssetIndex,
  getEdgeIndex,
  getNodeIndex,
  getVariableIndex,
  utils,
} from '../indexes';

const testState = getMockState() as unknown as RootState;

// Every validation rule that references another variable by id. A variable
// targeted only by one of these must still count as "in use".
const CROSS_VARIABLE_VALIDATIONS = [
  'sameAs',
  'differentFrom',
  'greaterThanVariable',
  'lessThanVariable',
  'greaterThanOrEqualToVariable',
  'lessThanOrEqualToVariable',
] as const;

type ShippedProtocol = {
  codebook: {
    node?: Record<string, { variables?: Record<string, unknown> }>;
    edge?: Record<string, { variables?: Record<string, unknown> }>;
    ego?: { variables?: Record<string, unknown> };
  };
  stages: unknown[];
};

const loadShippedProtocol = (relativePath: string): ShippedProtocol => {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  return JSON.parse(
    readFileSync(
      join(thisDir, '../../../../../packages/protocols', relativePath),
      'utf-8',
    ),
  ) as ShippedProtocol;
};

const loadDevelopmentProtocol = (): ShippedProtocol =>
  loadShippedProtocol('development/protocol.json');

const stateFor = (protocol: ShippedProtocol): RootState =>
  getMockState({
    activeProtocol: { present: protocol },
  }) as unknown as RootState;

const loadDevelopmentProtocolState = (): RootState =>
  stateFor(loadDevelopmentProtocol());

/**
 * Paths whose value is an external data source's OWN property name, which the
 * enumeration below cannot tell apart from a codebook reference when the two
 * happen to share a spelling. Each entry is a deliberate non-reference, not a
 * gap:
 *
 * - `mapOptions.targetFeatureProperty` names a property of the Geospatial
 *   stage's GeoJSON features (a region's name), not an attribute of any
 *   network entity. The value the participant's selection writes is the
 *   prompt's own `variable`, which IS a tagged reference. The all-interfaces
 *   fixture only trips this because its `person` type has a variable whose id
 *   is literally `name`.
 *
 * Roster columns are NOT on this list: they legitimately key a
 * Network Canvas-format roster by codebook variable id, so they are tagged
 * (existence-unchecked) and must appear in the index.
 */
const NON_REFERENCE_PATH_SUFFIXES = ['mapOptions.targetFeatureProperty'];

/**
 * Every dotted path under `stages` whose value is a string equal to some
 * codebook variable id — derived from the protocol JSON alone, with no
 * knowledge of which fields the schema tags. This is deliberately independent
 * of the thing it is used to test.
 */
const enumerateVariableIdOccurrences = (
  protocol: ShippedProtocol,
): string[] => {
  const ids = new Set<string>();
  for (const entity of ['node', 'edge'] as const) {
    for (const definition of Object.values(protocol.codebook[entity] ?? {})) {
      for (const id of Object.keys(definition.variables ?? {})) ids.add(id);
    }
  }
  for (const id of Object.keys(protocol.codebook.ego?.variables ?? {}))
    ids.add(id);

  const found: string[] = [];
  const walk = (value: unknown, path: (string | number)[]) => {
    if (typeof value === 'string') {
      if (ids.has(value)) found.push(path.join('.'));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, itemIndex) => walk(item, [...path, itemIndex]));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        walk(child, [...path, key]);
      }
    }
  };
  walk(protocol.stages, ['stages']);
  return found.filter(
    (path) =>
      !NON_REFERENCE_PATH_SUFFIXES.some((suffix) => path.endsWith(suffix)),
  );
};

const buildStateWithValidationRef = (
  entity: 'ego' | 'node' | 'edge',
  validationKey: string,
) => {
  const referencedVariableId = 'referenced-variable-id';
  const variables = {
    'owner-variable-id': {
      name: 'owner',
      type: 'number',
      validation: { [validationKey]: referencedVariableId },
    },
    [referencedVariableId]: { name: 'referenced', type: 'number' },
  };

  const codebook =
    entity === 'ego'
      ? { ego: { variables } }
      : { [entity]: { 'entity-type-id': { variables } } };

  const protocol = { schemaVersion: 8, name: 'test', codebook, stages: [] };

  return {
    state: getMockState({
      activeProtocol: { present: protocol },
    }) as unknown as RootState,
    referencedVariableId,
  };
};

describe('indexes selectors', () => {
  describe('utils.buildSearch()', () => {
    it('correctly builds the Set', () => {
      const index1: Record<string, string> = {
        foo: '1',
        bar: '2',
        bazz: '3',
        fizz: '4',
      };

      const index2: Record<string, string> = {
        foo: '3',
        bar: '4',
        bazz: '5',
        fizz: '6',
      };

      const excludeList = ['3'];

      const search = utils.buildSearch([index1, index2], [excludeList]);

      expect(search).toEqual(new Set(['1', '2', '4', '5', '6']));
    });
  });

  describe('getVariableIndex()', () => {
    it('extracts variables into index', () => {
      const subject = getVariableIndex(testState);

      expect(subject).toMatchSnapshot();
    });

    describe.each(['ego', 'node', 'edge'] as const)(
      'tracks cross-variable validation references on %s variables',
      (entity) => {
        it.each(CROSS_VARIABLE_VALIDATIONS)(
          'counts a variable referenced via validation.%s as used',
          (validationKey) => {
            const { state, referencedVariableId } = buildStateWithValidationRef(
              entity,
              validationKey,
            );

            const index = getVariableIndex(state);

            expect(Object.values(index)).toContain(referencedVariableId);
          },
        );
      },
    );

    it('counts a variable used only as a prompt sort key as used', () => {
      const sortVariableId = 'sort-only-variable-id';
      const protocol = {
        schemaVersion: 8,
        name: 'test',
        codebook: {
          node: {
            'person-type-id': {
              name: 'Person',
              variables: { [sortVariableId]: { name: 'age', type: 'number' } },
            },
          },
        },
        stages: [
          {
            id: 's1',
            type: 'OrdinalBin',
            label: 'Bin',
            subject: { entity: 'node', type: 'person-type-id' },
            prompts: [
              {
                id: 'p1',
                variable: sortVariableId,
                binSortOrder: [{ property: sortVariableId, direction: 'asc' }],
              },
            ],
          },
        ],
      };
      const state = getMockState({
        activeProtocol: { present: protocol },
      }) as unknown as RootState;

      expect(Object.values(getVariableIndex(state))).toContain(sortVariableId);
    });

    it('includes stage prompt variable references from a real v8 protocol', () => {
      const thisDir = dirname(fileURLToPath(import.meta.url));
      const protocolPath = join(
        thisDir,
        '../../../../../packages/protocols/development/protocol.json',
      );
      const protocol = JSON.parse(
        readFileSync(protocolPath, 'utf-8'),
      ) as unknown;

      const state = getMockState({
        activeProtocol: { present: protocol },
      }) as unknown as RootState;

      const index = getVariableIndex(state);

      // stages.10.prompts.0.variable in protocols/development/protocol.json
      expect(Object.values(index)).toContain(
        '1096204b-48fe-444c-b642-4ab211f7f57c',
      );
    });

    // `getIsUsed` reads this index's VALUES to gate deletion, and
    // `getUsageAsStageMeta` parses its KEYS to say where the variable is used.
    // A key in any other shape is therefore counted as usage and displayed as
    // nothing — the "in use, cannot be deleted" row with a blank "Used In" cell
    // that #1392 was filed for. Before the fix the sort-key entries arrived
    // from `collectPaths` in a BRACKETED format (`stages[0].prompts[0]…`) that
    // the display parser dropped on the floor.
    it('keys every entry in the dotted-array format its consumers parse', () => {
      const index = getVariableIndex(loadDevelopmentProtocolState());

      const malformed = Object.keys(index).filter(
        (key) => key.includes('[') || key.includes(']'),
      );
      expect(malformed).toEqual([]);
      expect(Object.keys(index).length).toBeGreaterThan(0);
      for (const key of Object.keys(index)) {
        expect(['stages', 'codebook']).toContain(key.split('.')[0]);
      }
    });

    // The independent enumeration. Everything else in this file asks the index
    // about references the index itself chose to collect, which cannot catch a
    // reference site nobody tagged. This walks the raw protocol JSON instead
    // and asserts the index covers every place a codebook variable id actually
    // appears inside a stage — the check that fails when a new stage type, or
    // an existing one's data-source options, hold a variable id at an untagged
    // path. `NameGeneratorRoster`'s three column fields were exactly that.
    it.each([
      // Every interface type Architect ships an editor for, between them.
      ['development', 'development/protocol.json', 50],
      ['all-interfaces e2e fixture', 'e2e/all-interfaces/protocol.json', 20],
      ['sample', 'sample/protocol.json', 20],
    ])(
      'covers every codebook variable id appearing under stages of the %s protocol',
      (_label, relativePath, minimumOccurrences) => {
        const protocol = loadShippedProtocol(relativePath);
        const index = getVariableIndex(stateFor(protocol));

        const occurrences = enumerateVariableIdOccurrences(protocol);
        // A protocol whose stages named no variables would make this vacuous.
        expect(occurrences.length).toBeGreaterThan(minimumOccurrences);

        const uncovered = occurrences.filter((path) => !(path in index));
        expect(uncovered).toEqual([]);
      },
    );

    it('counts a variable referenced only by a roster search column as used', () => {
      const index = getVariableIndex(loadDevelopmentProtocolState());

      // venue.Abbreviated_Name — its ONLY appearance in the development
      // protocol is stages.18.searchOptions.matchProperties.0. Untagged, it
      // read "not in use" on the Codebook page and offered its own delete
      // button, while the roster still displayed it.
      expect(Object.values(index)).toContain(
        '1e9ce62c-44c5-484d-9c26-0d20cc7d7238',
      );
    });

    it('counts a variable referenced only by prompt sort keys as used', () => {
      const index = getVariableIndex(loadDevelopmentProtocolState());

      // person.last_name — referenced only by `bucketSortOrder`/`binSortOrder`
      // properties, which is why its "Used In" cell was empty while its delete
      // button was disabled as in-use.
      expect(Object.values(index)).toContain(
        '0ff25001-a2b8-46de-82a9-53143aa00d10',
      );
    });

    it('does not index the nomination-order sort key as a variable', () => {
      const index = getVariableIndex(loadDevelopmentProtocolState());

      expect(Object.values(index)).not.toContain('*');
    });
  });

  describe('getAssetIndex()', () => {
    it('extracts asset references into index', () => {
      const subject = getAssetIndex(testState);

      expect(subject).toMatchSnapshot();
    });

    it('counts a FamilyPedigree intro-screen asset item as used', () => {
      const assetId = 'intro-asset-id';
      const protocol = {
        schemaVersion: 8,
        name: 'test',
        codebook: { node: {} },
        stages: [
          {
            id: 's1',
            type: 'FamilyPedigree',
            label: 'Pedigree',
            introScreen: {
              items: [{ id: 'i1', type: 'asset', content: assetId }],
            },
          },
        ],
      };
      const state = getMockState({
        activeProtocol: { present: protocol },
      }) as unknown as RootState;

      expect(Object.values(getAssetIndex(state))).toContain(assetId);
    });
  });

  describe('getNodeIndex()', () => {
    it('extracts subject references into type index', () => {
      const subject = getNodeIndex(testState);

      expect(subject).toMatchSnapshot();
    });
  });

  describe('getEdgeIndex()', () => {
    it('extracts subject references into type index', () => {
      const subject = getEdgeIndex(testState);

      expect(subject).toMatchSnapshot();
    });

    it('detects edge types used by a NetworkComposer stage (edges[].subject)', () => {
      const protocol = {
        schemaVersion: 8,
        name: 'test',
        codebook: { edge: { 'friendship-type-id': { name: 'Friendship' } } },
        stages: [
          {
            id: 's1',
            type: 'NetworkComposer',
            label: 'Composer',
            subject: { entity: 'node', type: 'person-type-id' },
            edges: [
              {
                id: 'composer-edge-1',
                subject: { entity: 'edge', type: 'friendship-type-id' },
              },
            ],
          },
        ],
      };
      const state = getMockState({
        activeProtocol: { present: protocol },
      }) as unknown as RootState;

      expect(Object.values(getEdgeIndex(state))).toContain(
        'friendship-type-id',
      );
    });
  });
});
