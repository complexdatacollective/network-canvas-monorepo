import { describe, expect, it } from 'vitest';

import { entityAttributesProperty } from '@codaco/shared-consts';
import type { NcEdge, NcNode } from '@codaco/shared-consts';

import {
  buildOverrideEdgesMap,
  buildOverrideNodesMap,
} from '../FamilyPedigree';

const node = (uid: string, type: string): NcNode => ({
  _uid: uid,
  type,
  [entityAttributesProperty]: {},
});

const edge = (uid: string, type: string, from: string, to: string): NcEdge => ({
  _uid: uid,
  type,
  from,
  to,
  [entityAttributesProperty]: {},
});

describe('override-path network filtering (issue #664)', () => {
  it('omits foreign-typed nodes so they do not render as orphan pedigree members', () => {
    const allNodes: NcNode[] = [
      node('p1', 'person'),
      node('p2', 'person'),
      node('place1', 'place'),
    ];

    const map = buildOverrideNodesMap(allNodes, 'person');

    expect(map.size).toBe(2);
    expect(map.has('p1')).toBe(true);
    expect(map.has('p2')).toBe(true);
    expect(map.has('place1')).toBe(false);
    for (const seeded of map.values()) {
      expect(seeded.type).toBe('person');
    }
  });

  it('omits foreign-typed edges so none is coerced to a pedigree relationship', () => {
    const allEdges: NcEdge[] = [
      edge('e1', 'family', 'p1', 'p2'),
      edge('e2', 'visited', 'p1', 'place1'),
    ];

    const map = buildOverrideEdgesMap(allEdges, 'family');

    expect(map.size).toBe(1);
    expect(map.has('e1')).toBe(true);
    expect(map.has('e2')).toBe(false);
    for (const seeded of map.values()) {
      expect(seeded.type).toBe('family');
    }
  });
});
