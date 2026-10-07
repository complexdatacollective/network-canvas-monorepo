import { describe, expect, it } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import { resolveSex } from '../resolveSex';

const BIO_SEX_VAR = 'biologicalSex';
const GAMETE_ROLE_VAR = 'gameteRole';
const REL_TYPE_VAR = 'relationshipType';

const config = {
  biologicalSexVariable: BIO_SEX_VAR,
  gameteRoleVariable: GAMETE_ROLE_VAR,
  relationshipTypeVariable: REL_TYPE_VAR,
};

function makeNode(id: string, attrs: Record<string, unknown> = {}): NcNode {
  return {
    [entityPrimaryKeyProperty]: id,
    type: 'person',
    [entityAttributesProperty]:
      attrs as NcNode[typeof entityAttributesProperty],
  };
}

function makeEdge(
  from: string,
  to: string,
  attrs: Record<string, unknown> = {},
): NcEdge {
  return {
    [entityPrimaryKeyProperty]: `${from}->${to}`,
    type: 'family',
    from,
    to,
    [entityAttributesProperty]:
      attrs as NcEdge[typeof entityAttributesProperty],
  };
}

describe('resolveSex — explicit biologicalSexVariable', () => {
  it('returns female when biologicalSexVariable === "female"', () => {
    const node = makeNode('p1', { [BIO_SEX_VAR]: 'female' });
    expect(resolveSex('p1', [node], [], config)).toBe('female');
  });

  it('returns male when biologicalSexVariable === "male"', () => {
    const node = makeNode('p1', { [BIO_SEX_VAR]: 'male' });
    expect(resolveSex('p1', [node], [], config)).toBe('male');
  });

  it('falls through (does not return intersex) when biologicalSexVariable === "intersex"', () => {
    const node = makeNode('p1', { [BIO_SEX_VAR]: 'intersex' });
    expect(resolveSex('p1', [node], [], config)).toBe('unknown');
  });

  it('falls through when biologicalSexVariable === "unknown"', () => {
    const node = makeNode('p1', { [BIO_SEX_VAR]: 'unknown' });
    expect(resolveSex('p1', [node], [], config)).toBe('unknown');
  });

  it('falls through when biologicalSexVariable === "preferNotToSay"', () => {
    const node = makeNode('p1', { [BIO_SEX_VAR]: 'preferNotToSay' });
    expect(resolveSex('p1', [node], [], config)).toBe('unknown');
  });

  it('falls through when biologicalSexVariable is absent', () => {
    const node = makeNode('p1');
    expect(resolveSex('p1', [node], [], config)).toBe('unknown');
  });
});

describe('resolveSex — gameteRole fallback (genetic parent edges)', () => {
  it('returns female when the person is the egg parent on an outgoing biological edge', () => {
    const parent = makeNode('parent');
    const child = makeNode('child');
    const edge = makeEdge('parent', 'child', {
      [REL_TYPE_VAR]: ['biological'],
      [GAMETE_ROLE_VAR]: 'egg',
    });
    expect(resolveSex('parent', [parent, child], [edge], config)).toBe(
      'female',
    );
  });

  it('returns male when the person is the sperm parent on an outgoing biological edge', () => {
    const parent = makeNode('parent');
    const child = makeNode('child');
    const edge = makeEdge('parent', 'child', {
      [REL_TYPE_VAR]: ['biological'],
      [GAMETE_ROLE_VAR]: 'sperm',
    });
    expect(resolveSex('parent', [parent, child], [edge], config)).toBe('male');
  });

  it('returns female when the person is the egg parent on an outgoing donor edge', () => {
    const donor = makeNode('donor');
    const child = makeNode('child');
    const edge = makeEdge('donor', 'child', {
      [REL_TYPE_VAR]: ['donor'],
      [GAMETE_ROLE_VAR]: 'egg',
    });
    expect(resolveSex('donor', [donor, child], [edge], config)).toBe('female');
  });

  it('ignores non-genetic edges (social) when deriving gameteRole', () => {
    const node = makeNode('p1');
    const other = makeNode('p2');
    const edge = makeEdge('p1', 'p2', {
      [REL_TYPE_VAR]: ['social'],
      [GAMETE_ROLE_VAR]: 'egg',
    });
    expect(resolveSex('p1', [node, other], [edge], config)).toBe('unknown');
  });

  it('ignores edges where the person is the child (incoming), not the parent', () => {
    const parent = makeNode('parent');
    const child = makeNode('child');
    const edge = makeEdge('parent', 'child', {
      [REL_TYPE_VAR]: ['biological'],
      [GAMETE_ROLE_VAR]: 'egg',
    });
    // Resolving for the child — not the parent — should not use this edge
    expect(resolveSex('child', [parent, child], [edge], config)).toBe(
      'unknown',
    );
  });
});

describe('resolveSex — leaf nodes (no outgoing genetic edges)', () => {
  it('returns unknown for a leaf node with no explicit sex and no outgoing genetic edges', () => {
    const node = makeNode('leaf');
    expect(resolveSex('leaf', [node], [], config)).toBe('unknown');
  });
});

describe('resolveSex — explicit value takes precedence over gameteRole', () => {
  it('explicit female wins over a sperm gameteRole on an outgoing edge', () => {
    const parent = makeNode('parent', { [BIO_SEX_VAR]: 'female' });
    const child = makeNode('child');
    const edge = makeEdge('parent', 'child', {
      [REL_TYPE_VAR]: ['biological'],
      [GAMETE_ROLE_VAR]: 'sperm',
    });
    expect(resolveSex('parent', [parent, child], [edge], config)).toBe(
      'female',
    );
  });

  it('explicit male wins over an egg gameteRole on an outgoing edge', () => {
    const parent = makeNode('parent', { [BIO_SEX_VAR]: 'male' });
    const child = makeNode('child');
    const edge = makeEdge('parent', 'child', {
      [REL_TYPE_VAR]: ['biological'],
      [GAMETE_ROLE_VAR]: 'egg',
    });
    expect(resolveSex('parent', [parent, child], [edge], config)).toBe('male');
  });
});
