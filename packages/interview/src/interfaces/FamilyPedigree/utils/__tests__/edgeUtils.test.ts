import { describe, expect, it } from 'vitest';

import { entityAttributesProperty, type NcEdge } from '@codaco/shared-consts';

import { getEdgeRelationshipType } from '../edgeUtils';

function edgeWithRelationship(value: unknown): NcEdge {
  return {
    _uid: 'edge',
    type: 'family',
    from: 'one',
    to: 'two',
    [entityAttributesProperty]: { relationshipType: value },
  } as NcEdge;
}

describe('getEdgeRelationshipType', () => {
  it('reads a categorical relationship value', () => {
    expect(
      getEdgeRelationshipType(
        edgeWithRelationship(['partner']),
        'relationshipType',
      ),
    ).toBe('partner');
  });

  it('reads an ordinal relationship value', () => {
    expect(
      getEdgeRelationshipType(
        edgeWithRelationship('surrogate'),
        'relationshipType',
      ),
    ).toBe('surrogate');
  });

  it('returns undefined when the relationship value is absent', () => {
    expect(
      getEdgeRelationshipType(
        edgeWithRelationship(undefined),
        'relationshipType',
      ),
    ).toBeUndefined();
  });
});
