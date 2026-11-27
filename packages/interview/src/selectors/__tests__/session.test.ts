import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  type CurrentProtocol,
  type NodeDefinition,
} from '@codaco/protocol-validation';
import {
  type DyadCensusMetadataItem,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { testId, testTypeId, testVariableId } from '../../__tests__/testIds';
import { createInitialNetwork } from '../../contract/network';
import type { ProtocolPayload } from '../../contract/types';
import protocolReducer from '../../store/modules/protocol';
import sessionReducer, {
  updateStageMetadata,
} from '../../store/modules/session';
import uiReducer from '../../store/modules/ui';
import {
  getNetworkNodesForPrompt,
  getNetworkNodesForType,
  getStageMetadata,
  getStageSubject,
  resolveNodeShape,
} from '../session';

const PERSON = testTypeId('person');
const NAME = testVariableId('name');
const ETHNICITY = testVariableId('ethnicity');
const ROLE = testVariableId('role');
const AGE = testVariableId('age');
const IS_PERSON = testVariableId('is_person');
const KIND = testVariableId('kind');

const rootReducer = combineReducers({
  session: sessionReducer,
  protocol: protocolReducer,
  ui: uiReducer,
});

function createStore() {
  const sessionState = {
    id: 'test-session',
    startTime: new Date().toISOString(),
    finishTime: null,
    exportTime: null,
    lastUpdated: new Date().toISOString(),
    network: createInitialNetwork(),
    promptIndex: 0,
  };

  return configureStore({
    reducer: rootReducer,
    preloadedState: { session: sessionState },
  });
}

describe('getStageMetadata', () => {
  it('reads back metadata written at stage index 0', () => {
    // A DyadCensus/TieStrengthCensus may be the first stage (index 0). The
    // reducer writes stageMetadata at the current step regardless of index, so
    // the selector must be able to read index 0 back (it previously treated 0
    // as falsy and returned undefined).
    const metadata: DyadCensusMetadataItem[] = [[0, 'a', 'b', false]];
    const store = createStore();

    store.dispatch(updateStageMetadata({ currentStep: 0, metadata }));

    expect(getStageMetadata(store.getState(), 0)).toEqual(metadata);
  });

  it('returns metadata for a non-zero stage index', () => {
    const metadata: DyadCensusMetadataItem[] = [[1, 'a', 'b', false]];
    const store = createStore();

    store.dispatch(updateStageMetadata({ currentStep: 2, metadata }));

    expect(getStageMetadata(store.getState(), 2)).toEqual(metadata);
  });

  it('returns undefined when no metadata exists for the stage', () => {
    const store = createStore();

    expect(getStageMetadata(store.getState(), 0)).toBeUndefined();
  });
});

describe('getNetworkNodesForPrompt', () => {
  it('keeps the nodes named on one stage off the prompt of another stage', () => {
    const nameGenerator = (stage: string) => ({
      id: testId(stage),
      type: 'NameGeneratorQuickAdd' as const,
      label: { en: stage },
      subject: { entity: 'node' as const, types: [PERSON] },
      quickAdd: asEntityAttributeReference(NAME),
      prompts: [{ id: testId(`${stage}-prompt`), text: { en: stage } }],
    });
    const protocolState: ProtocolPayload = {
      id: 'protocol',
      hash: 'hash',
      importedAt: '2026-08-12T00:00:00.000Z',
      assets: [],
      name: 'Test protocol',
      schemaVersion: 9,
      localization: { defaultLocale: 'en', locales: ['en'] },
      codebook: {
        node: {
          [PERSON]: {
            name: 'Person',
            color: 'node-color-seq-1',
            shape: { default: 'circle' },
            variables: { [NAME]: { name: 'Name', type: 'text' } },
          },
        },
        edge: {},
        ego: { variables: {} },
      },
      stages: [
        nameGenerator('friends'),
        nameGenerator('family'),
      ] satisfies CurrentProtocol['stages'],
    };
    const person = (id: string, stage: string): NcNode => ({
      [entityPrimaryKeyProperty]: id,
      type: PERSON,
      [entityAttributesProperty]: {},
      promptIDs: [testId(`${stage}-prompt`)],
    });
    const store = configureStore({
      reducer: rootReducer,
      preloadedState: {
        session: {
          id: 'session',
          startTime: '2026-08-12T00:00:00.000Z',
          finishTime: null,
          exportTime: null,
          lastUpdated: '2026-08-12T00:00:00.000Z',
          promptIndex: 0,
          network: {
            ...createInitialNetwork(),
            nodes: [person('alex', 'friends'), person('sam', 'family')],
          },
        },
        protocol: protocolState,
      },
    });
    const namedOn = (step: number) =>
      getNetworkNodesForPrompt(store.getState(), step).map(
        (node) => node[entityPrimaryKeyProperty],
      );

    expect(namedOn(0)).toEqual(['alex']);
    expect(namedOn(1)).toEqual(['sam']);
  });
});

describe('getNetworkNodesForType', () => {
  const PET = testTypeId('pet');
  const PLACE = testTypeId('place');
  const storeWithStageTypes = (types: string[]) => {
    const protocolState: ProtocolPayload = {
      id: 'protocol',
      hash: 'hash',
      importedAt: '2026-11-26T00:00:00.000Z',
      assets: [],
      name: 'Test protocol',
      schemaVersion: 9,
      localization: { defaultLocale: 'en', locales: ['en'] },
      codebook: {
        node: {
          [PERSON]: {
            name: 'Person',
            color: 'node-color-seq-1',
            shape: { default: 'circle' },
            variables: { [NAME]: { name: 'Name', type: 'text' } },
          },
          [PET]: {
            name: 'Pet',
            color: 'node-color-seq-2',
            shape: { default: 'square' },
            variables: {},
          },
          [PLACE]: {
            name: 'Place',
            color: 'node-color-seq-3',
            shape: { default: 'square' },
            variables: {},
          },
        },
        edge: {},
        ego: { variables: {} },
      },
      stages: [
        {
          id: testId('people'),
          type: 'NameGeneratorQuickAdd',
          label: { en: 'People' },
          subject: { entity: 'node', types },
          quickAdd: asEntityAttributeReference(NAME),
          prompts: [{ id: testId('people-prompt'), text: { en: 'People' } }],
        },
      ] satisfies CurrentProtocol['stages'],
    };
    const nodeOf = (id: string, type: string): NcNode => ({
      [entityPrimaryKeyProperty]: id,
      type,
      [entityAttributesProperty]: {},
    });
    return configureStore({
      reducer: rootReducer,
      preloadedState: {
        session: {
          id: 'session',
          startTime: '2026-11-26T00:00:00.000Z',
          finishTime: null,
          exportTime: null,
          lastUpdated: '2026-11-26T00:00:00.000Z',
          promptIndex: 0,
          network: {
            ...createInitialNetwork(),
            nodes: [
              nodeOf('alex', PERSON),
              nodeOf('rex', PET),
              nodeOf('sam', PERSON),
              nodeOf('paris', PLACE),
            ],
          },
        },
        protocol: protocolState,
      },
    });
  };
  const typesOnStage = (types: string[]) =>
    getNetworkNodesForType(storeWithStageTypes(types).getState(), 0).map(
      (node) => node[entityPrimaryKeyProperty],
    );

  it("returns nodes of the stage's types only", () => {
    expect(typesOnStage([PERSON])).toEqual(['alex', 'sam']);
  });

  it('returns nodes of every type a stage lists', () => {
    expect(typesOnStage([PERSON, PET])).toEqual(['alex', 'rex', 'sam']);
  });

  it('resolves the subject of a stage that lists one node type', () => {
    expect(
      getStageSubject(storeWithStageTypes([PERSON]).getState(), 0),
    ).toEqual({ entity: 'node', type: PERSON });
  });

  it('resolves no subject for a stage that lists several node types', () => {
    expect(
      getStageSubject(storeWithStageTypes([PERSON, PET]).getState(), 0),
    ).toBeNull();
  });
});

describe('stage filter rules naming a layout', () => {
  it('a stage filter rule naming a layout keeps nodes that hold a position under it', () => {
    const LAYOUT = testId('map-layout');
    const protocolState: ProtocolPayload = {
      id: 'protocol',
      hash: 'hash',
      importedAt: '2026-11-27T00:00:00.000Z',
      assets: [],
      name: 'Test protocol',
      schemaVersion: 9,
      localization: { defaultLocale: 'en', locales: ['en'] },
      codebook: {
        node: {
          [PERSON]: {
            name: 'Person',
            color: 'node-color-seq-1',
            shape: { default: 'circle' },
            variables: { [NAME]: { name: 'Name', type: 'text' } },
          },
        },
        edge: {},
        ego: { variables: {} },
        layouts: { [LAYOUT]: { name: 'map' } },
      },
      stages: [
        {
          id: testId('placed-form'),
          type: 'AlterForm',
          label: { en: 'Placed people' },
          subject: { entity: 'node', types: [PERSON] },
          filter: {
            join: 'AND',
            rules: [
              {
                id: testId('placed-rule'),
                type: 'node',
                options: {
                  type: PERSON,
                  attribute: asEntityAttributeReference(LAYOUT),
                  operator: 'EXISTS',
                },
              },
            ],
          },
          form: {
            fields: [
              {
                id: testId('name-field'),
                variable: asEntityAttributeReference(NAME),
                prompt: { en: 'Name' },
              },
            ],
          },
        },
      ] satisfies CurrentProtocol['stages'],
    };
    const person = (
      id: string,
      attributes: NcNode[typeof entityAttributesProperty],
    ): NcNode => ({
      [entityPrimaryKeyProperty]: id,
      type: PERSON,
      [entityAttributesProperty]: attributes,
    });
    const store = configureStore({
      reducer: rootReducer,
      preloadedState: {
        session: {
          id: 'session',
          startTime: '2026-11-27T00:00:00.000Z',
          finishTime: null,
          exportTime: null,
          lastUpdated: '2026-11-27T00:00:00.000Z',
          promptIndex: 0,
          network: {
            ...createInitialNetwork(),
            nodes: [
              person('placed', { [LAYOUT]: { x: 0.4, y: 0.6 } }),
              person('unplaced', {}),
            ],
          },
        },
        protocol: protocolState,
      },
    });

    expect(
      getNetworkNodesForType(store.getState(), 0).map(
        (node) => node[entityPrimaryKeyProperty],
      ),
    ).toEqual(['placed']);
  });
});

// Stage filters keep their schema 8 behaviour on a stage showing several
// node types and on directed edges (issue #2725).
describe('stage filters on a Sociogram showing two node types', () => {
  const PET = testTypeId('pet');
  const FOLLOWS = testTypeId('follows');
  const LAYOUT = testId('map-layout');
  const storeWithFilter = (
    rule: NonNullable<
      Extract<
        CurrentProtocol['stages'][number],
        { type: 'Sociogram' }
      >['filter']
    >['rules'][number],
  ) => {
    const protocolState: ProtocolPayload = {
      id: 'protocol',
      hash: 'hash',
      importedAt: '2026-11-27T00:00:00.000Z',
      assets: [],
      name: 'Test protocol',
      schemaVersion: 9,
      localization: { defaultLocale: 'en', locales: ['en'] },
      codebook: {
        node: {
          [PERSON]: {
            name: 'Person',
            color: 'node-color-seq-1',
            shape: { default: 'circle' },
            variables: { [NAME]: { name: 'Name', type: 'text' } },
          },
          [PET]: {
            name: 'Pet',
            color: 'node-color-seq-2',
            shape: { default: 'square' },
            variables: {},
          },
        },
        edge: {
          [FOLLOWS]: {
            name: 'Follows',
            color: 'edge-color-seq-1',
            directed: true,
          },
        },
        ego: { variables: {} },
        layouts: { [LAYOUT]: { name: 'map' } },
      },
      stages: [
        {
          id: testId('map'),
          type: 'Sociogram',
          label: { en: 'Map' },
          subject: { entity: 'node', types: [PERSON, PET] },
          layout: LAYOUT,
          background: { concentricCircles: 3 },
          filter: { join: 'AND', rules: [rule] },
          prompts: [
            { id: testId('place'), task: 'layout', text: { en: 'Place' } },
          ],
        },
      ] satisfies CurrentProtocol['stages'],
    };
    const nodeOf = (
      id: string,
      type: string,
      attributes: NcNode[typeof entityAttributesProperty] = {},
    ): NcNode => ({
      [entityPrimaryKeyProperty]: id,
      type,
      [entityAttributesProperty]: attributes,
    });
    return configureStore({
      reducer: rootReducer,
      preloadedState: {
        session: {
          id: 'session',
          startTime: '2026-11-27T00:00:00.000Z',
          finishTime: null,
          exportTime: null,
          lastUpdated: '2026-11-27T00:00:00.000Z',
          promptIndex: 0,
          network: {
            ...createInitialNetwork(),
            nodes: [
              nodeOf('alex', PERSON, { [NAME]: 'Alex' }),
              nodeOf('rex', PET),
              nodeOf('sam', PERSON, { [NAME]: 'Sam' }),
              nodeOf('tom', PET),
            ],
            edges: [
              {
                [entityPrimaryKeyProperty]: 'rex-sam',
                type: FOLLOWS,
                from: 'rex',
                to: 'sam',
                [entityAttributesProperty]: {},
              },
            ],
          },
        },
        protocol: protocolState,
      },
    });
  };
  const shown = (store: ReturnType<typeof storeWithFilter>) =>
    getNetworkNodesForType(store.getState(), 0).map(
      (node) => node[entityPrimaryKeyProperty],
    );

  it('a match-all stage filter on a two-type stage keeps only the type its rules name', () => {
    expect(
      shown(
        storeWithFilter({
          id: testId('named'),
          type: 'node',
          options: {
            type: PERSON,
            attribute: asEntityAttributeReference(NAME),
            operator: 'EXISTS',
          },
        }),
      ),
    ).toEqual(['alex', 'sam']);
  });

  it('an edge rule keeps both ends of a directed edge', () => {
    expect(
      shown(
        storeWithFilter({
          id: testId('following'),
          type: 'edge',
          options: { type: FOLLOWS, operator: 'EXISTS' },
        }),
      ),
    ).toEqual(['rex', 'sam']);
  });
});

describe('resolveNodeShape', () => {
  it('matches an array-valued categorical attribute against a discrete map entry', () => {
    // Categorical (multi-select) variables store their value as an array, e.g.
    // ['asian']. The discrete mapping values are scalars, so the resolver must
    // match array members rather than comparing the whole array by identity.
    const shape: NodeDefinition['shape'] = {
      default: 'circle',
      dynamic: {
        variable: asEntityAttributeReference(ETHNICITY),
        type: 'discrete',
        map: [
          { value: 'asian', shape: 'square' },
          { value: 'white', shape: 'diamond' },
        ],
      },
    };

    expect(
      resolveNodeShape({ shape: shape }, { [ETHNICITY]: ['asian'] }, {}),
    ).toBe('square');
  });

  it('matches a scalar-valued attribute against a discrete map entry', () => {
    const shape: NodeDefinition['shape'] = {
      default: 'circle',
      dynamic: {
        variable: asEntityAttributeReference(ROLE),
        type: 'discrete',
        map: [{ value: 'lead', shape: 'diamond' }],
      },
    };

    expect(resolveNodeShape({ shape: shape }, { [ROLE]: 'lead' }, {})).toBe(
      'diamond',
    );
  });

  /**
   * The breakpoints branch, which the Architect editor writes and nothing here
   * covered. Thresholds are inclusive lower bounds scanned from the top, so n
   * of them describe n+1 bands — which is why the schema caps them at two.
   */
  describe('breakpoints', () => {
    type Thresholds = Extract<
      NonNullable<NodeDefinition['shape']['dynamic']>,
      { type: 'breakpoints' }
    >['thresholds'];

    const shape = (thresholds: Thresholds): NodeDefinition['shape'] => ({
      default: 'circle',
      dynamic: {
        variable: asEntityAttributeReference(AGE),
        type: 'breakpoints',
        thresholds,
      },
    });

    it('treats a threshold as an inclusive lower bound', () => {
      const definition = shape([{ value: 18, shape: 'square' }]);

      expect(resolveNodeShape({ shape: definition }, { [AGE]: 18 }, {})).toBe(
        'square',
      );
      expect(resolveNodeShape({ shape: definition }, { [AGE]: 19 }, {})).toBe(
        'square',
      );
    });

    it('falls back to the default below the lowest threshold', () => {
      const definition = shape([{ value: 18, shape: 'square' }]);

      expect(resolveNodeShape({ shape: definition }, { [AGE]: 17 }, {})).toBe(
        'circle',
      );
    });

    it('gives two thresholds three bands', () => {
      const definition = shape([
        { value: 18, shape: 'square' },
        { value: 65, shape: 'diamond' },
      ]);

      expect(resolveNodeShape({ shape: definition }, { [AGE]: 0 }, {})).toBe(
        'circle',
      );
      expect(resolveNodeShape({ shape: definition }, { [AGE]: 18 }, {})).toBe(
        'square',
      );
      expect(resolveNodeShape({ shape: definition }, { [AGE]: 64 }, {})).toBe(
        'square',
      );
      expect(resolveNodeShape({ shape: definition }, { [AGE]: 65 }, {})).toBe(
        'diamond',
      );
      expect(resolveNodeShape({ shape: definition }, { [AGE]: 120 }, {})).toBe(
        'diamond',
      );
    });

    it('falls back to the default for an answer that is not a number', () => {
      const definition = shape([{ value: 18, shape: 'square' }]);

      // Including the string form of a number the threshold would otherwise
      // meet: the comparison is numeric, and a coerced string would make a
      // text answer silently change a node's shape.
      expect(resolveNodeShape({ shape: definition }, { [AGE]: '20' }, {})).toBe(
        'circle',
      );
      expect(resolveNodeShape({ shape: definition }, { [AGE]: null }, {})).toBe(
        'circle',
      );
      expect(resolveNodeShape({ shape: definition }, {}, {})).toBe('circle');
    });
  });

  it('maps a true boolean attribute and falls back for other values', () => {
    const shape: NodeDefinition['shape'] = {
      default: 'square',
      dynamic: {
        variable: asEntityAttributeReference(IS_PERSON),
        type: 'discrete',
        map: [{ value: true, shape: 'circle' }],
      },
    };

    expect(resolveNodeShape({ shape: shape }, { [IS_PERSON]: true }, {})).toBe(
      'circle',
    );
    expect(resolveNodeShape({ shape: shape }, { [IS_PERSON]: false }, {})).toBe(
      'square',
    );
    expect(resolveNodeShape({ shape: shape }, {}, {})).toBe('square');
    expect(resolveNodeShape({ shape: shape }, { [IS_PERSON]: null }, {})).toBe(
      'square',
    );
  });
});

describe('resolveNodeShape with custom shapes', () => {
  const homeSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 50 L50 10 L90 50 Z" fill="var(--node-color)"/></svg>';
  const treeSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="40" r="30" fill="#2e7d32"/></svg>';
  const customShapes: NodeDefinition['customShapes'] = {
    home: { name: 'Home', asset: 'home-asset' },
    tree: { name: 'Tree', asset: 'tree-asset' },
  };
  const shapeSvgs = { 'home-asset': homeSvg, 'tree-asset': treeSvg };

  it('resolves a custom default to that shape’s svg', () => {
    expect(
      resolveNodeShape(
        { shape: { default: 'custom:home' }, customShapes },
        {},
        shapeSvgs,
      ),
    ).toMatchObject({ svg: homeSvg });
  });

  it('draws a circle while a custom shape’s svg has not loaded', () => {
    expect(
      resolveNodeShape(
        { shape: { default: 'custom:home' }, customShapes },
        {},
        { 'tree-asset': treeSvg },
      ),
    ).toBe('circle');
  });

  it('resolves a custom shape from a discrete map entry', () => {
    const definition: Pick<NodeDefinition, 'shape' | 'customShapes'> = {
      customShapes,
      shape: {
        default: 'circle',
        dynamic: {
          variable: asEntityAttributeReference(KIND),
          type: 'discrete',
          map: [
            { value: 'home', shape: 'custom:home' },
            { value: 'park', shape: 'custom:tree' },
          ],
        },
      },
    };

    expect(
      resolveNodeShape(definition, { [KIND]: 'home' }, shapeSvgs),
    ).toMatchObject({
      svg: homeSvg,
    });
    expect(
      resolveNodeShape(definition, { [KIND]: 'park' }, shapeSvgs),
    ).toMatchObject({
      svg: treeSvg,
    });
    expect(resolveNodeShape(definition, { [KIND]: 'other' }, shapeSvgs)).toBe(
      'circle',
    );
  });

  it('resolves a custom shape from a breakpoint threshold', () => {
    const definition: Pick<NodeDefinition, 'shape' | 'customShapes'> = {
      customShapes,
      shape: {
        default: 'custom:home',
        dynamic: {
          variable: asEntityAttributeReference(AGE),
          type: 'breakpoints',
          thresholds: [
            { value: 18, shape: 'custom:tree' },
            { value: 65, shape: 'diamond' },
          ],
        },
      },
    };

    expect(
      resolveNodeShape(definition, { [AGE]: 10 }, shapeSvgs),
    ).toMatchObject({
      svg: homeSvg,
    });
    expect(
      resolveNodeShape(definition, { [AGE]: 30 }, shapeSvgs),
    ).toMatchObject({
      svg: treeSvg,
    });
    expect(resolveNodeShape(definition, { [AGE]: 70 }, shapeSvgs)).toBe(
      'diamond',
    );
  });

  it('falls back to a circle for a reference the node type does not define', () => {
    expect(
      resolveNodeShape(
        { shape: { default: 'custom:missing' }, customShapes },
        {},
        shapeSvgs,
      ),
    ).toBe('circle');
    expect(
      resolveNodeShape({ shape: { default: 'custom:home' } }, {}, shapeSvgs),
    ).toBe('circle');
  });
});
