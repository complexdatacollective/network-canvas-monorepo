/**
 * What a reader of the drawing sees where lines end on one person, measured
 * on the drawing as PersonNode draws the symbols: the faults oracles of the
 * drawn connectors look for.
 */
import type {
  LineSegment,
  PedigreeConnectors,
  PedigreeSymbolShape,
  Point,
} from '../types';

/** How close two lines may end on one child's edge, and how close to the
 * child's own line of descent, as fractions of the symbol. */
export const MIN_END_GAP = 0.2;
export const CENTRE_CLEARANCE = 0.15;
/** How close two lines may run beside each other. */
const LINE_CLEARANCE = 0.25;

export type Drawing = {
  size: number;
  connectors: PedigreeConnectors;
  centre: (id: string) => Point;
  shapeOf: (id: string) => PedigreeSymbolShape;
};

/** Whether a point lies inside a person's symbol as PersonNode draws it. */
function insideSymbol(
  p: Point,
  c: Point,
  size: number,
  shape: PedigreeSymbolShape,
): boolean {
  const dx = Math.abs(p.x - c.x);
  const dy = Math.abs(p.y - c.y);
  const half = size / 2;
  if (shape === 'circle') return Math.hypot(dx, dy) < half;
  if (shape === 'diamond') return dx + dy < half * 0.85 * Math.SQRT2;
  const radius = size * 0.25;
  if (dx >= half || dy >= half) return false;
  const cx = dx - (half - radius);
  const cy = dy - (half - radius);
  return cx <= 0 || cy <= 0 || Math.hypot(cx, cy) < radius;
}

const segmentsOf = (points: Point[]): LineSegment[] =>
  points.slice(1).map((p, k) => ({
    type: 'line',
    x1: points[k]!.x,
    y1: points[k]!.y,
    x2: p.x,
    y2: p.y,
  }));

/** Where a course first meets the child's symbol: the visible end. */
function visibleEnd(points: Point[], drawing: Drawing, childId: string) {
  const c = drawing.centre(childId);
  const shape = drawing.shapeOf(childId);
  for (const s of segmentsOf(points)) {
    const steps = Math.ceil(Math.hypot(s.x2 - s.x1, s.y2 - s.y1) * 4);
    for (let k = 0; k <= steps; k++) {
      const p = {
        x: s.x1 + ((s.x2 - s.x1) * k) / steps,
        y: s.y1 + ((s.y2 - s.y1) * k) / steps,
      };
      if (insideSymbol(p, c, drawing.size, shape)) return p;
    }
  }
  throw new Error(`a line into ${childId} never reaches them`);
}

function distanceToSegment(p: Point, s: LineSegment): number {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const length2 = dx * dx + dy * dy;
  const t =
    length2 === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p.x - s.x1) * dx + (p.y - s.y1) * dy) / length2),
        );
  return Math.hypot(p.x - (s.x1 + t * dx), p.y - (s.y1 + t * dy));
}

const near = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) < 0.5;

/** How many points at the ends of two courses are the same: where two
 * lines are drawn as one. */
function sharedTail(a: Point[], b: Point[]): number {
  let k = 0;
  while (
    k < Math.min(a.length, b.length) &&
    near(a[a.length - 1 - k]!, b[b.length - 1 - k]!)
  ) {
    k++;
  }
  return k;
}

/**
 * Whether a hop on a social parent's line (from `parentX`) into a child is
 * the one crossing the drawing cannot avoid: over an upright piece of another
 * family's line of descent, which comes down from a point on the parents'
 * rows between the parent and the child (as the line from a social parent
 * on the far side of their own partner crosses the line of descent from
 * that couple to their child).
 */
function isUnavoidableHop(
  drawing: Drawing,
  parentX: number,
  childId: string,
  hop: Point,
): boolean {
  const childX = drawing.centre(childId).x;
  const [from, to] = [Math.min(parentX, childX), Math.max(parentX, childX)];
  if (hop.x <= from + 0.5 || hop.x >= to - 0.5) return false;
  return drawing.connectors.parentChildLines.some((line) => {
    if (line.uplineChildIds?.includes(childId)) return false;
    const top = line.parentLink[0];
    if (!top) return false;
    const topX = upperEnd(top).x;
    if (topX <= from + 0.5 || topX >= to - 0.5) return false;
    return [...line.parentLink, ...line.uplines].some(
      (piece) =>
        isUpright(piece) &&
        !isLevel(piece) &&
        distanceToSegment(hop, piece) < ON_LINE,
    );
  });
}

/**
 * Everything wrong with the lines that end on one child: their ends on one
 * edge of the child out of their parents' left-to-right order, a crossing among them or over another
 * line (but for one hop by a social parent's line that the drawing cannot
 * avoid: see `isUnavoidableHop`),
 * two ends closer than a fifth of a symbol (or an end within the
 * centre clearance of the child's own line of descent), and two lines
 * closer than a quarter of a symbol away from the child.
 *
 * Two lines drawn as one from a point on (two co-parents' lines joined
 * before the child) are one line here, from between their parents; each
 * must start at its own parent's centre and leave their symbol straight
 * down, so neither starts from a point between the two.
 */
export function faultsOfLinesInto(drawing: Drawing, childId: string): string[] {
  const { connectors, size } = drawing;
  const child = drawing.centre(childId);
  const faults: string[] = [];
  const into = connectors.auxiliaryLines.filter(
    (line) => line.endpointIds?.[1] === childId,
  );
  // The lines drawn as one: those that share at least their last piece.
  const groups: (typeof into)[] = [];
  for (const line of into) {
    const group = groups.find((members) =>
      members.some((other) => sharedTail(other.points, line.points) >= 2),
    );
    if (group) group.push(line);
    else groups.push([line]);
  }
  const lines = groups.map((members) => {
    const parentIds = members.map((line) => line.endpointIds?.[0] ?? '');
    const [first] = members;
    if (members.length > 1) {
      for (const line of members) {
        const id = line.endpointIds?.[0] ?? '';
        const [start, next] = line.points;
        const centre = drawing.centre(id);
        if (
          !start ||
          !next ||
          !near(start, centre) ||
          Math.abs(next.x - start.x) > 0.5 ||
          next.y <= start.y
        ) {
          faults.push(
            `${id}'s ${line.edgeType} line does not come straight down from ${id}'s symbol before it joins`,
          );
        }
      }
    }
    const hops = members
      .flatMap((line) => line.hops ?? [])
      .filter(
        (hop, k, all) => all.findIndex((other) => near(other, hop)) === k,
      );
    return {
      name:
        members.length > 1
          ? `the joined ${first!.edgeType} line of ${parentIds.join(' and ')}`
          : `${parentIds[0]}'s ${first!.edgeType} line`,
      edgeType: first!.edgeType,
      parentX:
        members.reduce((sum, line) => sum + line.points[0]!.x, 0) /
        members.length,
      end: visibleEnd(first!.points, drawing, childId),
      segments: members.flatMap((line) => segmentsOf(line.points)),
      hops,
    };
  });
  const descent = connectors.parentChildLines.find((line) =>
    line.uplineChildIds?.includes(childId),
  );
  const ends: { name: string; parentX: number; end: Point }[] = [...lines];
  let descentEnd: Point | undefined;
  if (descent && descent.parentLink.length > 0) {
    const parents = (descent.parentIds ?? []).map(drawing.centre);
    descentEnd = { x: child.x, y: child.y - size / 2 };
    ends.push({
      name: 'the line of descent',
      parentX: parents.reduce((sum, p) => sum + p.x, 0) / parents.length,
      end: descentEnd,
    });
  }

  // The ends on each edge of the child keep their parents' order: those on
  // the top edge (the line of descent's among them), and those of the lines
  // that come up into the child's bottom edge from below the row (from a
  // relative on the child's own row). A line into one edge never meets a
  // line into the other.
  for (const onTop of [true, false]) {
    const byParent = ends
      .filter((end) => end.end.y < child.y === onTop)
      .toSorted((a, b) => a.parentX - b.parentX);
    for (let k = 0; k + 1 < byParent.length; k++) {
      const [a, b] = [byParent[k]!, byParent[k + 1]!];
      if (b.parentX - a.parentX > 1 && b.end.x <= a.end.x) {
        faults.push(`${b.name} ends left of ${a.name}`);
      }
    }
  }
  // The one hop accepted is a social parent's line over another family's
  // line of descent (Josh, 12 Oct 2026): any other line's hop is a fault.
  for (const line of lines) {
    const unavoidable =
      line.edgeType === 'social'
        ? line.hops.filter((hop) =>
            isUnavoidableHop(drawing, line.parentX, childId, hop),
          )
        : [];
    if (line.hops.length > (unavoidable.length > 0 ? 1 : 0)) {
      faults.push(`${line.name} crosses a line`);
    }
  }
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const [a, b] = [lines[i]!, lines[j]!];
      const gap = Math.hypot(a.end.x - b.end.x, a.end.y - b.end.y);
      if (gap < MIN_END_GAP * size - 0.25) {
        faults.push(
          `${a.name} and ${b.name} end ${(gap / size).toFixed(2)} of a symbol apart`,
        );
      }
      // Outside the child's symbol the two lines keep a quarter of a symbol
      // between them, but for the short stretch where they meet the child
      // (their ends are only a fifth apart): two lines nearly parallel over
      // a longer stretch read as one.
      const shape = drawing.shapeOf(childId);
      let closeRun = 0;
      for (const s of a.segments) {
        const length = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
        const steps = Math.ceil(length * 2);
        for (let k = 0; k < steps; k++) {
          const p = {
            x: s.x1 + ((s.x2 - s.x1) * (k + 0.5)) / steps,
            y: s.y1 + ((s.y2 - s.y1) * (k + 0.5)) / steps,
          };
          if (insideSymbol(p, child, size, shape)) continue;
          const apart = Math.min(
            ...b.segments.map((t) => distanceToSegment(p, t)),
          );
          // With the end gaps' allowance: two lines exactly a quarter of a
          // symbol apart are clear of each other.
          if (apart < LINE_CLEARANCE * size - 0.25) closeRun += length / steps;
        }
      }
      if (closeRun > LINE_CLEARANCE * size) {
        faults.push(
          `${a.name} runs within a quarter of a symbol of ${b.name} for ${(closeRun / size).toFixed(2)} of a symbol`,
        );
      }
    }
  }
  if (descentEnd) {
    for (const line of lines) {
      const gap = Math.hypot(
        line.end.x - descentEnd.x,
        line.end.y - descentEnd.y,
      );
      if (gap < CENTRE_CLEARANCE * size - 0.25) {
        faults.push(
          `${line.name} ends ${(gap / size).toFixed(2)} of a symbol from the line of descent`,
        );
      }
    }
  }
  return faults;
}

/** A donor's or surrogate's recorded tie to a child. */
export type HelperTie = {
  parent: string;
  child: string;
  kind: 'donor' | 'surrogate';
};

type DescentPiece = { segment: LineSegment; child?: string };

/** Every piece of the lines of descent as drawn: the lines from the
 * parents, the sibling bars, the runs' stems and sub-bars, and each child's
 * line up, with the child it reaches. */
function descentPieces(connectors: PedigreeConnectors): DescentPiece[] {
  return connectors.parentChildLines.flatMap((line) => [
    ...line.parentLink.map((segment) => ({ segment })),
    ...(line.siblingBar ? [{ segment: line.siblingBar }] : []),
    ...(line.runs ?? []).flatMap((run) => [
      { segment: run.stem },
      ...(run.bar ? [{ segment: run.bar }] : []),
    ]),
    ...line.uplines.map((segment, k) => ({
      segment,
      child: line.uplineChildIds?.[k],
    })),
  ]);
}

const isLevel = (s: LineSegment) => Math.abs(s.y1 - s.y2) < 0.5;
const isUpright = (s: LineSegment) => Math.abs(s.x1 - s.x2) < 0.5;
const lowerEnd = (s: LineSegment): Point =>
  s.y1 >= s.y2 ? { x: s.x1, y: s.y1 } : { x: s.x2, y: s.y2 };
const upperEnd = (s: LineSegment): Point =>
  s.y1 >= s.y2 ? { x: s.x2, y: s.y2 } : { x: s.x1, y: s.y1 };
const ON_LINE = 0.75;

/**
 * The children a line reaches: the child it ends on, or, where it ends on a
 * line of descent, everyone that line leads down to from that point, as a
 * reader follows it: along a bar either way, and down a stem or a line up.
 */
export function childrenReachedBy(
  connectors: PedigreeConnectors,
  line: PedigreeConnectors['auxiliaryLines'][number],
): Set<string> {
  const child = line.endpointIds?.[1];
  if (child !== undefined) return new Set([child]);
  const pieces = descentPieces(connectors);
  const start = line.points.at(-1)!;
  const reached = new Set<string>();
  const entered = new Map<number, number>();
  const queue = pieces.flatMap((piece, k) =>
    distanceToSegment(start, piece.segment) < ON_LINE
      ? [{ piece: k, at: start }]
      : [],
  );
  while (queue.length > 0) {
    const { piece, at } = queue.pop()!;
    const { segment, child: upTo } = pieces[piece]!;
    // A piece entered higher up already reaches everything below.
    const before = entered.get(piece);
    if (before !== undefined && before <= at.y + 1e-6) continue;
    entered.set(piece, at.y);
    const low = lowerEnd(segment);
    const reach: LineSegment = isLevel(segment)
      ? segment
      : { type: 'line', x1: at.x, y1: at.y, x2: low.x, y2: low.y };
    if (upTo !== undefined && !isLevel(segment)) reached.add(upTo);
    pieces.forEach((other, k) => {
      if (k === piece) return;
      const entries = isLevel(other.segment)
        ? [
            { x: other.segment.x1, y: other.segment.y1 },
            { x: other.segment.x2, y: other.segment.y2 },
            // A stem or line up ending part way along a bar.
            ...(isLevel(segment) ||
            distanceToSegment(low, other.segment) >= ON_LINE
              ? []
              : [low]),
          ]
        : [upperEnd(other.segment)];
      for (const entry of entries) {
        if (distanceToSegment(entry, reach) < ON_LINE) {
          queue.push({ piece: k, at: entry });
          break;
        }
      }
    });
  }
  return reached;
}

/** Each child's siblings, the child among them: the children of the same
 * parents on the same row, left to right. */
function siblingsOf(drawing: Drawing, childId: string): string[] {
  const keyOf = (line: PedigreeConnectors['parentChildLines'][number]) =>
    (line.parentIds ?? []).toSorted().join(',');
  const own = drawing.connectors.parentChildLines.find((line) =>
    line.uplineChildIds?.includes(childId),
  );
  if (!own) return [childId];
  const row = drawing.centre(childId).y;
  return [
    ...new Set(
      drawing.connectors.parentChildLines
        .filter((line) => keyOf(line) === keyOf(own))
        .flatMap((line) => line.uplineChildIds ?? [])
        .filter(
          (id): id is string =>
            id !== undefined && Math.abs(drawing.centre(id).y - row) < 0.5,
        ),
    ),
  ].toSorted((a, b) => drawing.centre(a).x - drawing.centre(b).x);
}

/**
 * Everything wrong with the donors' and surrogates' lines into sibships,
 * under the rule that a donor's line meets the line of descent of exactly
 * the children they gave to: a line reaching someone they did not give to,
 * a child they gave to reached by no line or by two, two children side by
 * side reached by separate lines; a line to some of a sibship that does not
 * end on the stem of their run (or a lone child's line up) below the
 * sibling bar and above the sub-bar (or the child), in a T (from the outer
 * side, for a run at one end of its sibship, unless the donor holds
 * another tie into it); a line to all of a sibship that does not end on its
 * bar; a crossing, but for one hop over the sibling bar by the line to a
 * run with siblings on both sides, or one hop over the sibship's line of
 * descent by a donor who holds another tie into it; two lines ending on one stem closer
 * than a fifth of a symbol; and a line passing through someone or running
 * within a quarter of a symbol of a line of descent away from its ends and
 * its hop.
 */
export function faultsOfHelperLines(
  drawing: Drawing,
  ties: HelperTie[],
  people: string[],
): string[] {
  const { connectors, size } = drawing;
  const faults: string[] = [];
  const pieces = descentPieces(connectors);
  const groups = new Map<string, HelperTie[]>();
  for (const tie of ties) {
    const key = `${tie.parent}|${tie.kind}`;
    groups.set(key, [...(groups.get(key) ?? []), tie]);
  }
  const stemEnds: { name: string; end: Point; stem: LineSegment }[] = [];
  const insideSomeone = (p: Point, except: (string | undefined)[]) =>
    people.some((id) => {
      if (except.includes(id)) return false;
      const c = drawing.centre(id);
      return Math.abs(p.x - c.x) < size / 2 && Math.abs(p.y - c.y) < size / 2;
    });
  for (const group of groups.values()) {
    const { parent, kind } = group[0]!;
    const given = new Set(group.map((tie) => tie.child));
    const lines = connectors.auxiliaryLines.filter(
      (line) => line.endpointIds?.[0] === parent && line.edgeType === kind,
    );
    const name = `${parent}'s ${kind} line`;
    const reachedBy = lines.map((line) => childrenReachedBy(connectors, line));
    lines.forEach((line, index) => {
      const reached = reachedBy[index]!;
      if (reached.size === 0) faults.push(`${name} reaches no one`);
      for (const child of reached) {
        if (!given.has(child)) faults.push(`${name} reaches ${child}`);
      }
      const end = line.points.at(-1)!;
      const [first] = [...reached];
      if (first === undefined) return;
      const siblings = siblingsOf(drawing, first);
      const toChild = line.endpointIds?.[1] !== undefined;
      const toAll =
        siblings.length > 1 && siblings.every((id) => reached.has(id));
      // The sibling bar, or for a sibship of twins, who hang from one point
      // and have none, that point.
      const bars = connectors.parentChildLines.flatMap((pc) => {
        if (!pc.uplineChildIds?.some((id) => reached.has(id!))) return [];
        if (pc.siblingBar) return [pc.siblingBar];
        const tops = pc.uplines.map(upperEnd);
        return tops.length > 1 &&
          tops.every(
            (p) => Math.hypot(p.x - tops[0]!.x, p.y - tops[0]!.y) < 0.5,
          )
          ? [
              {
                type: 'line',
                x1: tops[0]!.x,
                y1: tops[0]!.y,
                x2: tops[0]!.x,
                y2: tops[0]!.y,
              } satisfies LineSegment,
            ]
          : [];
      });
      const barY = bars[0]?.y1;
      // A donor who also holds another tie into the sibship (raising
      // another of the children, say) sits wherever all their lines cross
      // least, so their donor's line may come in from inside the sibship,
      // hopping one line of descent on the way.
      const secondTie =
        connectors.auxiliaryLines.some(
          (other) =>
            other.endpointIds?.[0] === parent &&
            other.edgeType !== kind &&
            siblings.includes(other.endpointIds[1] ?? ''),
        ) ||
        connectors.parentChildLines.some(
          (pc) =>
            pc.parentIds?.includes(parent) &&
            pc.uplineChildIds?.some((id) => siblings.includes(id ?? '')),
        );
      if (siblings.length > 1 && toChild) {
        faults.push(`${name} ends on ${first}, not on their line of descent`);
      } else if (toAll) {
        if (!bars.some((bar) => distanceToSegment(end, bar) < ON_LINE)) {
          faults.push(`${name} does not end on the sibling bar`);
        }
      } else if (!toChild && barY !== undefined) {
        // On a run's stem, or a lone child's line up.
        const stem = pieces.find(
          (piece) =>
            !isLevel(piece.segment) &&
            isUpright(piece.segment) &&
            distanceToSegment(end, piece.segment) < ON_LINE,
        )?.segment;
        const reachedTops = [...reached].map((id) => {
          const upline = pieces.find((piece) => piece.child === id)!.segment;
          return reached.size > 1
            ? upperEnd(upline).y
            : drawing.centre(id).y - size / 2;
        });
        const lowest = Math.min(...reachedTops);
        if (!stem) {
          faults.push(`${name} does not end on a stem`);
        } else {
          stemEnds.push({ name, end, stem });
          // Clear of the bar the stem hangs from (the sibling bar, or the
          // sub-bar of the run it is inside) and of the run below.
          const above = Math.max(barY, upperEnd(stem).y);
          if (end.y < above + 0.1 * size || end.y > lowest - 0.1 * size) {
            faults.push(
              `${name} ends ${((end.y - above) / size).toFixed(2)} of a symbol below the bar above it, not clear of it and the run`,
            );
          }
          const from = line.points.at(-2)!;
          if (
            Math.abs(from.y - end.y) > 0.5 ||
            Math.abs(from.x - end.x) < 0.15 * size
          ) {
            faults.push(`${name} does not meet the stem in a T`);
          }
          // A run at one end of its sibship is met from that end's side, so
          // the line never comes in under the sibling bar.
          const xs = [...reached].map((id) => drawing.centre(id).x);
          const others = siblings
            .filter((id) => !reached.has(id))
            .map((id) => drawing.centre(id).x);
          const outerSide = !others.some((x) => x < Math.min(...xs))
            ? -1
            : !others.some((x) => x > Math.max(...xs))
              ? 1
              : 0;
          if (
            !secondTie &&
            outerSide !== 0 &&
            Math.sign(from.x - end.x) !== outerSide
          ) {
            faults.push(`${name} meets the stem from inside the sibship`);
          }
        }
      }
      // Hops: only one, over the sibling bar, by a line to a middle run, or
      // over the sibship's line of descent, by a donor with another tie
      // into it.
      const hops = line.hops ?? [];
      const xs = [...reached].map((id) => drawing.centre(id).x);
      const others = siblings
        .filter((id) => !reached.has(id))
        .map((id) => drawing.centre(id).x);
      const middle =
        others.some((x) => x < Math.min(...xs)) &&
        others.some((x) => x > Math.max(...xs));
      const allowedHop =
        hops.length === 1 &&
        ((middle &&
          bars.some((bar) => distanceToSegment(hops[0]!, bar) < ON_LINE)) ||
          (secondTie &&
            descentPieces({
              ...connectors,
              parentChildLines: connectors.parentChildLines.filter((pc) =>
                pc.uplineChildIds?.some((id) => siblings.includes(id ?? '')),
              ),
            }).some(
              (piece) => distanceToSegment(hops[0]!, piece.segment) < ON_LINE,
            )));
      if (hops.length > 0 && !allowedHop) {
        faults.push(`${name} crosses a line`);
      }
      // Clear of everyone, and of the lines of descent (a line into a child
      // is checked against the child's line up by `faultsOfLinesInto`).
      let closeRun = 0;
      for (const s of segmentsOf(line.points)) {
        const length = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
        const steps = Math.ceil(length * 2);
        for (let k = 0; k < steps; k++) {
          const p = {
            x: s.x1 + ((s.x2 - s.x1) * (k + 0.5)) / steps,
            y: s.y1 + ((s.y2 - s.y1) * (k + 0.5)) / steps,
          };
          if (insideSomeone(p, [])) {
            if (insideSomeone(p, [parent, line.endpointIds?.[1]])) {
              faults.push(`${name} passes through someone`);
            }
            continue;
          }
          const nearEnd =
            Math.hypot(p.x - end.x, p.y - end.y) < 0.3 * size ||
            hops.some((h) => Math.hypot(p.x - h.x, p.y - h.y) < 0.3 * size);
          if (nearEnd || toChild) continue;
          const apart = Math.min(
            ...pieces.map((piece) => distanceToSegment(p, piece.segment)),
          );
          if (apart < LINE_CLEARANCE * size) closeRun += length / steps;
        }
      }
      if (closeRun > LINE_CLEARANCE * size) {
        faults.push(
          `${name} runs within a quarter of a symbol of a line of descent for ${(closeRun / size).toFixed(2)} of a symbol`,
        );
      }
    });
    for (const child of given) {
      const count = reachedBy.filter((reached) => reached.has(child)).length;
      if (count === 0) faults.push(`${name} does not reach ${child}`);
      if (count > 1) faults.push(`${name} reaches ${child} more than once`);
    }
    // Children side by side are reached by one line.
    const seen = new Set<string>();
    for (const child of given) {
      if (seen.has(child)) continue;
      const siblings = siblingsOf(drawing, child);
      for (const id of siblings) seen.add(id);
      for (let k = 0; k + 1 < siblings.length; k++) {
        const [a, b] = [siblings[k]!, siblings[k + 1]!];
        if (!given.has(a) || !given.has(b)) continue;
        const lineOf = (id: string) =>
          reachedBy.findIndex((reached) => reached.has(id));
        if (lineOf(a) !== lineOf(b)) {
          faults.push(`${name} reaches ${a} and ${b}, side by side, apart`);
        }
      }
    }
  }
  for (let i = 0; i < stemEnds.length; i++) {
    for (let j = i + 1; j < stemEnds.length; j++) {
      const [a, b] = [stemEnds[i]!, stemEnds[j]!];
      if (a.stem !== b.stem) continue;
      const gap = Math.hypot(a.end.x - b.end.x, a.end.y - b.end.y);
      if (gap < MIN_END_GAP * size - 0.25) {
        faults.push(
          `${a.name} and ${b.name} end ${(gap / size).toFixed(2)} of a symbol apart`,
        );
      }
    }
  }
  return [...new Set(faults)];
}

/** Siblings who share their donors and surrogates who do not sit side by
 * side: the children of each set of donors are one run in their sibship,
 * and so are the children of each donor (a donor who gave to some of
 * another's children has a run inside theirs). */
export function faultsOfSiblingGrouping(
  drawing: Drawing,
  ties: HelperTie[],
): string[] {
  const donorsOf = (id: string) =>
    ties
      .filter((tie) => tie.child === id)
      .map((tie) => `${tie.parent}:${tie.kind}`)
      .toSorted()
      .join(',');
  const faults: string[] = [];
  const done = new Set<string>();
  for (const { child } of ties) {
    const siblings = siblingsOf(drawing, child);
    const key = siblings.join(',');
    if (done.has(key)) continue;
    done.add(key);
    const runs: string[] = [];
    for (const id of siblings) {
      const set = donorsOf(id);
      if (runs.at(-1) === set) continue;
      if (runs.includes(set)) {
        faults.push(
          `${id} sits apart from the siblings who share their donors (${set || 'none'})`,
        );
      }
      runs.push(set);
    }
    // Each donor's children side by side.
    for (const helper of new Set(
      ties.map((tie) => `${tie.parent}:${tie.kind}`),
    )) {
      const places = siblings.flatMap((id, k) =>
        donorsOf(id).split(',').includes(helper) ? [k] : [],
      );
      if (
        places.length > 1 &&
        places.at(-1)! - places[0]! + 1 > places.length
      ) {
        faults.push(`${helper}'s children do not sit side by side`);
      }
    }
  }
  return faults;
}

/** Sub-bars that run on past the lines hanging from them: each end of a
 * run's sub-bar is where a child's line up, or the stem of a run inside it,
 * comes down from it. */
function faultsOfRunBars(drawing: Drawing): string[] {
  return drawing.connectors.parentChildLines.flatMap((line) => {
    const runs = line.runs ?? [];
    const hanging = [
      ...line.uplines.map(upperEnd),
      ...runs.map((run) => upperEnd(run.stem)),
    ];
    return runs.flatMap((run) =>
      run.bar
        ? [
            { x: run.bar.x1, y: run.bar.y1 },
            { x: run.bar.x2, y: run.bar.y2 },
          ]
            .filter((end) => !hanging.some((top) => near(top, end)))
            .map(
              (end) =>
                `a sub-bar of ${(line.parentIds ?? []).join('+')}'s children runs on to ${end.x.toFixed(1)},${end.y.toFixed(1)} with nothing hanging from it`,
            )
        : [],
    );
  });
}

/**
 * Everything wrong with the lines of descent from two co-parents with no
 * partnership line between them (a stand-in and a recorded parent, say):
 * the line must come down from each parent's own symbol, the two joining
 * into one before the child or the sibling bar, with no bar between them
 * at the height of their symbols and no piece that starts or ends in empty
 * space, so that nothing reads as a partnership or as coming from someone
 * between them.
 */
export function faultsOfCoParentDescents(drawing: Drawing): string[] {
  const { connectors, size } = drawing;
  const faults: string[] = [];
  const partnered = (a: string, b: string) =>
    connectors.groupLines.some(
      (line) => line.partnerIds?.includes(a) && line.partnerIds.includes(b),
    );
  for (const line of connectors.parentChildLines) {
    const [a, b, ...more] = line.parentIds ?? [];
    if (!a || !b || a === b || more.length > 0) continue;
    if (line.parentLink.length === 0 || partnered(a, b)) continue;
    const name = `the line of descent from ${a} and ${b}`;
    const pieces = line.parentLink;
    const inParent = (p: Point) =>
      [a, b].some(
        (id) =>
          near(p, drawing.centre(id)) ||
          insideSymbol(p, drawing.centre(id), size, drawing.shapeOf(id)),
      );
    const symbolsBottom =
      Math.max(drawing.centre(a).y, drawing.centre(b).y) + size / 2;
    for (const id of [a, b]) {
      const centre = drawing.centre(id);
      const drop = pieces.some(
        (piece) =>
          isUpright(piece) &&
          !isLevel(piece) &&
          Math.abs(piece.x1 - centre.x) < 0.5 &&
          upperEnd(piece).y <= centre.y + size / 2 + 0.5,
      );
      if (!drop) faults.push(`${name} does not come down from ${id}'s symbol`);
    }
    for (const piece of pieces) {
      if (isLevel(piece) && piece.y1 < symbolsBottom) {
        faults.push(`${name} joins them at the height of their symbols`);
      }
    }
    // The pieces below the parents' line: the bar, the runs and the lines
    // up, where the line of descent may end.
    const below = [
      ...(line.siblingBar ? [line.siblingBar] : []),
      ...(line.runs ?? []).map((run) => run.stem),
      ...line.uplines,
    ];
    for (const piece of pieces) {
      for (const end of [upperEnd(piece), lowerEnd(piece)]) {
        if (inParent(end)) continue;
        const touches = [...pieces, ...below].some(
          (other) => other !== piece && distanceToSegment(end, other) < ON_LINE,
        );
        if (!touches) {
          faults.push(
            `${name} has a piece ending in empty space at (${end.x.toFixed(0)}, ${end.y.toFixed(0)})`,
          );
        }
      }
    }
    // One line: every piece joined to the drops from both parents.
    const linked = new Set<number>();
    const queue = pieces.flatMap((piece, k) =>
      inParent(upperEnd(piece)) ? [k] : [],
    );
    while (queue.length > 0) {
      const k = queue.pop()!;
      if (linked.has(k)) continue;
      linked.add(k);
      const piece = pieces[k]!;
      pieces.forEach((other, m) => {
        if (linked.has(m)) return;
        const meet = [upperEnd(other), lowerEnd(other)].some(
          (end) => distanceToSegment(end, piece) < ON_LINE,
        );
        const met = [upperEnd(piece), lowerEnd(piece)].some(
          (end) => distanceToSegment(end, other) < ON_LINE,
        );
        if (meet || met) queue.push(m);
      });
    }
    if (linked.size < pieces.length) {
      faults.push(`${name} is not one line from the two of them`);
    }
  }
  return faults;
}

/** The strict line checks over a whole drawing: the lines into each child
 * who has any, the donors' and surrogates' lines into sibships, and the
 * lines of descent from co-parents with no partnership line. */
export function strictLineFaults(
  drawing: Drawing,
  ties: HelperTie[],
  people: string[],
): string[] {
  const children = new Set(
    drawing.connectors.auxiliaryLines.flatMap((line) =>
      line.endpointIds?.[1] ? [line.endpointIds[1]] : [],
    ),
  );
  return [
    ...[...children].flatMap((child) =>
      faultsOfLinesInto(drawing, child).map((fault) => `${child}: ${fault}`),
    ),
    ...faultsOfHelperLines(drawing, ties, people),
    ...faultsOfSiblingGrouping(drawing, ties),
    ...faultsOfRunBars(drawing),
    ...faultsOfCoParentDescents(drawing),
  ];
}
