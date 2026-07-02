'use client';

import { type CSSProperties, forwardRef, type ReactNode } from 'react';

import type { NodeShape } from '@codaco/fresco-ui/Node';
import type { NcEdge, NcNode } from '@codaco/shared-consts';
import PedigreeLayout from '~/interfaces/FamilyPedigree/pedigree-layout/components/PedigreeLayout';
import type { VariableConfig } from '~/interfaces/FamilyPedigree/store';

import { NotationKey } from '../components/NotationKey';

type PedigreeSnapshotDocumentProps = {
  title: string;
  nodes: Map<string, NcNode>;
  edges: Map<string, NcEdge>;
  variableConfig: VariableConfig;
  nodeWidth: number;
  nodeHeight: number;
  renderNode: (node: NcNode & { id: string }) => ReactNode;
  highlightedNodeIds?: Set<string>;
  highlightedEdgeKeys?: Set<string>;
  // Colour of the notation-key glyphs (the shown condition's colour).
  glyphColour: string;
  keyShape: NodeShape;
  showAtRiskStatuses: boolean;
  // The key only describes the status glyphs, which are drawn on the pedigree
  // only once a condition is chosen; omit it for the plain (no-condition) view.
  showKey: boolean;
};

/**
 * A light-themed, printable rendering of the current pedigree, built off-screen
 * and captured to a PNG by the snapshot action. Unlike the on-screen interface
 * (dark, scrollable, interactive) this lays the whole pedigree out at natural
 * size on a white background with dark ink — via `--np-label-color` — so it
 * prints legibly, and pairs it with a heading and the symbol key.
 *
 * `forwardRef` exposes the root element so the caller can pass it to
 * `exportSnapshot`.
 */
export const PedigreeSnapshotDocument = forwardRef<
  HTMLDivElement,
  PedigreeSnapshotDocumentProps
>(function PedigreeSnapshotDocument(
  {
    title,
    nodes,
    edges,
    variableConfig,
    nodeWidth,
    nodeHeight,
    renderNode,
    highlightedNodeIds,
    highlightedEdgeKeys,
    glyphColour,
    keyShape,
    showAtRiskStatuses,
    showKey,
  },
  ref,
) {
  // Snapshot-only CSS custom properties (@types/react does not type custom
  // properties, hence the scoped assertion — the established pattern across
  // fresco-ui/interview):
  //  • --np-label-color: dark ink for the single-condition node labels.
  //  • --dim-blend: the surface dimmed nodes/edges recede into. On screen this
  //    is the dark interview background; here it is the white paper, so dimmed
  //    pieces fade toward white instead of muddying toward navy.
  const snapshotVars = {
    '--np-label-color': '#111827',
    '--dim-blend': '#ffffff',
  } as CSSProperties;

  return (
    <div
      ref={ref}
      aria-hidden
      data-pedigree-snapshot
      style={{
        // Rendered off-screen; only the captured image is user-facing.
        position: 'fixed',
        top: 0,
        left: '-100000px',
        pointerEvents: 'none',
        // Light theme so the capture prints on white paper.
        backgroundColor: '#ffffff',
        color: '#111827',
        display: 'inline-flex',
        flexDirection: 'column',
        gap: '1.5rem',
        padding: '2.5rem',
        ...snapshotVars,
      }}
    >
      <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>
        {title}
      </h2>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <PedigreeLayout
          nodes={nodes}
          edges={edges}
          variableConfig={variableConfig}
          nodeWidth={nodeWidth}
          nodeHeight={nodeHeight}
          renderNode={renderNode}
          highlightedNodeIds={highlightedNodeIds}
          highlightedEdgeKeys={highlightedEdgeKeys}
        />
      </div>

      {showKey && (
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1.25rem' }}>
          <h3
            style={{
              margin: '0 0 0.75rem',
              fontSize: '1rem',
              fontWeight: 700,
            }}
          >
            Key
          </h3>
          <div className="flex flex-col gap-2" style={{ maxWidth: '28rem' }}>
            <NotationKey
              glyphColour={glyphColour}
              shape={keyShape}
              showAtRiskStatuses={showAtRiskStatuses}
            />
          </div>
        </div>
      )}
    </div>
  );
});
