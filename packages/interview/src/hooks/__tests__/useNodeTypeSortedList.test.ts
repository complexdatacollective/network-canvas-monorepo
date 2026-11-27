import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  getLocaleMetadata,
  type NodeTypeSortRule,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { testId, testTypeId, testVariableId } from '../../__tests__/testIds';
import { createInitialNetwork } from '../../contract/network';
import type { InterviewPayload } from '../../contract/types';
import { store as createStore } from '../../store/store';
import createSorter from '../../utils/createSorter';
import useNodeTypeSortedList from '../useNodeTypeSortedList';

const PERSON = testTypeId('person');
const PLACE = testTypeId('place');
const NAME = testVariableId('name');
const AGE = testVariableId('age');
const TITLE = testVariableId('title');

const payload: InterviewPayload = {
  session: {
    id: 'session-1',
    startTime: '2026-01-01T00:00:00.000Z',
    finishTime: null,
    exportTime: null,
    lastUpdated: '2026-01-01T00:00:00.000Z',
    localeOptions: [getLocaleMetadata('en')],
    network: createInitialNetwork(),
  },
  protocol: {
    id: 'protocol-1',
    hash: 'hash',
    importedAt: '2026-01-01T00:00:00.000Z',
    name: 'Sorting protocol',
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en'] },
    assets: [],
    codebook: {
      node: {
        [PERSON]: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            [NAME]: { name: 'name', type: 'text', component: 'Text' },
            [AGE]: { name: 'age', type: 'number', component: 'Number' },
          },
        },
        [PLACE]: {
          name: 'Place',
          color: 'node-color-seq-2',
          shape: { default: 'square' },
          variables: {
            [TITLE]: { name: 'title', type: 'text', component: 'Text' },
          },
        },
      },
    },
    stages: [],
  },
};
const store = createStore(payload, { onSync: () => Promise.resolve() });

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(Provider, { store }, children);

const node = (
  id: string,
  type: string,
  attributes: Record<string, string | number>,
): NcNode => ({
  [entityPrimaryKeyProperty]: id,
  type,
  [entityAttributesProperty]: attributes,
});

const rule = (
  type: string,
  property: string,
  direction: 'asc' | 'desc' = 'asc',
): NodeTypeSortRule => ({
  id: testId(`sort ${type} ${property}`),
  type,
  property: asEntityAttributeReference(property),
  direction,
});

const ids = (nodes: readonly NcNode[]) =>
  nodes.map((each) => each[entityPrimaryKeyProperty]);

const nodes = [
  node('park', PLACE, { [TITLE]: 'Park' }),
  node('zoe', PERSON, { [NAME]: 'Zoe', [AGE]: 9 }),
  node('cafe', PLACE, { [TITLE]: 'Cafe' }),
  node('amir', PERSON, { [NAME]: 'Amir', [AGE]: 10 }),
];

const sorted = (
  rules: NodeTypeSortRule[] | undefined,
  nodeTypeOrder: string[] | undefined,
  list: NcNode[] = nodes,
) =>
  ids(
    renderHook(
      () => useNodeTypeSortedList(list, rules, nodeTypeOrder, [PERSON, PLACE]),
      { wrapper },
    ).result.current,
  );

describe('useNodeTypeSortedList', () => {
  it('groups by nodeTypeOrder then sorts each group by its own rules', () => {
    expect(
      sorted([rule(PERSON, NAME), rule(PLACE, TITLE, 'desc')], [PLACE, PERSON]),
    ).toEqual(['park', 'cafe', 'amir', 'zoe']);
  });

  it('falls back to subject order', () => {
    // No node type order: people first, as the subject lists them; and with
    // no rule for places they keep the order they came in.
    expect(sorted([rule(PERSON, NAME)], undefined)).toEqual([
      'amir',
      'zoe',
      'park',
      'cafe',
    ]);
    expect(sorted(undefined, undefined)).toEqual([
      'zoe',
      'amir',
      'park',
      'cafe',
    ]);
  });

  it('a typed rule on a number variable sorts numerically', () => {
    const people = [
      node('ten', PERSON, { [AGE]: 10 }),
      node('nine', PERSON, { [AGE]: 9 }),
    ];
    // Compared as text, 10 comes before 9; the sorter compares numbers only
    // when it is told the variable is a number.
    expect(
      ids(
        createSorter<NcNode>([
          { property: [entityAttributesProperty, AGE], type: 'string' },
        ])(people),
      ),
    ).toEqual(['ten', 'nine']);
    expect(sorted([rule(PERSON, AGE)], undefined, people)).toEqual([
      'nine',
      'ten',
    ]);
  });
});
