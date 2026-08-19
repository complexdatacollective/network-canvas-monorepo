import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { getMockState } from '~/__tests__/helpers';
import type { RootState } from '~/ducks/modules/root';

import {
  getAssetIndex,
  getEdgeIndex,
  getEntityTypeUsageHitsById,
  getNodeIndex,
  getVariableIndex,
  getVariableUsageHits,
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

    // `getIsUsed` reads this index's VALUES to gate deletion. Nothing reads
    // its keys any more — `getVariableUsageHits` carries the structured paths
    // the "Used In" display needs — but one entry per reference SITE is still
    // what makes the values a complete usage set, so the key format is pinned:
    // a key in some other shape is a sign the collector changed under it.
    it('keys every entry in the dotted-array format its collector produces', () => {
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

  describe('getVariableUsageHits()', () => {
    // A codebook record key is constrained only by `/^[a-zA-Z0-9._:-]+$/`
    // (`VariableNameSchema`), so these ids are legal protocol content.
    const dottedIdState = (): RootState =>
      getMockState({
        activeProtocol: {
          present: {
            schemaVersion: 8,
            name: 'test',
            codebook: {
              node: {
                person: {
                  name: 'Person',
                  color: 'node-color-seq-1',
                  shape: { default: 'circle' },
                  variables: {
                    'owner.id': {
                      name: 'owner',
                      type: 'number',
                      validation: { sameAs: 'target.id' },
                    },
                    'target.id': { name: 'target', type: 'number' },
                  },
                },
              },
            },
            stages: [],
          },
        },
      }) as unknown as RootState;

    it('returns the collector hits for one variable, path and subject intact', () => {
      const hits = getVariableUsageHits(dottedIdState(), 'target.id');

      expect(hits).toHaveLength(1);
      expect(hits[0]?.path).toEqual([
        'codebook',
        'node',
        'person',
        'variables',
        'owner.id',
        'validation',
        'sameAs',
      ]);
      expect(hits[0]?.subject).toEqual({ entity: 'node', type: 'person' });
    });

    // The reason this selector exists. `getVariableIndex` joins that same path
    // into `codebook.node.person.variables.owner.id.validation.sameAs`, in
    // which the boundary after `owner.id` is gone: splitting on '.' recovers
    // `owner`, which names no variable.
    it('preserves a segment boundary the joined index destroys', () => {
      const state = dottedIdState();
      const joinedKey = Object.keys(getVariableIndex(state))[0];

      expect(joinedKey).toBe(
        'codebook.node.person.variables.owner.id.validation.sameAs',
      );
      expect(joinedKey?.split('.')).not.toEqual(
        getVariableUsageHits(state, 'target.id')[0]?.path,
      );
    });

    // Referential stability, not a claim about which memoisation strategy is
    // used: the Codebook asks this once per variable per render, so an
    // unmemoised `hits.filter(...)` would hand every consumer a new array each
    // time and defeat any `useSelector`/`useMemo` equality guard downstream.
    // Interleaved ids because that is the real access pattern — one row after
    // another, hit and miss mixed.
    it('hands back a stable array per variable, interleaved ids included', () => {
      const state = dottedIdState();

      const target = getVariableUsageHits(state, 'target.id');
      const owner = getVariableUsageHits(state, 'owner.id');

      expect(getVariableUsageHits(state, 'target.id')).toBe(target);
      expect(owner).toEqual([]);
      expect(getVariableUsageHits(state, 'owner.id')).toBe(owner);
    });

    it('answers nothing for a variable id that collides with an object prototype key', () => {
      expect(getVariableUsageHits(dottedIdState(), 'constructor')).toEqual([]);
      expect(getVariableUsageHits(dottedIdState(), 'toString')).toEqual([]);
    });
  });

  describe('getEntityTypeUsageHitsById()', () => {
    it('groups the structured type-reference hits by type id', () => {
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

      expect(
        getEntityTypeUsageHitsById(state).get('friendship-type-id'),
      ).toEqual([
        {
          path: ['stages', 0, 'edges', 0, 'subject', 'type'],
          typeId: 'friendship-type-id',
          entity: 'edge',
        },
      ]);
    });
  });

  describe('getAssetIndex()', () => {
    it('extracts asset references into index', () => {
      const subject = getAssetIndex(testState);

      expect(subject).toMatchSnapshot();
    });

    /**
     * Every place a protocol may name an asset, each on the stage type whose
     * SCHEMA declares that field. The index is derived from the schema's own
     * `assetReference` tags now, so this doubles as the coverage check the
     * hand-kept path list it replaced could never have: a site missing its tag
     * reports its asset as unused, and the Resource Library offers an unused
     * resource for deletion.
     */
    it.each([
      [
        'a roster data source',
        {
          id: 's1',
          type: 'NameGeneratorRoster',
          label: 'Roster',
          subject: { entity: 'node', type: 'person' },
          dataSource: 'asset-under-test',
        },
      ],
      [
        'a name generator panel data source',
        {
          id: 's1',
          type: 'NameGenerator',
          label: 'Generator',
          subject: { entity: 'node', type: 'person' },
          panels: [
            { id: 'p1', title: 'Roster', dataSource: 'asset-under-test' },
          ],
        },
      ],
      [
        'a sociogram background image',
        {
          id: 's1',
          type: 'Sociogram',
          label: 'Sociogram',
          subject: { entity: 'node', type: 'person' },
          background: { image: 'asset-under-test' },
        },
      ],
      [
        "the Geospatial map's token",
        {
          id: 's1',
          type: 'Geospatial',
          label: 'Map',
          subject: { entity: 'node', type: 'person' },
          mapOptions: { tokenAssetId: 'asset-under-test' },
        },
      ],
      [
        "the Geospatial map's data source",
        {
          id: 's1',
          type: 'Geospatial',
          label: 'Map',
          subject: { entity: 'node', type: 'person' },
          mapOptions: { dataSourceAssetId: 'asset-under-test' },
        },
      ],
      [
        'an Information asset item',
        {
          id: 's1',
          type: 'Information',
          label: 'Info',
          title: 'Welcome',
          items: [{ id: 'i1', type: 'asset', content: 'asset-under-test' }],
        },
      ],
    ])('counts %s as used', (_label: string, stage: object) => {
      const state = getMockState({
        activeProtocol: {
          present: {
            schemaVersion: 8,
            name: 'test',
            codebook: { node: {} },
            stages: [stage],
          },
        },
      }) as unknown as RootState;

      expect(Object.values(getAssetIndex(state))).toContain('asset-under-test');
    });

    /**
     * `'existing'` sits in a panel's `dataSource` without being an asset id —
     * it names the interview network. Indexing it would put a resource that
     * cannot exist in the "in use" set.
     */
    it("does not index a panel's 'existing' data source as an asset", () => {
      const state = getMockState({
        activeProtocol: {
          present: {
            schemaVersion: 8,
            name: 'test',
            codebook: { node: {} },
            stages: [
              {
                id: 's1',
                type: 'NameGenerator',
                label: 'Generator',
                subject: { entity: 'node', type: 'person' },
                panels: [
                  { id: 'p1', title: 'Already added', dataSource: 'existing' },
                ],
              },
            ],
          },
        },
      }) as unknown as RootState;

      expect(Object.values(getAssetIndex(state))).not.toContain('existing');
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

    // #1393's acceptance criterion "Resource usage remains correct through
    // Save/Cancel/Undo" needed no code change: an item that becomes text stops
    // referencing its asset, so the asset is honestly reported as unused
    // rather than deleted or still counted. Pinned here so the filed
    // description cannot silently become true — an `assetReference` tag moved
    // onto the shared item base (where it would cover the text branch too)
    // would leave a researcher believing an orphaned resource is still in use.
    it.each([
      ['an Information', 'items'],
      ['a FamilyPedigree intro-screen', 'introScreen'],
    ])(
      'stops counting the asset once %s item becomes text',
      (_label: string, location: string) => {
        const assetId = 'converted-asset-id';
        const items = [{ id: 'i1', type: 'text', content: assetId }];
        const stage =
          location === 'items'
            ? {
                id: 's1',
                type: 'Information',
                label: 'Info',
                title: 'Welcome',
                items,
              }
            : {
                id: 's1',
                type: 'FamilyPedigree',
                label: 'Pedigree',
                introScreen: { items },
              };
        const state = getMockState({
          activeProtocol: {
            present: {
              schemaVersion: 8,
              name: 'test',
              codebook: { node: {} },
              stages: [stage],
            },
          },
        }) as unknown as RootState;

        expect(Object.values(getAssetIndex(state))).not.toContain(assetId);
      },
    );
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
