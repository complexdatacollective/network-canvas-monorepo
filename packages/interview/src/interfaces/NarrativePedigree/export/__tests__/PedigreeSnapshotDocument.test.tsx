import { render } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import {
  entityAttributesProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';
import type { VariableConfig } from '~/interfaces/FamilyPedigree/store';

import { PedigreeSnapshotDocument } from '../PedigreeSnapshotDocument';

const variableConfig: VariableConfig = {
  nodeType: 'person',
  edgeType: 'family',
  nodeLabelVariable: 'name',
  egoVariable: 'isEgo',
  relationshipVariable: 'relationship',
  relationshipTypeVariable: 'rel',
  isActiveVariable: 'active',
  isGestationalCarrierVariable: 'gc',
  gameteRoleVariable: 'gameteRole',
  biologicalSexVariable: 'biologicalSex',
};

const nodes = new Map<string, NcNode>([
  [
    'ego',
    {
      _uid: 'ego',
      type: 'person',
      [entityAttributesProperty]: { isEgo: true },
    },
  ],
]);

const renderNode = (node: NcNode & { id: string }) => (
  <div data-testid={`node-${node.id}`}>{node.id}</div>
);

function renderDocument() {
  const ref = createRef<HTMLDivElement>();
  render(
    <PedigreeSnapshotDocument
      ref={ref}
      title="Test snapshot"
      nodes={nodes}
      edges={new Map<string, NcEdge>()}
      variableConfig={variableConfig}
      nodeWidth={100}
      nodeHeight={100}
      renderNode={renderNode}
      glyphColour="#e53e3e"
      keyShape="circle"
      showAtRiskStatuses
      showKey={false}
    />,
  );
  return ref.current;
}

describe('PedigreeSnapshotDocument', () => {
  it('re-themes dimming to white so dimmed nodes and edges recede into the paper', () => {
    // dimColor() blends toward var(--dim-blend); the printable document must set
    // that to white. Otherwise dimmed pieces blend toward the dark on-screen
    // background (which the off-screen document still inherits) and print muddy.
    const root = renderDocument();
    expect(root).not.toBeNull();
    expect(root?.style.getPropertyValue('--dim-blend')).toBe('#ffffff');
  });

  it('sets dark label ink for the printable document', () => {
    const root = renderDocument();
    expect(root?.style.getPropertyValue('--np-label-color')).toBe('#111827');
  });
});
