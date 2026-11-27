import { describe, expect, it } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
} from '@codaco/shared-consts';

import { testTypeId } from '../../__tests__/testIds';
import { simLinksFor } from '../useAutoLayout';

const FOLLOWS = testTypeId('follows');
const KNOWS = testTypeId('knows');

const edge = (type: string, from: string, to: string): NcEdge => ({
  [entityPrimaryKeyProperty]: `${type}-${from}-${to}`,
  [entityAttributesProperty]: {},
  type,
  from,
  to,
});

const indexById = new Map([
  ['a', 0],
  ['b', 1],
]);

describe('simLinksFor', () => {
  it('adds one link for both edges of a reciprocal pair', () => {
    expect(
      simLinksFor(
        [edge(FOLLOWS, 'a', 'b'), edge(FOLLOWS, 'b', 'a')],
        indexById,
      ),
    ).toEqual([{ source: 0, target: 1 }]);
  });

  it('adds one link for edges of several types between one pair and leaves out unseeded ends', () => {
    expect(
      simLinksFor(
        [edge(FOLLOWS, 'a', 'b'), edge(KNOWS, 'b', 'a'), edge(KNOWS, 'a', 'c')],
        indexById,
      ),
    ).toEqual([{ source: 0, target: 1 }]);
  });
});
