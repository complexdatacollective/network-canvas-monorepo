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

/**
 * Splits a horizontal bar into sub-segments at the given x-coordinates and
 * renders each one independently dimmed by `isDimmed`. Sub-segments are wrapped
 * so the existing `data-edge-dimmed` / `dimColor` conventions carry through.
 *
 * `splitXs` need not be sorted or deduped; the bar's own endpoints are always
 * included. A bar with no interior splits renders as a single line, identical
 * to the un-split rendering.
 */
function renderSplitBar(
  bar: LineSegment,
  splitXs: number[],
  isDimmed: (segStart: number, segEnd: number) => boolean,
  color: string,
  keyPrefix: string,
): JSX.Element[] {
  const y = bar.y1;
  const barMin = Math.min(bar.x1, bar.x2);
  const barMax = Math.max(bar.x1, bar.x2);

  const boundaries = [
    barMin,
    barMax,
    ...splitXs.filter((x) => x > barMin && x < barMax),
  ].toSorted((a, b) => a - b);
  const unique = boundaries.filter(
    (x, i) => i === 0 || x !== boundaries[i - 1],
  );

  const pieces: JSX.Element[] = [];
  for (let i = 0; i < unique.length - 1; i++) {
    const a = unique[i]!;
    const b = unique[i + 1]!;
    const dimmed = isDimmed(a, b);
    const segColor = dimmed ? dimColor(color) : color;
    pieces.push(
      <g
        key={`${keyPrefix}-${i}`}
        {...(dimmed ? { 'data-edge-dimmed': 'true' } : {})}
      >
        {renderLine(
          { type: 'line', x1: a, y1: y, x2: b, y2: y },
          segColor,
          `${keyPrefix}-line-${i}`,
          { strokeLinecap: 'round' },
        )}
      </g>,
    );
  }
  return pieces;
}

/**
 * The x where the parents' descent (parentLink) meets a horizontal bar — the
 * endpoint of the descent whose y coincides with the bar. Returns undefined
 * when no descent point sits on the bar's line.
 */
function descentJunctionX(
  parentLink: LineSegment[],
  barY: number,
): number | undefined {
  for (const seg of parentLink) {
    if (seg.y2 === barY) return seg.x2;
    if (seg.y1 === barY) return seg.x1;
  }
  return undefined;
}

/**
 * True when `parentId` transmits an allele to a child that is on the focal
 * lineage — i.e. there is a highlighted parent→child edge out of this parent.
 * `highlightedEdgeKeys` only ever contains on-lineage transmissions, so the
 * focal person itself (walked upward only, never to its own children) has no
 * outgoing highlighted edge and therefore does NOT light its own couple bar.
 */
function transmitsToContributor(
  parentId: string | undefined,
  highlightedEdgeKeys: Set<string> | undefined,
): boolean {
  if (parentId === undefined || highlightedEdgeKeys === undefined) return false;
  const prefix = `${parentId}->`;
  for (const key of highlightedEdgeKeys) {
    if (key.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Renders a couple/parent group bar. When a focal highlight is active and the
 * bar is a plain active partner line with a known descent point, the bar is
 * split at the descent x: each side is bright only when that partner actually
 * transmits to a contributing child (via highlightedEdgeKeys) — so a couple bar
 * is NOT lit merely because one partner is the focal person or is otherwise
 * highlighted. Without edge keys (the FamilyPedigree path) it falls back to
 * partner-node membership. Otherwise (no highlight, inactive break bar, or
 * consanguineous double bar) it falls back to whole-bar rendering dimmed by node
 * membership, exactly as before.
 */
function renderCoupleGroupLine(
  gl: ParentGroupConnector,
  idx: number,
  color: string,
  highlightedNodeIds: Set<string> | undefined,
  highlightedEdgeKeys: Set<string> | undefined,
): JSX.Element {
  const highlightActive =
    highlightedNodeIds !== undefined || highlightedEdgeKeys !== undefined;

  const descentXs = gl.descentXPositions ?? [];
  const splittable =
    highlightActive &&
    gl.isActive &&
    !gl.double &&
    gl.partnerIds !== undefined &&
    descentXs.length > 0;

  if (!splittable || gl.partnerIds === undefined) {
    const dimmed = isDimmedByIds(highlightedNodeIds, gl.partnerIds);
    return (
      <g
        key={`gl-dim-${idx}`}
        {...(dimmed ? { 'data-edge-dimmed': 'true' } : {})}
      >
        {renderGroupLine(gl, idx, dimmed ? dimColor(color) : color)}
      </g>
    );
  }

  const [leftId, rightId] = gl.partnerIds;
  // A couple bar half lights only when that partner transmits to a contributing
  // child (edge-key path). The focal person and non-transmitting partners do not
  // light their couple bar. Fall back to node membership when there are no edge
  // keys (the FamilyPedigree path, which has no focal-contributor feature).
  const leftContributes =
    highlightedEdgeKeys !== undefined
      ? transmitsToContributor(leftId, highlightedEdgeKeys)
      : (highlightedNodeIds?.has(leftId) ?? false);
  const rightContributes =
    highlightedEdgeKeys !== undefined
      ? transmitsToContributor(rightId, highlightedEdgeKeys)
      : (highlightedNodeIds?.has(rightId) ?? false);
  const barCenter = (gl.segment.x1 + gl.segment.x2) / 2;

  // A sub-segment belongs to whichever partner's half it sits in (relative to
  // the bar centre) and is bright when that partner contributes.
  const isHalfDimmed = (segStart: number, segEnd: number): boolean => {
    const mid = (segStart + segEnd) / 2;
    return mid <= barCenter ? !leftContributes : !rightContributes;
  };

  return (
    <g key={`gl-dim-${idx}`}>
      {renderSplitBar(gl.segment, descentXs, isHalfDimmed, color, `gl-${idx}`)}
    </g>
  );
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

  const highlightActive =
    highlightedNodeIds !== undefined || highlightedEdgeKeys !== undefined;

  // Sibling-bar split points: the descent junction plus each child's upline
  // junction. Each upline carries its child id, so the bar is lit only along
  // the descent → contributing-child path and dimmed toward non-contributors.
  const barY = conn.siblingBar.y1;
  const descentX = descentJunctionX(conn.parentLink, barY);
  const uplineJunctions = conn.uplines.map((ul, i) => ({
    x: ul.y2 === barY ? ul.x2 : ul.x1,
    childId: conn.uplineChildIds?.[i],
  }));

  // The sibling bar lights toward a child only when one of THESE parents
  // actually transmits to it — i.e. there is a highlighted parent→child edge,
  // the same predicate the descent and uplines use. Keying off node membership
  // instead would light the bar toward any highlighted child even when its
  // highlight came from elsewhere (e.g. a relative flagged by a downward-derived
  // status whose own parents do not contribute), leaving the bar lit while the
  // links above it stay dim. Falls back to node membership when there are no
  // edge keys (the FamilyPedigree path).
  const childContributes = (childId: string | undefined): boolean => {
    if (childId === undefined) return false;
    if (highlightedEdgeKeys !== undefined) {
      return (conn.parentIds ?? []).some((parentId) =>
        highlightedEdgeKeys.has(`${parentId}->${childId}`),
      );
    }
    return highlightedNodeIds?.has(childId) ?? false;
  };

  // The descent splits the bar into two sides. On each side the bar is bright
  // from the descent out to the FARTHEST contributing child's upline; beyond
  // that it is dimmed only when a non-contributing sibling pulls the bar
  // further out in that direction. A stub leading to no sibling stays bright.
  const sideReach = (
    onSide: (x: number) => boolean,
    pickFar: 'min' | 'max',
  ) => {
    let contributingReach: number | undefined;
    let hasNonContributing = false;
    for (const { x, childId } of uplineJunctions) {
      if (descentX === undefined || !onSide(x)) continue;
      if (childContributes(childId)) {
        contributingReach =
          contributingReach === undefined
            ? x
            : pickFar === 'min'
              ? Math.min(contributingReach, x)
              : Math.max(contributingReach, x);
      } else {
        hasNonContributing = true;
      }
    }
    return { contributingReach, hasNonContributing };
  };

  const isBarSubSegmentDimmed = (segStart: number, segEnd: number): boolean => {
    // No derivable descent → fall back to the family-level shared dim.
    if (descentX === undefined) return sharedDimmed;
    const mid = (segStart + segEnd) / 2;
    if (mid < descentX) {
      const { contributingReach, hasNonContributing } = sideReach(
        (x) => x < descentX,
        'min',
      );
      const reach = contributingReach ?? descentX;
      if (segStart >= reach) return false; // within contributing reach
      return hasNonContributing; // beyond reach: dim only toward a sibling
    }
    const { contributingReach, hasNonContributing } = sideReach(
      (x) => x > descentX,
      'max',
    );
    const reach = contributingReach ?? descentX;
    if (segEnd <= reach) return false;
    return hasNonContributing;
  };

  const splitXs = descentX !== undefined ? [descentX] : [];
  for (const { x } of uplineJunctions) splitXs.push(x);

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
      {highlightActive ? (
        renderSplitBar(
          conn.siblingBar,
          splitXs,
          isBarSubSegmentDimmed,
          color,
          `pc-${idx}-bar`,
        )
      ) : (
        <g>
          {renderLine(conn.siblingBar, sharedColor, `pc-${idx}-bar`, {
            strokeLinecap: 'round',
          })}
        </g>
      )}
      <g {...(sharedDimmed ? { 'data-edge-dimmed': 'true' } : {})}>
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
      elements.push(
        renderCoupleGroupLine(
          gl,
          i,
          color,
          highlightedNodeIds,
          highlightedEdgeKeys,
        ),
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
      // Twin bars are decorative-genetic, not lineage, so they dim by node
      // membership: bright unless BOTH joined twins are highlighted.
      const dimmed = isDimmedByIds(highlightedNodeIds, ti.twinIds);
      const twinColor = dimmed ? dimColor(color) : color;
      if (ti.segment) {
        elements.push(
          <g
            key={`twin-dim-${i}`}
            {...(dimmed ? { 'data-edge-dimmed': 'true' } : {})}
          >
            {renderLine(ti.segment, twinColor, `twin-${i}`, {
              strokeWidth: EDGE_WIDTH / 2,
            })}
          </g>,
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
            fill={twinColor}
            fontSize={14}
            {...(dimmed ? { 'data-edge-dimmed': 'true' } : {})}
          >
            ?
          </text>,
        );
      }
    }

    for (let i = 0; i < connectors.duplicateArcs.length; i++) {
      const da = connectors.duplicateArcs[i]!;
      const points = da.path.points.map((p) => `${p.x},${p.y}`).join(' ');
      // A duplicate arc joins two rendered positions of the same person, so it
      // dims by node membership: bright unless that person is highlighted.
      const dimmed = isDimmedByIds(
        highlightedNodeIds,
        da.personId !== undefined ? [da.personId] : undefined,
      );
      elements.push(
        <polyline
          key={`dup-arc-${i}`}
          points={points}
          fill="none"
          stroke={dimmed ? dimColor(color) : color}
          strokeWidth={EDGE_WIDTH / 2}
          strokeDasharray={da.path.dashed ? '6 4' : undefined}
          {...(dimmed ? { 'data-edge-dimmed': 'true' } : {})}
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
