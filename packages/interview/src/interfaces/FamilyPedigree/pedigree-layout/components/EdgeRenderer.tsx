'use client';

import { type JSX, useMemo } from 'react';

import { dimColor } from '../dimColor';
import type { ConnectorRenderData } from '../pedigreeAdapter';
import type {
  AuxiliaryConnector,
  LineSegment,
  ParentChildConnector,
  ParentGroupConnector,
  PedigreeConnectors,
  Point,
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
  const endpointLines = conn.endpointSegments?.map((segment, endpointIndex) =>
    renderLine(segment, color, `group-endpoint-${idx}-${endpointIndex}`, {
      strokeLinecap: 'round',
    }),
  );

  if (conn.double) {
    return (
      <g key={`consang-${idx}`}>
        {endpointLines}
        {renderLine(conn.segment, color, `consang-line1-${idx}`)}
        {conn.doubleSegment &&
          renderLine(conn.doubleSegment, color, `consang-line2-${idx}`)}
      </g>
    );
  }

  if (!conn.isActive) {
    return (
      <g key={`group-routed-inactive-${idx}`}>
        {endpointLines}
        {renderInactiveGroupLine(conn, idx, color)}
      </g>
    );
  }

  return (
    <g key={`group-routed-${idx}`}>
      {endpointLines}
      {renderLine(conn.segment, color, `group-bar-${idx}`, {
        strokeLinecap: 'round',
      })}
    </g>
  );
}

const SLASH_HEIGHT = 12;
const SLASH_WIDTH = 4;
const SLASH_GAP = 4;
const BREAK_HALF_WIDTH = SLASH_WIDTH + SLASH_GAP / 2;

/**
 * Where the break in a former partnership line goes: its centre and half
 * width. It starts on the side the line prefers (or at its middle) and keeps
 * clear of every line that meets or crosses the partnership line there: the
 * lines of descent leaving it and the auxiliary lines crossing it. When the
 * preferred place is not clear, it goes in the middle of the widest stretch
 * between those lines and the partners' symbols.
 */
export function formerPartnerBreak(conn: ParentGroupConnector): {
  centre: number;
  halfWidth: number;
} {
  const { x1, x2 } = conn.segment;
  const midX = (x1 + x2) / 2;
  const nhw = conn.nodeHalfWidth ?? 0;
  // An end that stops at an adoption bracket is already clear of the symbol.
  const leftNodeEdge = conn.endsAtBracket?.[0] ? x1 : x1 + nhw;
  const rightNodeEdge = conn.endsAtBracket?.[1] ? x2 : x2 - nhw;

  // Start with the preferred side if specified, otherwise center.
  let centre =
    conn.slashSide === 'left'
      ? leftNodeEdge + (midX - leftNodeEdge) / 2
      : conn.slashSide === 'right'
        ? midX + (rightNodeEdge - midX) / 2
        : midX;

  const blocked = [
    ...(conn.descentXPositions ?? []),
    ...(conn.auxiliaryXPositions ?? []),
  ].filter((x) => x > leftNodeEdge && x < rightNodeEdge);
  const clearance = BREAK_HALF_WIDTH + EDGE_WIDTH;
  if (blocked.some((x) => Math.abs(x - centre) < clearance)) {
    // The middle of the widest stretch between the lines and the symbols.
    const stops = [leftNodeEdge, ...blocked, rightNodeEdge].toSorted(
      (a, b) => a - b,
    );
    let widest = { from: leftNodeEdge, to: rightNodeEdge, width: -1 };
    for (let k = 0; k + 1 < stops.length; k++) {
      const width = stops[k + 1]! - stops[k]!;
      if (width > widest.width) {
        widest = { from: stops[k]!, to: stops[k + 1]!, width };
      }
    }
    centre = (widest.from + widest.to) / 2;
  }

  return {
    centre: Math.max(
      leftNodeEdge + BREAK_HALF_WIDTH,
      Math.min(centre, rightNodeEdge - BREAK_HALF_WIDTH),
    ),
    halfWidth: BREAK_HALF_WIDTH,
  };
}

/**
 * A former partnership line: broken by two slashes. With a focal highlight,
 * `shading` draws each part either side of the break in its pieces, and
 * says whether the slashes (and the break they mark) are dimmed.
 */
function renderInactiveGroupLine(
  conn: ParentGroupConnector,
  idx: number,
  color: string,
  shading?: {
    part: (segment: LineSegment, key: string) => JSX.Element;
    slashesDimmed: boolean;
  },
) {
  const { x1, y1, x2, y2 } = conn.segment;
  const midY = (y1 + y2) / 2;
  const { centre: safeCenter } = formerPartnerBreak(conn);
  const part = (segment: LineSegment, key: string) =>
    shading ? shading.part(segment, key) : renderLine(segment, color, key);
  const slashes = (
    <>
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
    </>
  );

  return (
    <g key={`group-bar-inactive-${idx}`}>
      {part(
        {
          type: 'line',
          x1,
          y1,
          x2: safeCenter - BREAK_HALF_WIDTH,
          y2: midY,
        },
        `group-bar-left-${idx}`,
      )}
      {part(
        {
          type: 'line',
          x1: safeCenter + BREAK_HALF_WIDTH,
          y1: midY,
          x2,
          y2,
        },
        `group-bar-right-${idx}`,
      )}
      {shading ? (
        <g {...(shading.slashesDimmed ? DIMMED : {})}>{slashes}</g>
      ) : (
        slashes
      )}
    </g>
  );
}

function getAuxiliaryStyle(edgeType: AuxiliaryConnector['edgeType']) {
  switch (edgeType) {
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

/** The radius of the hop an auxiliary line makes over a line it crosses. */
const HOP_RADIUS = EDGE_WIDTH * 1.6;

/**
 * An auxiliary line's course as an SVG path, hopping over each line it
 * crosses with a half circle (bulging up from a level piece, and to one side
 * of an upright one) so the crossing does not read as a junction.
 */
export function auxiliaryPath(
  conn: Pick<AuxiliaryConnector, 'points' | 'hops'>,
): string {
  const { points, hops = [] } = conn;
  const [first] = points;
  if (!first) return '';
  let d = `M${first.x},${first.y}`;
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]!;
    const b = points[k]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length === 0) continue;
    const ux = (b.x - a.x) / length;
    const uy = (b.y - a.y) / length;
    // The hops on this piece, in order along it, each with room of its own.
    const along = hops
      .filter((hop) => Math.abs((hop.x - a.x) * uy - (hop.y - a.y) * ux) < 0.5)
      .map((hop) => (hop.x - a.x) * ux + (hop.y - a.y) * uy)
      .filter((at) => at > HOP_RADIUS && at < length - HOP_RADIUS)
      .toSorted((p, q) => p - q);
    const sweep = ux > 1e-9 || (Math.abs(ux) <= 1e-9 && uy > 0) ? 1 : 0;
    let reached = 0;
    for (const at of along) {
      if (at - HOP_RADIUS < reached) continue;
      const before = at - HOP_RADIUS;
      const after = at + HOP_RADIUS;
      d += ` L${a.x + ux * before},${a.y + uy * before}`;
      d += ` A${HOP_RADIUS},${HOP_RADIUS} 0 0 ${sweep} ${a.x + ux * after},${a.y + uy * after}`;
      reached = after;
    }
    d += ` L${b.x},${b.y}`;
  }
  return d;
}

function renderAuxiliary(stroke: AuxiliaryStroke, idx: number, color: string) {
  const style = getAuxiliaryStyle(stroke.edgeType);
  // One stroke for each run of pieces, so a dashed line's pattern flows round
  // its corners and hops; where a run starts partway along its line, the
  // pattern carries on from there.
  return (
    <path
      key={`aux-${idx}`}
      d={auxiliaryPath(stroke)}
      fill="none"
      stroke={color}
      strokeWidth={style.strokeWidth}
      {...('strokeDasharray' in style
        ? {
            strokeDasharray: style.strokeDasharray,
            ...(stroke.dashOffset > 0
              ? { strokeDashoffset: stroke.dashOffset }
              : {}),
          }
        : {})}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

/** A run of an auxiliary line's pieces drawn as one stroke: its course and
 * hops, how far along its line it starts, and whether it is lit. */
type AuxiliaryStroke = Pick<
  AuxiliaryConnector,
  'points' | 'hops' | 'edgeType'
> & { dashOffset: number; lit: boolean };

/**
 * The auxiliary lines as strokes, every piece drawn once. Each line is cut
 * wherever a corner or end of any auxiliary line lies on it, so lines that
 * share a course (two lines of one owner before they part, two co-parents'
 * lines after they join) share its pieces. A piece is lit if any line through
 * it is lit, and is drawn by the first line through it of the same shade, so
 * a lit piece is never painted over by a dim one, nor drawn twice.
 */
function auxiliaryStrokes(
  lines: AuxiliaryConnector[],
  lineLit: boolean[],
): AuxiliaryStroke[] {
  const corners = lines.flatMap((aux) => aux.points);
  const dashed = (aux: AuxiliaryConnector) =>
    'strokeDasharray' in getAuxiliaryStyle(aux.edgeType);
  const pieceKey = (aux: AuxiliaryConnector, a: Point, b: Point) => {
    const [p, q] = [pointKey(a), pointKey(b)];
    return `${dashed(aux) ? 'dashed' : 'solid'}|${p < q ? `${p}|${q}` : `${q}|${p}`}`;
  };
  const piecesOf = lines.map((aux) =>
    aux.points.slice(1).flatMap((to, k) => {
      const from = aux.points[k]!;
      const segment: LineSegment = {
        type: 'line',
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
      };
      const ts = [
        0,
        1,
        ...corners
          .map((p) => fractionAlong(p, segment))
          .filter((t): t is number => t !== undefined && t > 0 && t < 1),
      ].toSorted((a, b) => a - b);
      const at = (t: number): Point => ({
        x: from.x + t * (to.x - from.x),
        y: from.y + t * (to.y - from.y),
      });
      return ts.slice(1).flatMap((t, m) => {
        const [a, b] = [at(ts[m]!), at(t)];
        return pointKey(a) === pointKey(b)
          ? []
          : [{ from: a, to: b, key: pieceKey(aux, a, b) }];
      });
    }),
  );
  const pieceLit = new Map<string, boolean>();
  piecesOf.forEach((pieces, i) => {
    for (const { key } of pieces) {
      pieceLit.set(key, (pieceLit.get(key) ?? false) || lineLit[i]!);
    }
  });
  const drawer = new Map<string, number>();
  piecesOf.forEach((pieces, i) => {
    for (const { key } of pieces) {
      if (!drawer.has(key) && lineLit[i] === pieceLit.get(key)) {
        drawer.set(key, i);
      }
    }
  });
  piecesOf.forEach((pieces, i) => {
    for (const { key } of pieces) if (!drawer.has(key)) drawer.set(key, i);
  });

  const strokes: AuxiliaryStroke[] = [];
  piecesOf.forEach((pieces, i) => {
    const aux = lines[i]!;
    const lit = lineLit[i]!;
    let along = 0;
    let run: { points: Point[]; dashOffset: number } | undefined;
    const close = () => {
      if (run) {
        strokes.push({
          points: run.points,
          ...(aux.hops ? { hops: aux.hops } : {}),
          edgeType: aux.edgeType,
          dashOffset: run.dashOffset,
          lit,
        });
      }
      run = undefined;
    };
    for (const { from, to, key } of pieces) {
      if (drawer.get(key) === i) {
        if (run) run.points.push(to);
        else run = { points: [from, to], dashOffset: along };
      } else {
        close();
      }
      along += Math.hypot(to.x - from.x, to.y - from.y);
    }
    close();
  });
  return strokes;
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
  roundCaps = true,
): JSX.Element[] {
  return splitBar(bar, splitXs, isDimmed).map(({ segment, dimmed }, i) => (
    <g key={`${keyPrefix}-${i}`} {...(dimmed ? DIMMED : {})}>
      {renderLine(
        segment,
        dimmed ? dimColor(color) : color,
        `${keyPrefix}-line-${i}`,
        roundCaps ? { strokeLinecap: 'round' } : undefined,
      )}
    </g>
  ));
}

/** A horizontal bar cut at the given x-coordinates, each piece dimmed or not. */
function splitBar(
  bar: LineSegment,
  splitXs: number[],
  isDimmed: (segStart: number, segEnd: number) => boolean,
): { segment: LineSegment; dimmed: boolean }[] {
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

  const pieces: { segment: LineSegment; dimmed: boolean }[] = [];
  for (let i = 0; i < unique.length - 1; i++) {
    const a = unique[i]!;
    const b = unique[i + 1]!;
    pieces.push({
      segment: { type: 'line', x1: a, y1: y, x2: b, y2: y },
      dimmed: isDimmed(a, b),
    });
  }
  return pieces;
}

// ---------------------------------------------------------------------------
// Focal highlighting
//
// Every line that draws a tie between a parent and a child is made of
// pieces: a partnership line and the leads to it, a line of descent (each
// parent's drop, co-parents' level line, the sibling bar, a run's stem and
// sub-bar, each child's line up), and the line of a parent drawn on a line
// of their own (a donor, a surrogate, a social or adoptive parent, a parent
// the family does not name), including the stretch two co-parents' lines
// share once they join. Each tie follows one course through those pieces:
// from the parent, down to the child, never climbing; it enters a line of
// descent where the parent's drop starts or where their own line ends on it.
//
// With a focal highlight, a piece is lit if and only if at least one lit
// tie's course passes through it. Nothing else decides it: not whether the
// line is solid or dashed, nor which kind of line it is, nor which piece.
// A tie is lit when it is one of the highlighted transmissions
// (`highlightedEdgeKeys`); a caller that gives only the highlighted people
// lights a tie between two highlighted people. Twin marks and duplicate arcs
// draw no tie: they light by the people they mark.
// ---------------------------------------------------------------------------

/** A piece of a line, lit or not. */
type Shaded = { segment: LineSegment; lit: boolean };

/** Where the lit ties' courses run, worked out once for the whole drawing. */
type LitCourses = {
  /** Each line of descent's pieces, in drawing order. */
  descent: Shaded[][];
  /** Whether each auxiliary line is lit. */
  auxiliary: boolean[];
  /** For each partnership line: the stretches lit ties run along, and the
   * partners (0 left, 1 right) whose leads they come down. */
  partnership: { stretches: [number, number][]; leads: Set<number> }[];
};

const EPSILON = 1e-6;

const pointKey = (p: Point) =>
  `${String(Math.round(p.x * 1e4))},${String(Math.round(p.y * 1e4))}`;

const startOf = (s: LineSegment): Point => ({ x: s.x1, y: s.y1 });
const endOf = (s: LineSegment): Point => ({ x: s.x2, y: s.y2 });

/** How far along `s` the point `p` lies, from 0 at its start to 1 at its
 * end; undefined when it is not on it. */
function fractionAlong(p: Point, s: LineSegment): number | undefined {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const length = Math.hypot(dx, dy);
  if (length < EPSILON) return undefined;
  if (Math.abs((p.x - s.x1) * dy - (p.y - s.y1) * dx) / length > EPSILON) {
    return undefined;
  }
  const t = ((p.x - s.x1) * dx + (p.y - s.y1) * dy) / (length * length);
  const slack = EPSILON / length;
  return t >= -slack && t <= 1 + slack
    ? Math.min(1, Math.max(0, t))
    : undefined;
}

/** A line of descent's segments, in the order they are drawn: from the
 * parents down, so a dashed line's rhythm starts at the parents' end. */
function descentSegments(conn: ParentChildConnector): LineSegment[] {
  return [
    ...conn.parentLink,
    ...(conn.siblingBar ? [conn.siblingBar] : []),
    ...(conn.runs ?? []).flatMap((run) => [
      run.stem,
      ...(run.bar ? [run.bar] : []),
    ]),
    ...conn.uplines,
  ];
}

/** Whose ties an auxiliary line draws: its owners, one person or a
 * couple. */
const ownersOf = (aux: AuxiliaryConnector): string[] =>
  aux.ownerIds ??
  (aux.endpointIds?.[0] === undefined ? [] : [aux.endpointIds[0]]);

/**
 * Traces every lit tie's course through the drawing and marks the pieces it
 * passes through. The lines of descent are cut wherever another line ends on
 * them, so a course can turn or start there, and joined into one network, so
 * a course can run on from one family's line into another's that continues
 * it (a sibship drawn in two styles). A child's tie is traced from the
 * child up, never down, to the nearest place that parent's ties enter.
 */
function traceLitCourses(
  { parentChildLines, auxiliaryLines, groupLines }: PedigreeConnectors,
  tieLit: (parentId: string, childId: string) => boolean,
): LitCourses {
  type Piece = { from: Point; to: Point; lit: boolean };
  type Step = { to: string; length: number; pieces: Piece[] };

  const ends: Point[] = [
    ...parentChildLines
      .flatMap(descentSegments)
      .flatMap((s) => [startOf(s), endOf(s)]),
    ...auxiliaryLines.flatMap((aux) =>
      [aux.points[0], aux.points.at(-1)].filter(
        (p): p is Point => p !== undefined,
      ),
    ),
  ];
  const points = new Map<string, Point>();
  const steps = new Map<string, Step[]>();
  const piecesBetween = new Map<string, Piece[]>();
  const link = (a: string, step: Step) =>
    steps.set(a, [...(steps.get(a) ?? []), step]);

  const cut = parentChildLines.map((conn) =>
    descentSegments(conn).map((segment) => {
      const ts = [
        0,
        1,
        ...ends
          .map((p) => fractionAlong(p, segment))
          .filter((t): t is number => t !== undefined && t > 0 && t < 1),
      ].toSorted((a, b) => a - b);
      const at = (t: number): Point =>
        t === 0
          ? startOf(segment)
          : t === 1
            ? endOf(segment)
            : {
                x: segment.x1 + t * (segment.x2 - segment.x1),
                y: segment.y1 + t * (segment.y2 - segment.y1),
              };
      const pieces: Piece[] = [];
      let from = at(0);
      for (const t of ts.slice(1)) {
        const to = at(t);
        const [a, b] = [pointKey(from), pointKey(to)];
        if (a === b) continue;
        const piece = { from, to, lit: false };
        pieces.push(piece);
        if (!points.has(a)) points.set(a, from);
        if (!points.has(b)) points.set(b, to);
        // Pieces of two lines that lie on one another are one place: a
        // course through it passes through both.
        const pair = a < b ? `${a}|${b}` : `${b}|${a}`;
        const shared = piecesBetween.get(pair);
        if (shared) {
          shared.push(piece);
        } else {
          const together = [piece];
          piecesBetween.set(pair, together);
          const length = Math.hypot(to.x - from.x, to.y - from.y);
          link(a, { to: b, length, pieces: together });
          link(b, { to: a, length, pieces: together });
        }
        from = to;
      }
      return pieces;
    }),
  );

  // Where each parent's ties enter the lines of descent: the top of the
  // drop that carries them, and the end of each line of their own that
  // ends on a line of descent.
  const entries = new Map<string, Set<string>>();
  const enter = (parentId: string, p: Point) => {
    const key = pointKey(p);
    if (!points.has(key)) return;
    entries.set(parentId, (entries.get(parentId) ?? new Set()).add(key));
  };
  for (const conn of parentChildLines) {
    for (const parentId of conn.parentIds ?? []) {
      const top = conn.parentLink
        .filter(
          (_, k) => conn.parentLinkParentIds?.[k]?.includes(parentId) ?? true,
        )
        .flatMap((s) => [startOf(s), endOf(s)])
        .reduce<Point | undefined>(
          (best, p) => (best === undefined || p.y < best.y ? p : best),
          undefined,
        );
      if (top) enter(parentId, top);
    }
  }
  const linesEndingAt = new Map<string, number[]>();
  auxiliaryLines.forEach((aux, i) => {
    const childId = aux.endpointIds?.[1];
    const end = aux.points.at(-1);
    if (childId !== undefined || !end) return;
    for (const parentId of ownersOf(aux)) {
      enter(parentId, end);
      const key = `${parentId}|${pointKey(end)}`;
      linesEndingAt.set(key, [...(linesEndingAt.get(key) ?? []), i]);
    }
  });

  /** The course from `start` up to the nearest place `parentId`'s ties
   * enter, never going down. */
  const traceUp = (start: Point, parentId: string) => {
    const targets = entries.get(parentId);
    const origin = pointKey(start);
    if (!targets || !points.has(origin)) return undefined;
    const distance = new Map([[origin, 0]]);
    const reachedBy = new Map<string, { from: string; pieces: Piece[] }>();
    const settled = new Set<string>();
    for (;;) {
      let here: string | undefined;
      for (const [key, d] of distance) {
        if (settled.has(key)) continue;
        if (here === undefined || d < distance.get(here)!) here = key;
      }
      if (here === undefined) return undefined;
      if (targets.has(here)) {
        const pieces: Piece[] = [];
        for (let k = here; k !== origin; k = reachedBy.get(k)!.from) {
          pieces.push(...reachedBy.get(k)!.pieces);
        }
        return { pieces, entry: points.get(here)! };
      }
      settled.add(here);
      const y = points.get(here)!.y;
      for (const { to, length, pieces } of steps.get(here) ?? []) {
        if (points.get(to)!.y > y + EPSILON) continue;
        const d = distance.get(here)! + length;
        if (d < (distance.get(to) ?? Infinity)) {
          distance.set(to, d);
          reachedBy.set(to, { from: here, pieces });
        }
      }
    }
  };

  const auxiliary = auxiliaryLines.map(() => false);
  const partnership = groupLines.map(() => ({
    stretches: [] as [number, number][],
    leads: new Set<number>(),
  }));
  /** A lit tie of `parentId`'s entering at `entry`: it came down the line
   * of their own that ends there, or along their partnership line from
   * their end of it. */
  const litFrom = (parentId: string, entry: Point) => {
    for (const i of linesEndingAt.get(`${parentId}|${pointKey(entry)}`) ?? []) {
      auxiliary[i] = true;
    }
    groupLines.forEach((gl, g) => {
      const side = gl.partnerIds?.indexOf(parentId) ?? -1;
      if (side < 0) return;
      const rails = [
        gl.segment,
        ...(gl.doubleSegment ? [gl.doubleSegment] : []),
      ];
      if (!rails.some((rail) => fractionAlong(entry, rail) !== undefined))
        return;
      const [left, right] = [
        Math.min(gl.segment.x1, gl.segment.x2),
        Math.max(gl.segment.x1, gl.segment.x2),
      ];
      const end = side === 0 ? left : right;
      partnership[g]!.stretches.push([
        Math.min(end, entry.x),
        Math.max(end, entry.x),
      ]);
      partnership[g]!.leads.add(side);
    });
  };
  const light = (pieces: Piece[]) => {
    for (const piece of pieces) piece.lit = true;
  };

  // Each child's lit ties, from the child up their line of descent.
  for (const conn of parentChildLines) {
    conn.uplines.forEach((upline, i) => {
      const childId = conn.uplineChildIds?.[i];
      if (childId === undefined) return;
      const child = upline.y1 >= upline.y2 ? startOf(upline) : endOf(upline);
      for (const parentId of entries.keys()) {
        if (!tieLit(parentId, childId)) continue;
        const course = traceUp(child, parentId);
        if (!course) continue;
        light(course.pieces);
        litFrom(parentId, course.entry);
      }
    });
  }
  // Each lit tie drawn on a line of its own, and the stretch of a line of
  // descent or partnership line above where that line leaves it: the line
  // carries the ties of every one of its owners to the child (a couple's
  // line, both partners').
  auxiliaryLines.forEach((aux, i) => {
    const childId = aux.endpointIds?.[1];
    const start = aux.points[0];
    if (childId === undefined || !start) return;
    for (const parentId of ownersOf(aux)) {
      if (!tieLit(parentId, childId)) continue;
      const course = traceUp(start, parentId);
      auxiliary[i] = true;
      light(course?.pieces ?? []);
      litFrom(parentId, course?.entry ?? start);
    }
  });

  // Each segment of a line of descent, its pieces of one shade joined again.
  const descent = cut.map((segments) =>
    segments.flatMap((pieces) => {
      const shaded: Shaded[] = [];
      for (const { from, to, lit } of pieces) {
        const last = shaded.at(-1);
        if (last !== undefined && last.lit === lit) {
          last.segment = { ...last.segment, x2: to.x, y2: to.y };
        } else {
          shaded.push({
            lit,
            segment: {
              type: 'line',
              x1: from.x,
              y1: from.y,
              x2: to.x,
              y2: to.y,
            },
          });
        }
      }
      return shaded;
    }),
  );

  return { descent, auxiliary, partnership };
}

const DIMMED = { 'data-edge-dimmed': 'true' } as const;

/**
 * A partnership line: drawn whole when nothing is highlighted, and
 * otherwise cut at each line of descent leaving it and at each end of a lit
 * stretch, every piece lit or dimmed by the rule above.
 */
function renderPartnershipLine(
  gl: ParentGroupConnector,
  idx: number,
  color: string,
  lit: LitCourses['partnership'][number] | undefined,
): JSX.Element {
  if (!lit) {
    return <g key={`gl-dim-${idx}`}>{renderGroupLine(gl, idx, color)}</g>;
  }
  const litOver = (from: number, to: number) =>
    lit.stretches.some(
      ([start, end]) => start <= from + EPSILON && end >= to - EPSILON,
    );
  const dimmedOver = (from: number, to: number) => !litOver(from, to);
  const splitXs = [...(gl.descentXPositions ?? []), ...lit.stretches.flat()];
  const shade = (isLit: boolean) => (isLit ? color : dimColor(color));

  const leads = gl.endpointSegments?.map((segment, side) => (
    <g
      key={`gl-endpoint-${idx}-${side}`}
      {...(lit.leads.has(side) ? {} : DIMMED)}
    >
      {renderLine(
        segment,
        shade(lit.leads.has(side)),
        `gl-endpoint-line-${idx}-${side}`,
        { strokeLinecap: 'round' },
      )}
    </g>
  ));

  if (!gl.double && !gl.isActive) {
    const { centre } = formerPartnerBreak(gl);
    const breakLit = litOver(
      centre - BREAK_HALF_WIDTH,
      centre + BREAK_HALF_WIDTH,
    );
    return (
      <g key={`gl-dim-${idx}`}>
        {leads}
        {renderInactiveGroupLine(gl, idx, shade(breakLit), {
          part: (part, key) => (
            <g key={key}>
              {renderSplitBar(part, splitXs, dimmedOver, color, key, false)}
            </g>
          ),
          slashesDimmed: !breakLit,
        })}
      </g>
    );
  }

  return (
    <g key={`gl-dim-${idx}`}>
      {leads}
      {renderSplitBar(gl.segment, splitXs, dimmedOver, color, `gl-${idx}`)}
      {/* A consanguineous couple's line is two parallel lines; both are
          cut and lit alike. */}
      {gl.double && gl.doubleSegment
        ? renderSplitBar(
            gl.doubleSegment,
            splitXs,
            dimmedOver,
            color,
            `gl-double-${idx}`,
          )
        : null}
    </g>
  );
}

/**
 * A line of descent, drawn as strokes that each run away from its owners,
 * one shade apiece. A line that runs on (a descent straight down into an
 * only child, say) is one stroke with no seams at its joins. A dashed line
 * differs from a solid one only in its stroke, and keeps one dash rhythm
 * along its whole course however it is shaded: each stroke takes up the
 * pattern where the course from the owners has reached by its start.
 */
function renderParentChild(
  conn: ParentChildConnector,
  idx: number,
  color: string,
  pieces: Shaded[],
) {
  const dashed = conn.edgeType === 'social' || conn.edgeType === 'adoptive';
  const strokes = descentStrokes(pieces);
  return (
    <g key={`pc-${idx}`}>
      {[true, false].map((lit) => {
        const shaded = strokes.filter((stroke) => stroke.lit === lit);
        if (shaded.length === 0) return null;
        const shade = lit ? 'bright' : 'dim';
        return (
          <g key={`pc-${idx}-${shade}`} {...(lit ? {} : DIMMED)}>
            {shaded.map(({ points, reached }, i) => (
              <polyline
                key={`pc-${idx}-${shade}-${i}`}
                points={points.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={lit ? color : dimColor(color)}
                strokeWidth={EDGE_WIDTH}
                {...(dashed
                  ? {
                      strokeDasharray: DASHED_PATTERN,
                      strokeDashoffset: reached,
                    }
                  : {})}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </g>
        );
      })}
    </g>
  );
}

/** One stroke of a line of descent: its points, away from the owners, and
 * how far the course from them has run where it starts. */
type DescentStroke = { points: Point[]; lit: boolean; reached: number };

/**
 * A line of descent's pieces as strokes. The pieces are cut wherever
 * another piece ends on them, so every junction is a point of the network;
 * the course runs from the network's topmost loose ends (the owners' drops)
 * outward, each piece is turned to run away from them, and pieces of one
 * shade that continue each other join one stroke, dropping the points a
 * stroke runs straight through.
 */
function descentStrokes(pieces: Shaded[]): DescentStroke[] {
  const same = (a: Point, b: Point) =>
    Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;
  const ends = (s: LineSegment): [Point, Point] => [
    { x: s.x1, y: s.y1 },
    { x: s.x2, y: s.y2 },
  ];
  const whole = pieces.filter(({ segment: s }) => !same(...ends(s)));
  const cut: { from: Point; to: Point; lit: boolean }[] = whole.flatMap(
    ({ segment, lit }) => {
      const [from, to] = ends(segment);
      const at = whole
        .flatMap((other) => ends(other.segment))
        .map((point) => fractionAlong(point, segment))
        .filter((t): t is number => t !== undefined && t > 1e-9 && t < 1 - 1e-9)
        .toSorted((p, q) => p - q);
      const stops = [0, ...at, 1].filter(
        (t, k, all) => k === 0 || t - all[k - 1]! > 1e-9,
      );
      const point = (t: number) => ({
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
      });
      return stops
        .slice(1)
        .map((t, k) => ({ from: point(stops[k]!), to: point(t), lit }));
    },
  );
  if (cut.length === 0) return [];

  // How far the course has run on reaching each point: from the topmost
  // loose ends, along the pieces, the shortest way.
  const points: Point[] = [];
  const indexOf = (p: Point) => {
    const found = points.findIndex((q) => same(p, q));
    if (found >= 0) return found;
    points.push(p);
    return points.length - 1;
  };
  const edges = cut.map((piece) => ({
    ...piece,
    a: indexOf(piece.from),
    b: indexOf(piece.to),
    length: Math.hypot(piece.to.x - piece.from.x, piece.to.y - piece.from.y),
  }));
  const degree = points.map(
    (_, k) => edges.filter(({ a, b }) => a === k || b === k).length,
  );
  const loose = points.filter((_, k) => degree[k] === 1);
  const top = Math.min(...(loose.length ? loose : points).map((p) => p.y));
  const reached = points.map((p, k) =>
    (loose.length ? degree[k] === 1 : true) && Math.abs(p.y - top) < EPSILON
      ? 0
      : Infinity,
  );
  for (let settled = false; !settled;) {
    settled = true;
    for (const { a, b, length } of edges) {
      if (reached[a]! + length < reached[b]! - EPSILON) {
        reached[b] = reached[a]! + length;
        settled = false;
      } else if (reached[b]! + length < reached[a]! - EPSILON) {
        reached[a] = reached[b]! + length;
        settled = false;
      }
    }
  }

  const away = edges
    .map(({ a, b, lit }) =>
      reached[a]! <= reached[b]! ? { a, b, lit } : { a: b, b: a, lit },
    )
    .toSorted((p, q) => reached[p.a]! - reached[q.a]!);
  const strokes: (DescentStroke & { last: number })[] = [];
  const continued = new Set<number>();
  for (const { a, b, lit } of away) {
    const on = strokes.find(
      (stroke) => stroke.lit === lit && stroke.last === a && !continued.has(a),
    );
    if (on) {
      continued.add(a);
      on.points.push(points[b]!);
      on.last = b;
    } else {
      strokes.push({
        points: [points[a]!, points[b]!],
        lit,
        reached: Number.isFinite(reached[a]) ? reached[a]! : 0,
        last: b,
      });
    }
  }
  return strokes.map(({ points: chain, lit, reached: from }) => ({
    lit,
    reached: from,
    points: chain.filter((point, k) => {
      if (k === 0 || k === chain.length - 1) return true;
      const before = chain[k - 1]!;
      const after = chain[k + 1]!;
      const turn =
        (point.x - before.x) * (after.y - point.y) -
        (point.y - before.y) * (after.x - point.x);
      return Math.abs(turn) > EPSILON;
    }),
  }));
}

/** Identifies a parent→child link in `highlightedEdgeKeys`. */
export function edgeKey(parentId: string, childId: string): string {
  return `${parentId}->${childId}`;
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

    // Twin marks and duplicate arcs mark people rather than draw ties, so
    // they light by the people they mark (below); every line that draws a
    // tie lights by the lit ties whose courses pass through it.
    const courses =
      highlightedNodeIds === undefined && highlightedEdgeKeys === undefined
        ? undefined
        : traceLitCourses(connectors, (parentId, childId) =>
            highlightedEdgeKeys !== undefined
              ? highlightedEdgeKeys.has(edgeKey(parentId, childId))
              : (highlightedNodeIds?.has(parentId) ?? false) &&
                (highlightedNodeIds?.has(childId) ?? false),
          );

    connectors.groupLines.forEach((gl, i) => {
      elements.push(
        renderPartnershipLine(gl, i, color, courses?.partnership[i]),
      );
    });

    connectors.parentChildLines.forEach((conn, i) => {
      elements.push(
        renderParentChild(
          conn,
          i,
          color,
          courses?.descent[i] ??
            descentSegments(conn).map((segment) => ({ segment, lit: true })),
        ),
      );
    });

    // Every piece of the auxiliary lines is drawn once, lit if a lit line
    // passes through it (see `auxiliaryStrokes`).
    auxiliaryStrokes(
      connectors.auxiliaryLines,
      courses?.auxiliary ?? connectors.auxiliaryLines.map(() => true),
    ).forEach((stroke, k) => {
      elements.push(
        <g key={`aux-dim-${k}`} {...(stroke.lit ? {} : DIMMED)}>
          {renderAuxiliary(stroke, k, stroke.lit ? color : dimColor(color))}
        </g>,
      );
    });

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
            fontSize={ti.labelSize ?? 14}
            {...(dimmed ? { 'data-edge-dimmed': 'true' } : {})}
          >
            {/* oxlint-disable-next-line formatjs/no-literal-string-in-jsx -- Nonlinguistic pedigree uncertainty glyph; its meaning is translated in the notation key. */}
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
