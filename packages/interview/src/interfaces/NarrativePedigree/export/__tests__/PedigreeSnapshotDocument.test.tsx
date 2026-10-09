import { render } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import type { PedigreeLink } from '../../../FamilyPedigree/pedigree-layout/types';
import { PedigreeSnapshotDocument } from '../PedigreeSnapshotDocument';

const nodeIds = ['mum', 'dad', 'ego', 'sister'];
const links: PedigreeLink[] = [
  { source: 'mum', target: 'dad', kind: 'partner', isActive: true },
  { source: 'mum', target: 'ego', kind: 'biological' },
  { source: 'dad', target: 'ego', kind: 'biological' },
  { source: 'mum', target: 'sister', kind: 'biological' },
  { source: 'dad', target: 'sister', kind: 'biological' },
];

const renderNode = (nodeId: string) => (
  <div data-testid={`node-${nodeId}`}>{nodeId}</div>
);

function renderDocument() {
  const ref = createRef<HTMLDivElement>();
  render(
    <PedigreeSnapshotDocument
      ref={ref}
      title="Test snapshot"
      nodeIds={nodeIds}
      links={links}
      nodeNames={new Map()}
      nodeShapes={new Map()}
      edgeColor="var(--edge-1)"
      nodeWidth={100}
      nodeHeight={100}
      renderNode={renderNode}
      glyphColour="var(--node-1)"
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

  it('lays out the whole family at natural size, untransformed', () => {
    const root = renderDocument();
    for (const id of nodeIds) {
      expect(root?.querySelector(`[data-testid="node-${id}"]`)).not.toBeNull();
    }
    // Nothing in the document carries the canvas's pan and zoom transform.
    const transformed = [...(root?.querySelectorAll('*') ?? [])].filter(
      (element) =>
        element instanceof HTMLElement && element.style.transform !== '',
    );
    expect(transformed).toEqual([]);
  });
});
