import { type JSX, useMemo } from 'react';

import { dimColor } from '../dimColor';
import type { ConnectorRenderData } from '../pedigreeAdapter';
import type {
  AuxiliaryConnector,
  LineSegment,
  ParentChildConnector,
  ParentGroupConnector,
} from '../types';

export const EDGE_WIDTH = 5;
export const DASHED_PATTERN = '8 8';

function renderLine(
  seg: LineSegment,
  color: string,
  key: string,
  extra?: React.SVGAttributes<SVGLineElement>,
) {
  return (
    <line
      key={key}
      x1={seg.x1}
      y1={seg.y1}
      x2={seg.x2}
      y2={seg.y2}
      stroke={color}
      strokeWidth={EDGE_WIDTH}
      {...extra}
    />
  );
}

function renderGroupLine(
  conn: ParentGroupConnector,
  idx: number,
  color: string,
) {
  if (conn.double) {
    return (
      <g key={`consang-${idx}`}>
        {renderLine(conn.segment, color, `consang-line1-${idx}`)}
        {conn.doubleSegment &&
          renderLine(conn.doubleSegment, color, `consang-line2-${idx}`)}
      </g>
    );
  }

  if (!conn.isActive) {
    return renderInactiveGroupLine(conn, idx, color);
  }

  return renderLine(conn.segment, color, `group-bar-${idx}`, {
    strokeLinecap: 'round',
  });
}

function renderInactiveGroupLine(
  conn: ParentGroupConnector,
  idx: number,
  color: string,
) {
  const { x1, y1, x2, y2 } = conn.segment;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  const SLASH_HEIGHT = 12;
  const SLASH_WIDTH = 4;
  const SLASH_GAP = 4;
  const BREAK_HALF_WIDTH = SLASH_WIDTH + SLASH_GAP / 2;

  const nhw = conn.nodeHalfWidth ?? 0;
  const leftNodeEdge = x1 + nhw;
  const rightNodeEdge = x2 - nhw;

  // Start with the preferred side if specified, otherwise center.
  let breakCenterX: number;
  if (conn.slashSide === 'left') {
    breakCenterX = leftNodeEdge + (midX - leftNodeEdge) / 2;
  } else if (conn.slashSide === 'right') {
    breakCenterX = midX + (rightNodeEdge - midX) / 2;
  } else {
    breakCenterX = midX;
  }

  if (conn.descentXPositions?.length) {
    const CLEARANCE = BREAK_HALF_WIDTH + EDGE_WIDTH;
    const tooClose = conn.descentXPositions.some(
      (dx) => Math.abs(dx - breakCenterX) < CLEARANCE,
    );
    if (tooClose) {
      const minDescent = Math.min(...conn.descentXPositions);
      const maxDescent = Math.max(...conn.descentXPositions);

      // Place break equidistant between the descent line and the closest node edge
      const leftGap = minDescent - leftNodeEdge;
      const rightGap = rightNodeEdge - maxDescent;
      if (leftGap > rightGap) {
        breakCenterX = leftNodeEdge + leftGap / 2;
      } else {
        breakCenterX = maxDescent + rightGap / 2;
      }
    }
  }

  const safeCenter = Math.max(
    x1 + nhw + BREAK_HALF_WIDTH,
    Math.min(breakCenterX, x2 - nhw - BREAK_HALF_WIDTH),
  );

  return (
    <g key={`group-bar-inactive-${idx}`}>
      {renderLine(
        {
          type: 'line',
          x1,
          y1,
          x2: safeCenter - BREAK_HALF_WIDTH,
          y2: midY,
        },
        color,
        `group-bar-left-${idx}`,
      )}
      {renderLine(
        {
          type: 'line',
          x1: safeCenter + BREAK_HALF_WIDTH,
          y1: midY,
          x2,
          y2,
        },
        color,
        `group-bar-right-${idx}`,
      )}
      <line
        x1={safeCenter - SLASH_GAP / 2 - SLASH_WIDTH}
        y1={midY + SLASH_HEIGHT / 2}
        x2={safeCenter - SLASH_GAP / 2}
        y2={midY - SLASH_HEIGHT / 2}
        stroke={color}
        strokeWidth={EDGE_WIDTH}
        strokeLinecap="round"
      />
      <line
        x1={safeCenter + SLASH_GAP / 2}
        y1={midY + SLASH_HEIGHT / 2}
        x2={safeCenter + SLASH_GAP / 2 + SLASH_WIDTH}
        y2={midY - SLASH_HEIGHT / 2}
        stroke={color}
        strokeWidth={EDGE_WIDTH}
        strokeLinecap="round"
      />
    </g>
  );
}

function getAuxiliaryStyle(edgeType: AuxiliaryConnector['edgeType']) {
  switch (edgeType) {
    case 'unpartnered-parent':
    case 'social':
    case 'adoptive':
      return { strokeDasharray: DASHED_PATTERN, strokeWidth: EDGE_WIDTH };
    case 'donor':
    case 'surrogate':
    case 'biological':
    // 'partner' is never an auxiliary connector, but the relationship-type
    // union admits it; fall back to a solid line.
    default:
      return { strokeWidth: EDGE_WIDTH };
  }
}

function renderAuxiliary(conn: AuxiliaryConnector, idx: number, color: string) {
  const style = getAuxiliaryStyle(conn.edgeType);
  return renderLine(conn.segment, color, `aux-${idx}`, {
    ...('strokeDasharray' in style
      ? { strokeDasharray: style.strokeDasharray }
      : {}),
    strokeWidth: style.strokeWidth,
    strokeLinecap: 'round',
  });
}

/**
 * Returns true when the descent segment for the given child should be dimmed.
 *
 * When highlightedEdgeKeys is provided, uses edge-key membership so that a
 * contributing descent line is BRIGHT even when the co-parent is excluded from
 * the contributor set (the non-transmitting co-parent case). Falls back to
 * node-membership when highlightedEdgeKeys is absent (non-NarrativePedigree
 * path where neither prop is set).
 */
function isDescentSegmentDimmed(
  parentIds: string[] | undefined,
  childId: string | undefined,
  highlightedNodeIds: Set<string> | undefined,
  highlightedEdgeKeys: Set<string> | undefined,
): boolean {
  if (highlightedNodeIds === undefined && highlightedEdgeKeys === undefined) {
    return false;
  }
  if (highlightedEdgeKeys !== undefined) {
    if (childId === undefined) return false;
    if (parentIds === undefined || parentIds.length === 0) return false;
    return !parentIds.some((pid) =>
      highlightedEdgeKeys.has(`${pid}->${childId}`),
    );
  }
  return isDimmedByIds(
    highlightedNodeIds,
    childId !== undefined ? [childId] : undefined,
  );
}

/**
 * Returns true when the shared sibling-bar / parentLink should be dimmed.
 *
 * With edge keys: bright if ANY family parent→child is in highlightedEdgeKeys.
 * Without edge keys (FamilyPedigree path): falls back to node membership on parentIds.
 */
function isSharedBarDimmed(
  parentIds: string[] | undefined,
  uplineChildIds: (string | undefined)[] | undefined,
  highlightedNodeIds: Set<string> | undefined,
  highlightedEdgeKeys: Set<string> | undefined,
): boolean {
  if (highlightedNodeIds === undefined && highlightedEdgeKeys === undefined) {
    return false;
  }
  if (highlightedEdgeKeys !== undefined) {
    if (parentIds === undefined || parentIds.length === 0) return false;
    if (uplineChildIds === undefined || uplineChildIds.length === 0)
      return false;
    for (const childId of uplineChildIds) {
      if (childId === undefined) continue;
      for (const pid of parentIds) {
        if (highlightedEdgeKeys.has(`${pid}->${childId}`)) return false;
      }
    }
    return true;
  }
  return isDimmedByIds(highlightedNodeIds, parentIds);
}

function renderParentChild(
  conn: ParentChildConnector,
  idx: number,
  color: string,
  highlightedNodeIds?: Set<string>,
  highlightedEdgeKeys?: Set<string>,
) {
  const isDashed = conn.edgeType === 'social' || conn.edgeType === 'adoptive';

  const sharedDimmed = isDashed
    ? isDimmedByIds(highlightedNodeIds, conn.parentIds)
    : isSharedBarDimmed(
        conn.parentIds,
        conn.uplineChildIds,
        highlightedNodeIds,
        highlightedEdgeKeys,
      );

  // For dashed (social/adoptive) edges, combine all segments into a single
  // polyline so the dash pattern flows continuously instead of restarting
  // at each segment boundary.
  if (isDashed) {
    const allSegments = [...conn.parentLink, conn.siblingBar, ...conn.uplines];
    const points = segmentsToPolylinePoints(allSegments);
    const strokeColor = sharedDimmed ? dimColor(color) : color;

    return (
      <g
        key={`pc-${idx}`}
        {...(sharedDimmed ? { 'data-edge-dimmed': 'true' } : {})}
      >
        {points.map((pts, i) => (
          <polyline
            key={`pc-${idx}-path-${i}`}
            points={pts}
            fill="none"
            stroke={strokeColor}
            strokeWidth={EDGE_WIDTH}
            strokeDasharray={DASHED_PATTERN}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </g>
    );
  }

  const sharedColor = sharedDimmed ? dimColor(color) : color;

  return (
    <g key={`pc-${idx}`}>
      {conn.uplines.map((ul, i) => {
        const uplineChildId = conn.uplineChildIds?.[i];
        const uplineDimmed = isDescentSegmentDimmed(
          conn.parentIds,
          uplineChildId,
          highlightedNodeIds,
          highlightedEdgeKeys,
        );
        const uplineColor = uplineDimmed ? dimColor(color) : color;
        return (
          <g
            key={`pc-${idx}-up-wrap-${i}`}
            {...(uplineDimmed ? { 'data-edge-dimmed': 'true' } : {})}
          >
            {renderLine(ul, uplineColor, `pc-${idx}-up-${i}`, {
              strokeLinecap: 'round',
            })}
          </g>
        );
      })}
      <g {...(sharedDimmed ? { 'data-edge-dimmed': 'true' } : {})}>
        {renderLine(conn.siblingBar, sharedColor, `pc-${idx}-bar`, {
          strokeLinecap: 'round',
        })}
        {conn.parentLink.map((pl, i) =>
          renderLine(pl, sharedColor, `pc-${idx}-pl-${i}`, {
            strokeLinecap: 'round',
          }),
        )}
      </g>
    </g>
  );
}

/**
 * Convert an array of line segments into connected polyline point strings.
 * Segments that share endpoints are merged into a single polyline.
 * Returns an array of point strings (one per connected chain).
 */
function segmentsToPolylinePoints(segments: LineSegment[]): string[] {
  if (segments.length === 0) return [];

  const chains: { x: number; y: number }[][] = [];

  for (const seg of segments) {
    // Skip degenerate segments (zero length)
    if (seg.x1 === seg.x2 && seg.y1 === seg.y2) continue;

    const start = { x: seg.x1, y: seg.y1 };
    const end = { x: seg.x2, y: seg.y2 };

    // Try to append to an existing chain
    let merged = false;
    for (const chain of chains) {
      const last = chain[chain.length - 1]!;
      if (last.x === start.x && last.y === start.y) {
        chain.push(end);
        merged = true;
        break;
      }
    }

    if (!merged) {
      chains.push([start, end]);
    }
  }

  return chains.map((chain) => chain.map((p) => `${p.x},${p.y}`).join(' '));
}

type PedigreeEdgeSvgProps = {
  connectorData: ConnectorRenderData | null;
  color: string;
  width: number;
  height: number;
  offsetX?: number;
  offsetY?: number;
  highlightedNodeIds?: Set<string>;
  highlightedEdgeKeys?: Set<string>;
};

function isDimmedByIds(
  highlightedNodeIds: Set<string> | undefined,
  ids: (string | undefined)[] | undefined,
): boolean {
  if (highlightedNodeIds === undefined) return false;
  if (ids === undefined) return false;
  const defined = ids.filter((id): id is string => id !== undefined);
  if (defined.length === 0) return false;
  return !defined.every((id) => highlightedNodeIds.has(id));
}

export function PedigreeEdgeSvg({
  connectorData,
  color,
  width,
  height,
  offsetX = 0,
  offsetY = 0,
  highlightedNodeIds,
  highlightedEdgeKeys,
}: PedigreeEdgeSvgProps) {
  const svgElements = useMemo(() => {
    if (!connectorData) return [];

    const { connectors } = connectorData;
    const elements: JSX.Element[] = [];

    for (let i = 0; i < connectors.groupLines.length; i++) {
      const gl = connectors.groupLines[i]!;
      const dimmed = isDimmedByIds(highlightedNodeIds, gl.partnerIds);
      elements.push(
        <g
          key={`gl-dim-${i}`}
          {...(dimmed ? { 'data-edge-dimmed': 'true' } : {})}
        >
          {renderGroupLine(gl, i, dimmed ? dimColor(color) : color)}
        </g>,
      );
    }

    for (let i = 0; i < connectors.parentChildLines.length; i++) {
      elements.push(
        renderParentChild(
          connectors.parentChildLines[i]!,
          i,
          color,
          highlightedNodeIds,
          highlightedEdgeKeys,
        ),
      );
    }

    for (let i = 0; i < connectors.auxiliaryLines.length; i++) {
      const aux = connectors.auxiliaryLines[i]!;
      const dimmed = isDimmedByIds(highlightedNodeIds, aux.endpointIds);
      elements.push(
        <g
          key={`aux-dim-${i}`}
          {...(dimmed ? { 'data-edge-dimmed': 'true' } : {})}
        >
          {renderAuxiliary(aux, i, dimmed ? dimColor(color) : color)}
        </g>,
      );
    }

    for (let i = 0; i < connectors.twinIndicators.length; i++) {
      const ti = connectors.twinIndicators[i]!;
      if (ti.segment) {
        elements.push(
          renderLine(ti.segment, color, `twin-${i}`, {
            strokeWidth: EDGE_WIDTH / 2,
          }),
        );
      }
      if (ti.label) {
        elements.push(
          <text
            key={`twin-label-${i}`}
            x={ti.label.x}
            y={ti.label.y}
            textAnchor="middle"
            dominantBaseline="central"
            fill={color}
            fontSize={14}
          >
            ?
          </text>,
        );
      }
    }

    for (let i = 0; i < connectors.duplicateArcs.length; i++) {
      const da = connectors.duplicateArcs[i]!;
      const points = da.path.points.map((p) => `${p.x},${p.y}`).join(' ');
      elements.push(
        <polyline
          key={`dup-arc-${i}`}
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={EDGE_WIDTH / 2}
          strokeDasharray={da.path.dashed ? '6 4' : undefined}
        />,
      );
    }

    return elements;
  }, [connectorData, color, highlightedNodeIds, highlightedEdgeKeys]);

  return (
    <svg
      version="1.1"
      xmlns="http://www.w3.org/2000/svg"
      className="absolute top-0 left-0"
      width={width}
      height={height}
      aria-hidden="true"
    >
      {offsetX !== 0 || offsetY !== 0 ? (
        <g transform={`translate(${offsetX},${offsetY})`}>{svgElements}</g>
      ) : (
        svgElements
      )}
    </svg>
  );
}
