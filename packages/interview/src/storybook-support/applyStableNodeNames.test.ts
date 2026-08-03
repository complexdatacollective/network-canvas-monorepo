import { describe, expect, it } from 'vitest';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import { entityAttributesProperty } from '@codaco/shared-consts';

import applyStableNodeNames from './applyStableNodeNames';

function buildNames(seed: number) {
  const interview = new SyntheticInterview(seed);
  const nodeType = interview.addNodeType({ name: 'Person' });
  const nameVariable = nodeType.addVariable({ type: 'text', name: 'name' });

  interview.addStage('Narrative', { initialNodes: { count: 3 } });
  applyStableNodeNames(interview, nameVariable.id);

  return interview
    .getNetwork()
    .nodes.map(
      (node) => node[entityAttributesProperty][nameVariable.id] as string,
    );
}

describe('applyStableNodeNames', () => {
  it('keeps story labels constant across synthetic-data seeds', () => {
    expect(buildNames(1)).toEqual(['Alex', 'Blair', 'Casey']);
    expect(buildNames(999)).toEqual(['Alex', 'Blair', 'Casey']);
  });
});
