'use client';

import { type CSSProperties, forwardRef, type ReactNode } from 'react';

import { AppMessage } from '@codaco/app-i18n/react';
import type { NodeShape } from '@codaco/fresco-ui/Node';

import PedigreeLayout from '../../FamilyPedigree/pedigree-layout/components/PedigreeLayout';
import type {
  PedigreeLink,
  PedigreeSymbolShape,
} from '../../FamilyPedigree/pedigree-layout/types';
import { NotationKey } from '../components/NotationKey';
import { messages } from '../messages';

type PedigreeSnapshotDocumentProps = {
  title: string;
  /** Everyone in the family, and the links between them, as the canvas lays
   * them out. */
  nodeIds: readonly string[];
  links: readonly PedigreeLink[];
  nodeNames: ReadonlyMap<string, string>;
  /** The shape each person's symbol is drawn with, as on the canvas. */
  nodeShapes: ReadonlyMap<string, PedigreeSymbolShape>;
  edgeColor: string;
  nodeWidth: number;
  nodeHeight: number;
  /** Each person's symbol, without the canvas's controls. */
  renderNode: (nodeId: string) => ReactNode;
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
 * (dark, panned and zoomed, interactive) this lays the whole pedigree out at natural
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
    nodeIds,
    links,
    nodeNames,
    nodeShapes,
    edgeColor,
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
          nodeIds={nodeIds}
          links={links}
          nodeNames={nodeNames}
          nodeShapes={nodeShapes}
          edgeColor={edgeColor}
          nodeWidth={nodeWidth}
          nodeHeight={nodeHeight}
          renderNode={(nodeId) => (
            <div className="flex size-full items-center justify-center">
              {renderNode(nodeId)}
            </div>
          )}
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
            <AppMessage message={messages.key} />
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
