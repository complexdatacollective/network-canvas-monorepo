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
        '../../../../../packages/development-protocol/protocol.json',
      );
      const protocol = JSON.parse(
        readFileSync(protocolPath, 'utf-8'),
      ) as unknown;

      const state = getMockState({
        activeProtocol: { present: protocol },
      }) as unknown as RootState;

      const index = getVariableIndex(state);

      // stages.10.prompts.0.variable in development-protocol/protocol.json
      expect(Object.values(index)).toContain(
        '1096204b-48fe-444c-b642-4ab211f7f57c',
      );
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
