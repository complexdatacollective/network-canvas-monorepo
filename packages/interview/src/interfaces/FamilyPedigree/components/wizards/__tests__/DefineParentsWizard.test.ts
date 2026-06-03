import { describe, expect, it } from 'vitest';

import type { NcNode } from '@codaco/shared-consts';
import type { VariableConfig } from '~/interfaces/FamilyPedigree/store';

import { getNodeSubjectPossessive } from '../DefineParentsWizard';

const variableConfig: VariableConfig = {
  nodeType: 'person',
  edgeType: 'family',
  nodeLabelVariable: 'name',
  egoVariable: 'isEgo',
  relationshipTypeVariable: 'relationship',
  isActiveVariable: 'isActive',
  isGestationalCarrierVariable: 'isGC',
};

function nodesWith(
  id: string,
  attributes: NcNode['attributes'],
): Map<string, NcNode> {
  return new Map([[id, { _uid: id, type: 'person', attributes }]]);
}

describe('getNodeSubjectPossessive', () => {
  it('returns "your" when the focal person is the ego', () => {
    const nodes = nodesWith('n1', {
      [variableConfig.egoVariable]: true,
      [variableConfig.nodeLabelVariable]: 'Linda',
    });
    expect(getNodeSubjectPossessive('n1', nodes, variableConfig)).toBe('your');
  });

  it("returns the person's name possessive for a named non-ego", () => {
    const nodes = nodesWith('n1', {
      [variableConfig.egoVariable]: false,
      [variableConfig.nodeLabelVariable]: 'Linda',
    });
    expect(getNodeSubjectPossessive('n1', nodes, variableConfig)).toBe(
      "Linda's",
    );
  });

  it('falls back to "this person\'s" for an unnamed non-ego', () => {
    const nodes = nodesWith('n1', {
      [variableConfig.egoVariable]: false,
      [variableConfig.nodeLabelVariable]: '',
    });
    expect(getNodeSubjectPossessive('n1', nodes, variableConfig)).toBe(
      "this person's",
    );
  });

  it('falls back to "this person\'s" when the node is missing', () => {
    expect(getNodeSubjectPossessive('missing', new Map(), variableConfig)).toBe(
      "this person's",
    );
  });
});
