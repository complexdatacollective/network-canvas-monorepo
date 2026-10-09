'use client';

import { type ReactNode, useMemo } from 'react';

import Spinner from '@codaco/fresco-ui/Spinner';

import { alignPedigree } from '../alignPedigree';
import {
  computeLayoutMetrics,
  type LayoutDimensions,
} from '../layoutDimensions';
import {
  buildConnectorData,
  pedigreeLayoutToPositions,
  toPedigreeInput,
} from '../pedigreeAdapter';
import type { PedigreeLink } from '../types';
import { PedigreeEdgeSvg } from './EdgeRenderer';

type PedigreeLayoutProps = {
  /** Everyone to place, in a stable order. */
  nodeIds: readonly string[];
  links: readonly PedigreeLink[];
  /**
   * Display names by node id. The connector router uses them to keep a
   * separated partnership's break mark clear of a labelled side.
   */
  nodeNames?: ReadonlyMap<string, string>;
  nodeWidth: number;
  nodeHeight: number;
  /** See `LayoutDimensions`. */
  rowGapRatio?: number;
  columnGapRatio?: number;
  renderNode: (nodeId: string) => ReactNode;
  /** A CSS colour for every connector. */
  edgeColor?: string;
  highlightedNodeIds?: Set<string>;
  highlightedEdgeKeys?: Set<string>;
};

export default function PedigreeLayout({
  nodeIds,
  links,
  nodeNames,
  nodeWidth,
  nodeHeight,
  rowGapRatio,
  columnGapRatio,
  renderNode,
  edgeColor = 'var(--edge-1)',
  highlightedNodeIds,
  highlightedEdgeKeys,
}: PedigreeLayoutProps) {
  const dimensions: LayoutDimensions = useMemo(
    () => ({
      nodeWidth,
      nodeHeight,
      rowGapRatio,
      columnGapRatio,
    }),
    [nodeWidth, nodeHeight, rowGapRatio, columnGapRatio],
  );

  const metrics = useMemo(() => computeLayoutMetrics(dimensions), [dimensions]);

  const layoutResult = useMemo(() => {
    if (dimensions.nodeWidth === 0 || dimensions.nodeHeight === 0) return null;
    if (nodeIds.length === 0) return null;

    const { input, indexToId, idToIndex } = toPedigreeInput(nodeIds, links);

    const layout = alignPedigree(input);
    const positions = pedigreeLayoutToPositions(layout, indexToId, dimensions);
    const names = nodeNames
      ? indexToId.map((id) => nodeNames.get(id) ?? '')
      : undefined;

    const connectorData = buildConnectorData(
      layout,
      links,
      dimensions,
      input.parents,
      idToIndex,
      names,
      indexToId,
    );

    return { positions, connectorData };
  }, [nodeIds, links, nodeNames, dimensions]);

  if (nodeWidth === 0 || nodeHeight === 0) {
    return (
      <div className="flex size-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!layoutResult) return null;

  const { positions, connectorData } = layoutResult;

  // Diamond nodes overflow their container because scale(0.85) + rotate(45°)
  // produces a bounding box ~1.2× the node size. Add inset so nodes and edges
  // are shifted inward, preventing diamond tips from being clipped.
  const diamondInset = Math.ceil(nodeWidth * 0.1);
  // Routed partnership lines can run above the top row, and a partnership
  // across rows can drop beside the outermost people; make room for both.
  const routedSegments = connectorData.connectors.groupLines.flatMap((line) => [
    line.segment,
    ...(line.endpointSegments ?? []),
  ]);
  const routedXs = routedSegments.flatMap((segment) => [
    segment.x1,
    segment.x2,
  ]);
  const routedConnectorInset = -Math.min(
    0,
    ...routedSegments.flatMap((segment) => [segment.y1, segment.y2]),
  );
  const routedConnectorInsetX = -Math.min(0, ...routedXs);

  let totalWidth = Math.max(0, ...routedXs);
  let totalHeight = 0;
  for (const pos of positions.values()) {
    const rightEdge = pos.x + metrics.containerWidth;
    const bottomEdge = pos.y + metrics.containerHeight;
    if (rightEdge > totalWidth) totalWidth = rightEdge;
    if (bottomEdge > totalHeight) totalHeight = bottomEdge;
  }

  totalWidth += diamondInset * 2 + routedConnectorInsetX;
  totalHeight += diamondInset * 2 + routedConnectorInset;

  // Nodes are emitted generation by generation, left to right, so the
  // document order — and therefore keyboard and screen-reader order — follows
  // the order the family tree is read in.
  const readingOrder = [...nodeIds].sort((a, b) => {
    const posA = positions.get(a);
    const posB = positions.get(b);
    if (!posA || !posB) return 0;
    return posA.y - posB.y || posA.x - posB.x;
  });

  return (
    <div
      className="relative"
      style={{ width: totalWidth, height: totalHeight }}
    >
      <PedigreeEdgeSvg
        connectorData={connectorData}
        color={edgeColor}
        width={totalWidth}
        height={totalHeight}
        offsetX={diamondInset + routedConnectorInsetX}
        offsetY={diamondInset + routedConnectorInset}
        highlightedNodeIds={highlightedNodeIds}
        highlightedEdgeKeys={highlightedEdgeKeys}
      />
      {readingOrder.map((id) => {
        const pos = positions.get(id);
        if (!pos) return null;

        return (
          <div
            key={id}
            className="absolute"
            style={{
              top: pos.y + diamondInset + routedConnectorInset,
              left: pos.x + diamondInset + routedConnectorInsetX,
              width: metrics.containerWidth,
              height: metrics.containerHeight,
            }}
          >
            {renderNode(id)}
          </div>
        );
      })}
    </div>
  );
}
