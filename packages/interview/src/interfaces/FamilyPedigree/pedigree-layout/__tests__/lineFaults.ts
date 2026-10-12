/**
 * The strict line checks: one check for each hard constraint of the rule set
 * the layout engine is built on (rules-audit.md section 1, as amended by
 * Josh's Round 4 rulings, 12 Oct 2026), worded as the rule set words it,
 * measured on the drawing as PersonNode draws the symbols. No check exempts
 * a kind of line, a kind of person or a family: a crossing is never a fault
 * here (how many crossings there are is a cost, which the tests pin for each
 * family), but a crossing not drawn as a hop is.
 *
 * The model the checks read the drawing by:
 * - A tie joins a parent to a child, and has a kind. Biological, donor and
 *   surrogate (carrier) ties are birth ties; adoptive and social ties are
 *   raising ties. Carrying the pregnancy is a birth tie whatever else the
 *   parent is to the child (Round 5): an adoptive or social parent who
 *   carried holds the child's carrier's tie.
 * - An owner is whoever a line comes from: one person, a recorded couple, or
 *   two co-parents with no recorded partnership (their line of descent).
 * - Each child has at most one line of descent, from its owners; every other
 *   tie is drawn by a line from its owner, which ends on a child, a sibling
 *   bar, or the top of a run's stem or a child's line up.
 */
import type {
  AuxiliaryConnector,
  LineSegment,
  ParentChildConnector,
  PedigreeConnectors,
  PedigreeLink,
  PedigreeSymbolShape,
  Point,
} from '../types';

/** Constraint 6: how far apart two junctions on one line or one symbol
 * edge are, at least, and how far a junction keeps from the ends and
 * corners of the line it meets, as a fraction of a symbol. */
const JUNCTION_CLEARANCE = 0.2;
/** Constraint 8: how close, and for how long, two lines of different owners
 * may run, and how close a line may pass a symbol it does not join, as a
 * fraction of a symbol. */
const LINE_CLEARANCE = 0.25;

export type Drawing = {
  size: number;
  connectors: PedigreeConnectors;
  centre: (id: string) => Point;
  shapeOf: (id: string) => PedigreeSymbolShape;
};

export type TieKind =
  | 'biological'
  | 'donor'
  | 'surrogate'
  | 'adoptive'
  | 'social';

/** A recorded parent tie. */
export type Tie = { parent: string; child: string; kind: TieKind };

/** What was recorded about a family: the drawing must account for it. */
export type Family = {
  people: string[];
  ties: Tie[];
  /** Recorded partnerships, current and former. */
  partnerships: [string, string][];
  twins: [string, string][];
};

/** A family's record, from the links the layout is given. */
export function familyOf(
  people: string[],
  links: readonly PedigreeLink[],
): Family {
  const ties: Tie[] = [];
  const partnerships: [string, string][] = [];
  const twins: [string, string][] = [];
  for (const link of links) {
    if (link.kind === 'partner') partnerships.push([link.source, link.target]);
    else if (link.kind.endsWith('Twin')) twins.push([link.source, link.target]);
    else {
      const recorded = link.kind as TieKind;
      ties.push({
        parent: link.source,
        child: link.target,
        kind:
          link.isGestationalCarrier && !isBirthKind(recorded)
            ? 'surrogate'
            : recorded,
      });
    }
  }
  return { people, ties, partnerships, twins };
}

const isBirthKind = (kind: string) =>
  kind === 'biological' || kind === 'donor' || kind === 'surrogate';

// --- Geometry --------------------------------------------------------------

const segmentsOf = (points: Point[]): LineSegment[] =>
  points.slice(1).map((p, k) => ({
    type: 'line',
    x1: points[k]!.x,
    y1: points[k]!.y,
    x2: p.x,
    y2: p.y,
  }));

const lengthOf = (s: LineSegment) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);

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

/** Where two segments cross at a point inside both, if they do. */
function crossingOf(a: LineSegment, b: LineSegment): Point | undefined {
  const rx = a.x2 - a.x1;
  const ry = a.y2 - a.y1;
  const sx = b.x2 - b.x1;
  const sy = b.y2 - b.y1;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-9) return undefined;
  const t = ((b.x1 - a.x1) * sy - (b.y1 - a.y1) * sx) / denominator;
  const u = ((b.x1 - a.x1) * ry - (b.y1 - a.y1) * rx) / denominator;
  const margin = 1e-6;
  if (t <= margin || t >= 1 - margin || u <= margin || u >= 1 - margin) {
    return undefined;
  }
  return { x: a.x1 + t * rx, y: a.y1 + t * ry };
}

const near = (a: Point, b: Point, within = 0.75) =>
  Math.hypot(a.x - b.x, a.y - b.y) < within;
const isLevel = (s: LineSegment) => Math.abs(s.y1 - s.y2) < 0.5;
const isUpright = (s: LineSegment) => Math.abs(s.x1 - s.x2) < 0.5;
const lowerEnd = (s: LineSegment): Point =>
  s.y1 >= s.y2 ? { x: s.x1, y: s.y1 } : { x: s.x2, y: s.y2 };
const upperEnd = (s: LineSegment): Point =>
  s.y1 >= s.y2 ? { x: s.x2, y: s.y2 } : { x: s.x1, y: s.y1 };
const ON_LINE = 0.75;

/** Sample points along a segment, about two to a pixel. */
function samples(s: LineSegment): { p: Point; length: number }[] {
  const length = lengthOf(s);
  const steps = Math.max(1, Math.ceil(length * 2));
  return Array.from({ length: steps }, (_, k) => ({
    p: {
      x: s.x1 + ((s.x2 - s.x1) * (k + 0.5)) / steps,
      y: s.y1 + ((s.y2 - s.y1) * (k + 0.5)) / steps,
    },
    length: length / steps,
  }));
}

/**
 * How far a point lies outside a person's symbol as PersonNode draws it
 * (negative inside): a circle, a square with rounded corners a quarter of
 * its width, or a diamond (a square turned and scaled to 0.85).
 */
export function outsideSymbol(
  p: Point,
  c: Point,
  size: number,
  shape: PedigreeSymbolShape,
): number {
  const dx = Math.abs(p.x - c.x);
  const dy = Math.abs(p.y - c.y);
  const half = size / 2;
  if (shape === 'circle') return Math.hypot(dx, dy) - half;
  if (shape === 'diamond') {
    return (dx + dy - half * 0.85 * Math.SQRT2) / Math.SQRT2;
  }
  const radius = size * 0.25;
  const qx = dx - (half - radius);
  const qy = dy - (half - radius);
  return (
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
    Math.min(Math.max(qx, qy), 0) -
    radius
  );
}

/** The topmost point of a person's symbol, where lines converging on them
 * from above meet. */
function topOfSymbol(drawing: Drawing, id: string): Point {
  const c = drawing.centre(id);
  const shape = drawing.shapeOf(id);
  return {
    x: c.x,
    y: c.y - (shape === 'diamond' ? 0.85 * Math.SQRT1_2 : 0.5) * drawing.size,
  };
}

/** Where a course first meets the child's symbol: the visible end. */
function visibleEnd(points: Point[], drawing: Drawing, childId: string) {
  const c = drawing.centre(childId);
  const shape = drawing.shapeOf(childId);
  for (const s of segmentsOf(points)) {
    const steps = Math.ceil(lengthOf(s) * 4);
    for (let k = 0; k <= steps; k++) {
      const p = {
        x: s.x1 + ((s.x2 - s.x1) * k) / Math.max(steps, 1),
        y: s.y1 + ((s.y2 - s.y1) * k) / Math.max(steps, 1),
      };
      if (outsideSymbol(p, c, drawing.size, shape) < 0) return p;
    }
  }
  return points.at(-1)!;
}

// --- The drawing read as lines and owners ---------------------------------

/** One line from an owner (an auxiliary connector). */
type OwnLine = {
  line: AuxiliaryConnector;
  owners: string[];
  kind: string;
  /** The child it ends on, when it ends on a child's edge. */
  child?: string;
  segments: LineSegment[];
  end: Point;
};

const ownLinesOf = (connectors: PedigreeConnectors): OwnLine[] =>
  connectors.auxiliaryLines.map((line) => ({
    line,
    owners: line.ownerIds ?? [line.endpointIds?.[0] ?? ''],
    kind: line.edgeType,
    ...(line.endpointIds?.[1] ? { child: line.endpointIds[1] } : {}),
    segments: segmentsOf(line.points),
    end: line.points.at(-1)!,
  }));

/** A line of descent: the connectors drawn for one owner's children on one
 * row (a sibship drawn in two styles is two connectors). */
type Descent = {
  parents: string[];
  parts: ParentChildConnector[];
  children: string[];
  /** Whether it comes down from its owners (co-parents with someone seated
   * between them have a sibling bar and no line down from them). */
  drawn: boolean;
};

function descentsOf(drawing: Drawing): Descent[] {
  const groups = new Map<string, Descent>();
  for (const line of drawing.connectors.parentChildLines) {
    const parents = [...(line.parentIds ?? [])].toSorted();
    const children = (line.uplineChildIds ?? []).filter(
      (id): id is string => id !== undefined,
    );
    if (children.length === 0) continue;
    const row = Math.round(drawing.centre(children[0]!).y);
    const key = `${parents.join(',')}|${row}`;
    const group = groups.get(key) ?? {
      parents,
      parts: [],
      children: [],
      drawn: false,
    };
    group.parts.push(line);
    group.children.push(...children);
    if (line.parentLink.length > 0) group.drawn = true;
    groups.set(key, group);
  }
  return [...groups.values()];
}

type Piece = {
  segment: LineSegment;
  role: 'parentLink' | 'bar' | 'stem' | 'subBar' | 'upline';
  part: ParentChildConnector;
  child?: string;
};

function piecesOf(connectors: PedigreeConnectors): Piece[] {
  return connectors.parentChildLines.flatMap((part) => [
    ...part.parentLink.map((segment) => ({
      segment,
      role: 'parentLink' as const,
      part,
    })),
    ...(part.siblingBar
      ? [{ segment: part.siblingBar, role: 'bar' as const, part }]
      : []),
    ...(part.runs ?? []).flatMap((run) => [
      { segment: run.stem, role: 'stem' as const, part },
      ...(run.bar ? [{ segment: run.bar, role: 'subBar' as const, part }] : []),
    ]),
    ...part.uplines.map((segment, k) => ({
      segment,
      role: 'upline' as const,
      part,
      ...(part.uplineChildIds?.[k] ? { child: part.uplineChildIds[k] } : {}),
    })),
  ]);
}

/**
 * The children a line reaches: the child it ends on, or, where it ends on a
 * line of descent, everyone that line leads down to from that point, as a
 * reader follows it: along a bar either way, and down a stem or a line up.
 * A line ending where a stem or a line up leaves a bar continues down that
 * piece only (Bennett 1c: a donor's line ending where their child's line
 * leaves the sibling bar reaches that child).
 */
export function childrenReachedBy(
  connectors: PedigreeConnectors,
  line: AuxiliaryConnector,
): Set<string> {
  const child = line.endpointIds?.[1];
  if (child !== undefined) return new Set([child]);
  const pieces = piecesOf(connectors);
  const start = line.points.at(-1)!;
  const reached = new Set<string>();
  const entered = new Map<number, number>();
  const downward = pieces.flatMap((piece, k) =>
    !isLevel(piece.segment) &&
    piece.role !== 'parentLink' &&
    near(upperEnd(piece.segment), start, ON_LINE)
      ? [{ piece: k, at: start }]
      : [],
  );
  const queue =
    downward.length > 0
      ? downward
      : pieces.flatMap((piece, k) =>
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
        // Down a stem or a line up, never back up it: a bar whose end is
        // where the reader came in is behind them.
        if (!isLevel(segment) && entry.y <= at.y + ON_LINE) continue;
        if (distanceToSegment(entry, reach) < ON_LINE) {
          queue.push({ piece: k, at: entry });
          break;
        }
      }
    });
  }
  return reached;
}

/** The descent a child hangs from. */
const descentOfChild = (descents: Descent[], child: string) =>
  descents.find((descent) => descent.children.includes(child));

/** The connector (part of a line of descent) holding a child's line up. */
const partOfChild = (connectors: PedigreeConnectors, child: string) =>
  connectors.parentChildLines.find((line) =>
    line.uplineChildIds?.includes(child),
  );

/** A child's siblings, the child among them: the children of their line of
 * descent, left to right. */
function siblingsOf(drawing: Drawing, descents: Descent[], child: string) {
  const descent = descentOfChild(descents, child);
  if (!descent) return [child];
  return [...new Set(descent.children)].toSorted(
    (a, b) => drawing.centre(a).x - drawing.centre(b).x,
  );
}

const partnered = (family: Family, a: string, b: string) =>
  family.partnerships.some(
    ([p, q]) => (p === a && q === b) || (p === b && q === a),
  );

const tiesOf = (family: Family, parent: string, child: string) =>
  family.ties
    .filter((tie) => tie.parent === parent && tie.child === child)
    .map((tie) => tie.kind);

/** Whether a line may join the line of descent of the children it reaches
 * (constraint 3): it carries a birth tie, and every tie on the line of
 * descent below where it would join is a birth tie. */
function mayJoin(
  drawing: Drawing,
  descents: Descent[],
  line: OwnLine,
  children: string[],
) {
  if (!isBirthKind(line.kind)) return false;
  return children.every((child) => {
    const descent = descentOfChild(descents, child);
    if (!descent?.drawn) return false;
    const part = partOfChild(drawing.connectors, child);
    return part !== undefined && isBirthKind(part.edgeType);
  });
}

/** Whether a line is one of its own line of descent's drops: a line from an
 * owner of a sibship drawn with no line down from its owners (co-parents
 * with someone seated between them), to the sibling bar. */
function isOwnersDrop(descents: Descent[], line: OwnLine, children: string[]) {
  const descent = descentOfChild(descents, children[0] ?? '');
  return (
    descent !== undefined &&
    !descent.drawn &&
    line.owners.every((owner) => descent.parents.includes(owner))
  );
}

// --- The constraints -------------------------------------------------------

/**
 * Constraint 1, Reach. Every tie is drawn by exactly one path. Each line
 * reaches exactly the children its owner holds that kind of tie to, reading
 * down the line: along a bar either way, and down a stem or a line up.
 */
function faultsOfReach(drawing: Drawing, family: Family): string[] {
  const faults: string[] = [];
  const descents = descentsOf(drawing);
  const lines = ownLinesOf(drawing.connectors);
  const reachedBy = lines.map((line) =>
    childrenReachedBy(drawing.connectors, line.line),
  );
  lines.forEach((line, k) => {
    const name = `${line.owners.join(' and ')}'s ${line.kind} line`;
    if (reachedBy[k]!.size === 0) faults.push(`${name} reaches no one`);
    for (const child of reachedBy[k]!) {
      for (const owner of line.owners) {
        if (!tiesOf(family, owner, child).includes(line.kind as TieKind)) {
          faults.push(
            `${name} reaches ${child}, to whom ${owner} holds no ${line.kind} tie`,
          );
        }
      }
    }
  });
  for (const descent of descents) {
    if (!descent.drawn) continue;
    for (const child of descent.children) {
      for (const parent of descent.parents) {
        if (tiesOf(family, parent, child).length === 0) {
          faults.push(
            `the line of descent from ${descent.parents.join(' and ')} reaches ${child}, to whom ${parent} holds no tie`,
          );
        }
      }
    }
  }
  for (const tie of family.ties) {
    const byDescent = descents.filter(
      (descent) =>
        descent.drawn &&
        descent.parents.includes(tie.parent) &&
        descent.children.includes(tie.child),
    ).length;
    const byLines = lines.filter(
      (line, k) =>
        line.owners.includes(tie.parent) &&
        line.kind === tie.kind &&
        reachedBy[k]!.has(tie.child),
    ).length;
    const paths = byDescent + byLines;
    if (paths !== 1) {
      faults.push(
        `${tie.kind} tie ${tie.parent}→${tie.child} is drawn by ${paths} paths`,
      );
    }
  }
  return faults;
}

/**
 * Constraint 2, Origin. Every line starts at its owner. That is the
 * person's symbol (and, for one of a pair, leaving it straight down), or a
 * couple's partnership line, or the couple's own line of descent. No line
 * starts in empty space, and two co-parents' lines never meet at the height
 * of their symbols.
 */
export function faultsOfOrigin(drawing: Drawing, family: Family): string[] {
  const { connectors, size } = drawing;
  const faults: string[] = [];
  const descents = descentsOf(drawing);
  const partnershipRails = (a: string, b: string) =>
    connectors.groupLines
      .filter(
        (line) => line.partnerIds?.includes(a) && line.partnerIds.includes(b),
      )
      .flatMap((line) => [
        line.segment,
        ...(line.doubleSegment ? [line.doubleSegment] : []),
      ]);
  const strictlyOn = (p: Point, s: LineSegment) =>
    distanceToSegment(p, s) < ON_LINE &&
    !near(p, { x: s.x1, y: s.y1 }) &&
    !near(p, { x: s.x2, y: s.y2 });
  const lines = ownLinesOf(connectors);
  // The lines that share their last piece: drawn as one from where they
  // join, each from its own owner.
  const joined = new Set<OwnLine>();
  for (const a of lines) {
    for (const b of lines) {
      if (a === b || a.owners.join() === b.owners.join()) continue;
      if (a.line.joinsAt !== undefined && b.line.joinsAt !== undefined) {
        const tailA = a.line.points.slice(a.line.joinsAt);
        const tailB = b.line.points.slice(b.line.joinsAt);
        if (
          tailA.length === tailB.length &&
          tailA.every((p, k) => near(p, tailB[k]!, 0.5))
        ) {
          joined.add(a);
        }
      }
    }
  }
  for (const line of lines) {
    const name = `${line.owners.join(' and ')}'s ${line.kind} line`;
    const [start, next] = line.line.points;
    if (!start || !next) {
      faults.push(`${name} draws nothing`);
      continue;
    }
    if (line.owners.length === 1) {
      const owner = line.owners[0]!;
      if (!near(start, drawing.centre(owner), 0.5)) {
        faults.push(`${name} does not start at ${owner}'s symbol`);
      }
      if (
        joined.has(line) &&
        (Math.abs(next.x - start.x) > 0.5 || next.y <= start.y)
      ) {
        faults.push(
          `${name} does not come straight down from ${owner}'s symbol before it joins`,
        );
      }
      continue;
    }
    const [a, b] = line.owners as [string, string];
    const onPartnership = partnershipRails(a, b).some((rail) =>
      strictlyOn(start, rail),
    );
    const ownDescent = descents.find(
      (descent) =>
        descent.drawn &&
        descent.parents.length === 2 &&
        descent.parents.includes(a) &&
        descent.parents.includes(b),
    );
    const onOwnDescent =
      ownDescent?.parts.some((part) =>
        part.parentLink.some(
          (piece) =>
            isUpright(piece) &&
            strictlyOn(start, piece) &&
            start.y >
              Math.max(drawing.centre(a).y, drawing.centre(b).y) + size / 2,
        ),
      ) ?? false;
    if (!onPartnership && !onOwnDescent) {
      faults.push(
        `${name} starts neither on their partnership line nor on their own line of descent`,
      );
    }
  }
  // Lines of descent.
  for (const descent of descents) {
    if (!descent.drawn) continue;
    const name = `the line of descent from ${descent.parents.join(' and ')}`;
    const link = descent.parts.flatMap((part) => part.parentLink);
    if (descent.parents.length === 1) {
      const top = link.map(upperEnd).toSorted((p, q) => p.y - q.y)[0]!;
      if (!near(top, drawing.centre(descent.parents[0]!), 0.5)) {
        faults.push(`${name} does not start at their symbol`);
      }
      continue;
    }
    const [a, b] = descent.parents as [string, string];
    if (partnered(family, a, b) && partnershipRails(a, b).length > 0) {
      const top = link.map(upperEnd).toSorted((p, q) => p.y - q.y)[0]!;
      const routedLeads = connectors.groupLines
        .filter(
          (line) => line.partnerIds?.includes(a) && line.partnerIds.includes(b),
        )
        .flatMap((line) => line.endpointSegments ?? []);
      if (
        !partnershipRails(a, b).some(
          (rail) => distanceToSegment(top, rail) < ON_LINE,
        ) &&
        routedLeads.length === 0
      ) {
        faults.push(`${name} does not start on their partnership line`);
      }
      continue;
    }
    faults.push(...faultsOfPairDescent(drawing, descent, link));
  }
  return faults;
}

/** A pair's line of descent comes down from each parent's own symbol, the
 * two joining into one before the child or the sibling bar, with no piece
 * at the height of their symbols and none that ends in empty space. */
function faultsOfPairDescent(
  drawing: Drawing,
  descent: Descent,
  pieces: LineSegment[],
): string[] {
  const { size } = drawing;
  const faults: string[] = [];
  const [a, b] = descent.parents as [string, string];
  const name = `the line of descent from ${a} and ${b}`;
  const inParent = (p: Point) =>
    [a, b].some(
      (id) =>
        near(p, drawing.centre(id), 0.5) ||
        outsideSymbol(p, drawing.centre(id), size, drawing.shapeOf(id)) < 0,
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
  const below = descent.parts.flatMap((part) => [
    ...(part.siblingBar ? [part.siblingBar] : []),
    ...(part.runs ?? []).map((run) => run.stem),
    ...part.uplines,
  ]);
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
  return faults;
}

/**
 * Constraint 3, Joining. Lines of different owners share a course only if
 * every tie on that course is a birth tie. A couple's line carries ties of
 * one style only: birth ties, or one raising kind.
 */
function faultsOfJoining(drawing: Drawing, family: Family): string[] {
  const faults: string[] = [];
  const descents = descentsOf(drawing);
  const lines = ownLinesOf(drawing.connectors);
  const pieces = piecesOf(drawing.connectors);
  // Where lines run on under a symbol (into a child's centre), they are not
  // seen to share a course.
  const underSymbol = (p: Point) =>
    family.people.some(
      (id) =>
        outsideSymbol(
          p,
          drawing.centre(id),
          drawing.size,
          drawing.shapeOf(id),
        ) < 0,
    );
  // Two lines along one course.
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const [a, b] = [lines[i]!, lines[j]!];
      if (a.owners.join() === b.owners.join()) continue;
      // Lines converging on one point meet there, not along a course.
      const ends = [...a.line.points, ...b.line.points];
      if (sharedLength(a.segments, b.segments, ends, underSymbol) < 1) continue;
      if (!isBirthKind(a.kind) || !isBirthKind(b.kind)) {
        faults.push(
          `${a.owners.join(' and ')}'s ${a.kind} line and ${b.owners.join(' and ')}'s ${b.kind} line share a course`,
        );
      }
    }
  }
  // A line joining a line of descent shares the course below where it
  // joins with the ties that line of descent carries.
  for (const line of lines) {
    if (line.child !== undefined) continue;
    const children = [...childrenReachedBy(drawing.connectors, line.line)];
    if (children.length === 0) continue;
    if (isOwnersDrop(descents, line, children)) continue;
    const onDescent = pieces.some(
      (piece) => distanceToSegment(line.end, piece.segment) < ON_LINE,
    );
    if (!onDescent) continue;
    if (!mayJoin(drawing, descents, line, children)) {
      faults.push(
        `${line.owners.join(' and ')}'s ${line.kind} line joins a line of descent that carries a tie that is not a birth tie, or carries one itself`,
      );
    }
  }
  // A couple's line, and a line of descent from two parents, carry ties of
  // one style: birth ties, or one raising kind.
  const styleOf = (kinds: string[]) =>
    kinds.length === 1 && isBirthKind(kinds[0]!) ? 'birth' : kinds.join();
  for (const line of lines) {
    if (line.owners.length < 2) continue;
    for (const child of childrenReachedBy(drawing.connectors, line.line)) {
      const kinds = new Set(
        line.owners.map((owner) => styleOf(tiesOf(family, owner, child))),
      );
      if (kinds.size > 1) {
        faults.push(
          `${line.owners.join(' and ')}'s couple line to ${child} carries ties of different kinds`,
        );
      }
    }
  }
  for (const descent of descents) {
    if (!descent.drawn || descent.parents.length < 2) continue;
    for (const part of descent.parts) {
      for (const child of part.uplineChildIds ?? []) {
        if (child === undefined) continue;
        const kinds = descent.parents.map((parent) =>
          styleOf(tiesOf(family, parent, child)),
        );
        if (
          !kinds.every((theirs) => !theirs.includes(',') && theirs === kinds[0])
        ) {
          faults.push(
            `the line of descent from ${descent.parents.join(' and ')} to ${child} carries ties of different kinds`,
          );
        }
      }
    }
  }
  return faults;
}

/** How long two courses run along one another, leaving out the few
 * pixels round each of `meetings` (where one ends on the other, or crosses
 * it) and what is `hidden` under a symbol. */
function sharedLength(
  a: LineSegment[],
  b: LineSegment[],
  meetings: Point[] = [],
  hidden: (p: Point) => boolean = () => false,
): number {
  let total = 0;
  for (const s of a) {
    // Where the two lines cross, they meet at a point, not along a course.
    const crossings = b.flatMap((t) => crossingOf(s, t) ?? []);
    for (const { p, length } of samples(s)) {
      if ([...meetings, ...crossings].some((m) => near(p, m, 3)) || hidden(p)) {
        continue;
      }
      if (b.some((t) => distanceToSegment(p, t) < 0.5)) total += length;
    }
  }
  return total;
}

/**
 * Constraint 4, Target, with the donor and carrier line rule (Josh, 12 Oct
 * 2026). Constraint 3 decides whether a line may join the child's line of
 * descent. If it may, the line ends where the line of descent first leads
 * only to the children it is drawn for: the sibling bar (for all of a
 * sibship), the top of a run's stem (for a run), the top of a child's line
 * up (for one child of a sibship), or the top of the child (for an only
 * child, the lines converging on one point). Otherwise it ends at the top of
 * each child. (Whether it is straight: see `faultsOfStraightness`.)
 */
function faultsOfTarget(drawing: Drawing, _family: Family): string[] {
  const { connectors } = drawing;
  const faults: string[] = [];
  const descents = descentsOf(drawing);
  const pieces = piecesOf(connectors);
  for (const line of ownLinesOf(connectors)) {
    const name = `${line.owners.join(' and ')}'s ${line.kind} line`;
    const reached = [...childrenReachedBy(connectors, line.line)];
    if (reached.length === 0) continue;
    if (line.child === undefined && isOwnersDrop(descents, line, reached)) {
      // The co-parents' own lines to their sibling bar.
      if (
        !pieces.some(
          (piece) =>
            piece.role === 'bar' &&
            distanceToSegment(line.end, piece.segment) < ON_LINE,
        )
      ) {
        faults.push(`${name} does not end on their children's sibling bar`);
      }
      continue;
    }
    if (!mayJoin(drawing, descents, line, reached)) {
      if (line.child === undefined) {
        faults.push(`${name} ends on a line of descent, not on each child`);
      }
      continue;
    }
    const siblings = siblingsOf(drawing, descents, reached[0]!);
    const all =
      siblings.length > 1 && siblings.every((id) => reached.includes(id));
    if (siblings.length === 1) {
      if (!near(line.end, topOfSymbol(drawing, reached[0]!), 1)) {
        faults.push(`${name} does not end at the top of ${reached[0]}`);
      }
    } else if (all) {
      const bars = pieces.filter(
        (piece) =>
          (piece.role === 'bar' ||
            // Twins hang from one point, and have no bar.
            piece.role === 'upline') &&
          piece.part.uplineChildIds?.some((id) => reached.includes(id ?? '')),
      );
      if (
        !bars.some((piece) =>
          piece.role === 'bar'
            ? distanceToSegment(line.end, piece.segment) < ON_LINE
            : near(line.end, upperEnd(piece.segment)),
        )
      ) {
        faults.push(`${name} does not end on the sibling bar`);
      }
    } else if (reached.length === 1) {
      const upline = pieces.find(
        (piece) => piece.role === 'upline' && piece.child === reached[0],
      );
      if (!upline || !near(line.end, upperEnd(upline.segment), 1)) {
        faults.push(
          `${name} does not end at the top of ${reached[0]}'s line up`,
        );
      }
    } else {
      const stem = pieces.find(
        (piece) =>
          piece.role === 'stem' && near(line.end, upperEnd(piece.segment), 1),
      );
      if (!stem) {
        faults.push(`${name} does not end at the top of its run's stem`);
      }
    }
  }
  return faults;
}

/**
 * Straightness, below crossings in the one cost (Josh, 12 Oct 2026): a
 * line is drawn straight unless a bent course crosses fewer lines, or the
 * straight course breaks a hard constraint (passes through or close past
 * someone, runs along or close beside another line, crosses a line of its
 * own owner or another line into the same child, or continues a line it
 * meets). Lines that must leave their start a set way are not held to it:
 * one of a pair's lines (straight down from its owner), a couple's line
 * leaving their own line of descent (level), and a line from the child's
 * own row (below the row).
 */
function faultsOfStraightness(drawing: Drawing, family: Family): string[] {
  const { connectors, size } = drawing;
  const faults: string[] = [];
  const lines = ownLinesOf(connectors);
  const pieces = piecesOf(connectors);
  const clearance = LINE_CLEARANCE * size;
  const inSomeone = (p: Point) =>
    family.people.some(
      (id) =>
        outsideSymbol(p, drawing.centre(id), size, drawing.shapeOf(id)) < 0,
    );
  const fixed: LineSegment[] = [
    ...pieces.map((piece) => piece.segment),
    ...connectors.groupLines.flatMap((line) => [
      line.segment,
      ...(line.endpointSegments ?? []),
      ...(line.doubleSegment ? [line.doubleSegment] : []),
    ]),
    ...connectors.twinIndicators.flatMap((twin) =>
      twin.segment ? [twin.segment] : [],
    ),
  ];
  const crossingsOf = (course: LineSegment[], others: LineSegment[]) =>
    course.reduce(
      (total, s) =>
        total +
        others.filter((t) => {
          const at = crossingOf(s, t);
          return at !== undefined && !inSomeone(at);
        }).length,
      0,
    );
  for (const line of lines) {
    if (line.line.joinsAt !== undefined) continue;
    const name = `${line.owners.join(' and ')}'s ${line.kind} line`;
    const reached = [...childrenReachedBy(connectors, line.line)];
    const start = line.line.points[0]!;
    const end =
      line.child === undefined
        ? line.end
        : visibleEnd(line.line.points, drawing, line.child);
    if (line.child !== undefined && end.y > drawing.centre(line.child).y) {
      continue;
    }
    if (
      line.owners.length > 1 &&
      pieces.some(
        (piece) =>
          piece.role === 'parentLink' &&
          isUpright(piece.segment) &&
          distanceToSegment(start, piece.segment) < ON_LINE,
      )
    ) {
      continue;
    }
    // Whether the course shows a corner.
    const corners = line.line.points.slice(1, -1);
    if (corners.every((corner) => inSomeone(corner) || near(corner, end, 1))) {
      continue;
    }
    const straight: LineSegment = {
      type: 'line',
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
    };
    const joins = new Set([...line.owners, ...reached]);
    // Through anyone it does not leave (a couple's line leaves their
    // partnership line, not either symbol), or close past someone it does
    // not join.
    const pastSomeone = family.people.some((id) => {
      const outside = (p: Point) =>
        outsideSymbol(p, drawing.centre(id), size, drawing.shapeOf(id));
      if (joins.has(id) && outside(start) < 0.5) return false;
      const limit = joins.has(id) ? -1 : clearance;
      return samples(straight).some(({ p }) => outside(p) < limit);
    });
    if (pastSomeone) continue;
    // Along or close beside another line, away from where it starts and
    // ends; lines converging on its end are not beside it.
    const others = lines.filter(
      (other) =>
        other !== line &&
        !(other.child !== undefined && other.child === line.child) &&
        !(other.child === undefined && near(other.end, line.end, 1)),
    );
    const beside = [...fixed, ...others.flatMap((other) => other.segments)];
    let run = 0;
    let longest = 0;
    for (const { p, length } of samples(straight)) {
      if (
        near(p, start, 0.3 * size) ||
        near(p, end, 0.3 * size) ||
        inSomeone(p)
      ) {
        run = 0;
        continue;
      }
      const apart = Math.min(
        Infinity,
        ...beside.map((t) => distanceToSegment(p, t)),
      );
      run = apart < clearance ? run + length : 0;
      longest = Math.max(longest, run);
    }
    if (longest > clearance) continue;
    // Across a line of its own owner, or another line into the same child.
    const own = lines.filter(
      (other) =>
        other !== line &&
        (other.owners.some((id) => line.owners.includes(id)) ||
          (line.child !== undefined && other.child === line.child)),
    );
    if (
      crossingsOf(
        [straight],
        own.flatMap((other) => other.segments),
      ) > 0
    ) {
      continue;
    }
    // Continuing a line it meets, in line with it.
    const continues = [...fixed, ...others.flatMap((o) => o.segments)].some(
      (t) => {
        const a = { x: t.x1, y: t.y1 };
        const b = { x: t.x2, y: t.y2 };
        const far = near(a, end, 1) ? b : near(b, end, 1) ? a : undefined;
        if (!far) return false;
        const u = { x: end.x - start.x, y: end.y - start.y };
        const v = { x: far.x - end.x, y: far.y - end.y };
        const lv = Math.hypot(v.x, v.y);
        if (lv < 1) return false;
        const step = Math.min(1, (0.1 * size) / lv);
        if (inSomeone({ x: end.x + step * v.x, y: end.y + step * v.y })) {
          return false;
        }
        const across =
          Math.abs(u.x * v.y - u.y * v.x) / (Math.hypot(u.x, u.y) * lv);
        return across < 0.05 && u.x * v.x + u.y * v.y > 0;
      },
    );
    if (continues) continue;
    const everything = [...fixed, ...others.flatMap((other) => other.segments)];
    if (
      crossingsOf([straight], everything) <=
      crossingsOf(line.segments, everything)
    ) {
      faults.push(
        `${name} bends, though a straight line would cross no more lines and break no rule`,
      );
    }
  }
  return faults;
}

/**
 * Constraint 5, Runs. A helper's children sit side by side where seating
 * allows. Runs are either nested or apart. When two helpers' children
 * overlap without nesting, the helper with more children (then the first
 * recorded) keeps the run. Each helper reaches their children with one line
 * per part.
 */
function faultsOfRuns(drawing: Drawing, family: Family): string[] {
  const faults: string[] = [];
  const descents = descentsOf(drawing);
  const lines = ownLinesOf(drawing.connectors);
  const reachedBy = lines.map((line) => [
    ...childrenReachedBy(drawing.connectors, line.line),
  ]);
  for (const descent of descents) {
    const siblings = siblingsOf(drawing, descents, descent.children[0]!);
    if (siblings.length < 2) continue;
    // The helpers whose lines join this line of descent, with their
    // children here, in the order their ties were recorded.
    const helpers = new Map<string, Set<string>>();
    const recorded = new Map<string, number>();
    family.ties.forEach((tie, k) => {
      if (!siblings.includes(tie.child)) return;
      if (tie.kind !== 'donor' && tie.kind !== 'surrogate') return;
      const key = `${tie.parent}:${tie.kind}`;
      helpers.set(key, (helpers.get(key) ?? new Set()).add(tie.child));
      if (!recorded.has(key)) recorded.set(key, k);
    });
    const placeOf = (id: string) => siblings.indexOf(id);
    // Side by side: one stretch of the sibship each.
    for (const [helper, children] of helpers) {
      const places = [...children].map(placeOf).toSorted((a, b) => a - b);
      if (places.at(-1)! - places[0]! + 1 > places.length) {
        faults.push(`${helper}'s children do not sit side by side`);
      }
    }
    // The runs kept: larger first, then first recorded; a stretch crossing
    // a kept run is cut where that run ends.
    const stretches = [...helpers]
      .map(([helper, children]) => ({
        helpers: [helper],
        places: [...children].map(placeOf).toSorted((a, b) => a - b),
        order: recorded.get(helper)!,
      }))
      .toSorted(
        (a, b) => b.places.length - a.places.length || a.order - b.order,
      );
    const kept: number[][] = [];
    const parts = new Map<string, number[][]>();
    for (const stretch of stretches) {
      let pieces = [stretch.places];
      for (const run of kept) {
        pieces = pieces.flatMap((places) => {
          const inside = places.filter((k) => run.includes(k));
          if (
            inside.length === 0 ||
            inside.length === places.length ||
            inside.length === run.length
          ) {
            return [places];
          }
          return [inside, places.filter((k) => !run.includes(k))];
        });
      }
      for (const places of pieces) kept.push(places);
      parts.set(stretch.helpers[0]!, pieces);
    }
    // One line per part, for the helpers whose lines join.
    for (const [helper, helperParts] of parts) {
      const [parent, kind] = helper.split(':') as [string, string];
      const theirs = lines.flatMap((line, k) =>
        line.owners.includes(parent) && line.kind === kind ? [k] : [],
      );
      if (
        !theirs.some((k) =>
          mayJoin(drawing, descents, lines[k]!, reachedBy[k]!),
        )
      ) {
        continue;
      }
      for (const part of helperParts) {
        const ids = part.map((k) => siblings[k]!);
        const by = new Set(
          ids.map((id) => theirs.find((k) => reachedBy[k]!.includes(id))),
        );
        if (by.size > 1) {
          faults.push(
            `${helper} reaches ${ids.join(' and ')}, one part, apart`,
          );
        }
        const line = [...by][0];
        if (
          line !== undefined &&
          reachedBy[line]!.some(
            (id) => siblings.includes(id) && !ids.includes(id),
          )
        ) {
          faults.push(
            `${helper}'s line to ${ids.join(' and ')} reaches past them`,
          );
        }
      }
    }
  }
  return faults;
}

/**
 * Constraint 6, Junctions. A line meets an upright piece level, in a T,
 * and meets a level piece from above. A line meets another at an angle and
 * never continues it in a straight line (Josh, 12 Oct 2026). Two junctions
 * on one line are at least 0.2 of a symbol apart (or are one junction).
 * Each junction is at least that far from the ends and corners of the line
 * it meets. Every line into a child converges on one point at the top of
 * the child, as in Bennett (Round 5), or, from a parent on the child's own
 * row, at its bottom; the ends of donors' and carriers' lines that meet the
 * line of descent may meet at one point.
 */
function faultsOfJunctions(drawing: Drawing, _family: Family): string[] {
  const { connectors, size } = drawing;
  const faults: string[] = [];
  const gap = JUNCTION_CLEARANCE * size;
  const pieces = piecesOf(connectors);
  const lines = ownLinesOf(connectors);
  // Where lines end on lines of descent.
  for (const line of lines) {
    if (line.child !== undefined) continue;
    const name = `${line.owners.join(' and ')}'s ${line.kind} line`;
    const from = line.line.points.at(-2)!;
    const end = line.end;
    const onLevel = pieces.some(
      (piece) =>
        isLevel(piece.segment) &&
        distanceToSegment(end, piece.segment) < ON_LINE,
    );
    const atTop = pieces.some(
      (piece) =>
        !isLevel(piece.segment) && near(end, upperEnd(piece.segment), 1),
    );
    const inUpright = pieces.find(
      (piece) =>
        isUpright(piece.segment) &&
        !isLevel(piece.segment) &&
        distanceToSegment(end, piece.segment) < ON_LINE &&
        !near(end, upperEnd(piece.segment), 1) &&
        !near(end, lowerEnd(piece.segment), 1),
    );
    const reached = [...childrenReachedBy(connectors, line.line)];
    const childTop =
      reached.length === 1 && near(end, topOfSymbol(drawing, reached[0]!), 1);
    if (onLevel || atTop || childTop) {
      if (from.y >= end.y - 0.5) {
        faults.push(`${name} does not meet the line of descent from above`);
      }
    } else if (inUpright && Math.abs(from.y - end.y) > 0.5) {
      faults.push(`${name} does not meet an upright line level, in a T`);
    }
  }
  // A couple's line leaving their own line of descent: level, clear of its
  // ends.
  for (const line of lines) {
    if (line.owners.length < 2) continue;
    const [start, next] = line.line.points;
    if (!start || !next) continue;
    const piece = pieces.find(
      (candidate) =>
        candidate.role === 'parentLink' &&
        isUpright(candidate.segment) &&
        !isLevel(candidate.segment) &&
        distanceToSegment(start, candidate.segment) < ON_LINE,
    );
    if (!piece) continue;
    if (Math.abs(next.y - start.y) > 0.5) {
      faults.push(
        `${line.owners.join(' and ')}'s couple line does not leave their line of descent level`,
      );
    }
    for (const endOfPiece of [
      upperEnd(piece.segment),
      lowerEnd(piece.segment),
    ]) {
      if (
        Math.hypot(start.x - endOfPiece.x, start.y - endOfPiece.y) <
        gap - 0.25
      ) {
        faults.push(
          `${line.owners.join(' and ')}'s couple line leaves their line of descent ${(Math.hypot(start.x - endOfPiece.x, start.y - endOfPiece.y) / size).toFixed(2)} of a symbol from an end`,
        );
      }
    }
  }
  // The junctions on each bar: where the lines from the parents, the
  // stems, the lines up and the lines from owners meet it.
  for (const bar of pieces.filter(
    (piece) => piece.role === 'bar' || piece.role === 'subBar',
  )) {
    const on = (p: Point) => distanceToSegment(p, bar.segment) < ON_LINE;
    const junctions: { at: Point; what: string; ownEnd: boolean }[] = [
      ...pieces
        .filter((piece) => piece !== bar && !isLevel(piece.segment))
        .flatMap((piece) =>
          [upperEnd(piece.segment), lowerEnd(piece.segment)]
            .filter(on)
            .map((at) => ({ at, what: piece.role, ownEnd: false })),
        ),
      ...lines
        .filter((line) => line.child === undefined && on(line.end))
        .map((line) => ({
          at: line.end,
          what: `${line.owners.join(' and ')}'s line`,
          ownEnd: true,
        })),
    ];
    const barEnds = [
      { x: bar.segment.x1, y: bar.segment.y1 },
      { x: bar.segment.x2, y: bar.segment.y2 },
    ];
    for (let i = 0; i < junctions.length; i++) {
      const a = junctions[i]!;
      for (let j = i + 1; j < junctions.length; j++) {
        const b = junctions[j]!;
        const d = Math.abs(a.at.x - b.at.x);
        if (d > 1 && d < gap - 0.25) {
          faults.push(
            `${a.what} and ${b.what} meet a bar ${(d / size).toFixed(2)} of a symbol apart`,
          );
        }
      }
      if (a.ownEnd) {
        for (const barEnd of barEnds) {
          const d = Math.abs(a.at.x - barEnd.x);
          if (d > 1 && d < gap - 0.25) {
            faults.push(
              `${a.what} meets a bar ${(d / size).toFixed(2)} of a symbol from its end`,
            );
          }
        }
      }
    }
  }
  // Every line into a child ends at the top of the child (or, coming up
  // from below their row, at its bottom).
  for (const line of lines) {
    if (line.child === undefined) continue;
    const name = `${line.owners.join(' and ')}'s ${line.kind} line`;
    const end = visibleEnd(line.line.points, drawing, line.child);
    const top = topOfSymbol(drawing, line.child);
    const centre = drawing.centre(line.child);
    const bottom = { x: top.x, y: 2 * centre.y - top.y };
    if (!near(end, top, 2) && !near(end, bottom, 2)) {
      faults.push(
        `${name} ends at (${end.x.toFixed(0)}, ${end.y.toFixed(0)}), not at the top of ${line.child}`,
      );
    }
  }
  // A line meets another at an angle: its last piece that shows does not
  // run on, in line with it, into a piece that ends where it ends.
  const hiddenAt = (p: Point) =>
    [
      ...new Set([
        ...lines.flatMap((l) => l.owners),
        ...lines.flatMap((l) => l.child ?? []),
      ]),
    ]
      .concat(
        drawing.connectors.parentChildLines.flatMap((part) =>
          (part.uplineChildIds ?? []).flatMap((id) => id ?? []),
        ),
      )
      .some(
        (id) =>
          outsideSymbol(p, drawing.centre(id), size, drawing.shapeOf(id)) < 0,
      );
  const others = [
    ...pieces.map((piece) => ({
      segment: piece.segment,
      what: `the line of descent from ${(piece.part.parentIds ?? []).join(' and ')}`,
    })),
    ...lines.flatMap((line) =>
      line.segments.map((segment) => ({
        segment,
        what: `${line.owners.join(' and ')}'s ${line.kind} line`,
        line,
      })),
    ),
  ];
  for (const line of lines) {
    const name = `${line.owners.join(' and ')}'s ${line.kind} line`;
    const end =
      line.child === undefined
        ? line.end
        : visibleEnd(line.line.points, drawing, line.child);
    // The last piece that shows, arriving at the end.
    const visible = segmentsOf(line.line.points).filter((piece) => {
      const mid = {
        x: (piece.x1 + piece.x2) / 2,
        y: (piece.y1 + piece.y2) / 2,
      };
      return !hiddenAt(mid) && lengthOf(piece) > 1;
    });
    const last = visible.findLast((piece) => distanceToSegment(end, piece) < 1);
    if (!last) continue;
    const from = near({ x: last.x1, y: last.y1 }, end, 1)
      ? { x: last.x2, y: last.y2 }
      : { x: last.x1, y: last.y1 };
    const u = { x: end.x - from.x, y: end.y - from.y };
    for (const other of others) {
      if ('line' in other && other.line === line) continue;
      const { segment } = other;
      const a = { x: segment.x1, y: segment.y1 };
      const b = { x: segment.x2, y: segment.y2 };
      const far = near(a, end, 1) ? b : near(b, end, 1) ? a : undefined;
      if (!far) continue;
      const v = { x: far.x - end.x, y: far.y - end.y };
      const lv = Math.hypot(v.x, v.y);
      const lu = Math.hypot(u.x, u.y);
      if (lv < 1 || lu < 1) continue;
      const step = Math.min(1, (0.1 * size) / lv);
      if (hiddenAt({ x: end.x + step * v.x, y: end.y + step * v.y })) continue;
      const across = Math.abs(u.x * v.y - u.y * v.x) / (lu * lv);
      if (across < 0.05 && u.x * v.x + u.y * v.y > 0) {
        faults.push(`${name} continues ${other.what} in a straight line`);
      }
    }
  }
  return faults;
}

/** The lines ending on a child's edge, the lines drawn as one from where
 * they join counted once: each with a name, its owners' position, its
 * visible end, and its course. */
function groupsInto(drawing: Drawing, child: string) {
  const into = ownLinesOf(drawing.connectors).filter(
    (line) => line.child === child,
  );
  // Each line as far as it is seen: to the top of the child, where every
  // line into them converges.
  const c = drawing.centre(child);
  const seen = (line: OwnLine) => {
    const points = line.line.points;
    const at = points.findIndex(
      (p) => outsideSymbol(p, c, drawing.size, drawing.shapeOf(child)) < 0.5,
    );
    return at < 0 ? points : points.slice(0, at + 1);
  };
  const groups: OwnLine[][] = [];
  for (const line of into) {
    const group = groups.find((members) =>
      members.some((other) => sharedTail(seen(other), seen(line)) >= 2),
    );
    if (group) group.push(line);
    else groups.push([line]);
  }
  return groups.map((members) => {
    const owners = members.flatMap((line) => line.owners);
    return {
      members,
      owners,
      name:
        members.length > 1
          ? `the joined ${members[0]!.kind} line of ${owners.join(' and ')}`
          : `${owners.join(' and ')}'s ${members[0]!.kind} line`,
      ownerX:
        owners.reduce((sum, id) => sum + drawing.centre(id).x, 0) /
        owners.length,
      end: visibleEnd(members[0]!.line.points, drawing, child),
      segments: members.flatMap((line) => line.segments),
    };
  });
}

/** How many points at the ends of two courses are the same: where two
 * lines are drawn as one. */
function sharedTail(a: Point[], b: Point[]): number {
  let k = 0;
  while (
    k < Math.min(a.length, b.length) &&
    near(a[a.length - 1 - k]!, b[b.length - 1 - k]!, 0.5)
  ) {
    k++;
  }
  return k;
}

/** The direction a course arrives at `end` from, seen from `end`: 0 from
 * straight above, negative from the left, positive from the right (in
 * radians, for a course coming down; mirrored for one coming up). */
function arrivalFrom(points: Point[], end: Point, size: number): number {
  // The point a fifth of a symbol back along the course from its end.
  const pieces = segmentsOf(points);
  const at = pieces.findLastIndex((piece) => distanceToSegment(end, piece) < 1);
  let back = 0.2 * size;
  let from = end;
  for (let k = at; k >= 0 && back > 0; k--) {
    const piece = pieces[k]!;
    const start = { x: piece.x1, y: piece.y1 };
    const length = Math.hypot(from.x - start.x, from.y - start.y);
    if (length >= back) {
      from = {
        x: from.x + ((start.x - from.x) * back) / length,
        y: from.y + ((start.y - from.y) * back) / length,
      };
      back = 0;
    } else {
      back -= length;
      from = start;
    }
  }
  return Math.atan2(from.x - end.x, Math.abs(end.y - from.y));
}

/**
 * Constraint 7, Order. The lines converging on a child keep their owners'
 * left-to-right order in the direction each arrives from (Round 5: order
 * stays readable from each line's angle). The line of descent counts as
 * being at its owners' position, arriving down the child's line up.
 */
function faultsOfOrder(drawing: Drawing, _family: Family): string[] {
  const faults: string[] = [];
  const descents = descentsOf(drawing);
  const children = new Set(
    ownLinesOf(drawing.connectors).flatMap((line) => line.child ?? []),
  );
  for (const child of children) {
    const centre = drawing.centre(child);
    const ends: {
      name: string;
      ownerX: number;
      below: boolean;
      from: number;
    }[] = groupsInto(drawing, child).map(({ name, ownerX, end, members }) => ({
      name,
      ownerX,
      below: end.y > centre.y,
      from: arrivalFrom(members[0]!.line.points, end, drawing.size),
    }));
    const descent = descentOfChild(descents, child);
    const upline = drawing.connectors.parentChildLines
      .flatMap((part) =>
        part.uplines.flatMap((segment, k) =>
          part.uplineChildIds?.[k] === child ? [segment] : [],
        ),
      )
      .at(0);
    if (descent?.drawn && upline) {
      const top = upperEnd(upline);
      ends.push({
        name: 'the line of descent',
        ownerX:
          descent.parents.reduce((sum, id) => sum + drawing.centre(id).x, 0) /
          descent.parents.length,
        below: false,
        from: Math.atan2(top.x - centre.x, Math.abs(centre.y - top.y)),
      });
    }
    for (const below of [false, true]) {
      const byOwner = ends
        .filter((end) => end.below === below)
        .toSorted((a, b) => a.ownerX - b.ownerX);
      for (let k = 0; k + 1 < byOwner.length; k++) {
        const [a, b] = [byOwner[k]!, byOwner[k + 1]!];
        if (b.ownerX - a.ownerX > 1 && b.from < a.from - 0.02) {
          faults.push(`${child}: ${b.name} arrives from left of ${a.name}`);
        }
      }
    }
  }
  return faults;
}

/**
 * Constraint 8, Clearance. Two lines of different owners never run within
 * 0.25 of a symbol of each other for more than 0.25 of a symbol. No line
 * runs along another line, or through a symbol or bracket, or close past a
 * symbol it does not join. (Lines drawn as one, which constraint 3 governs,
 * the lines that meet at one point on a line of descent, which the donor
 * rule allows, or converge on one child, and lines where they cross, drawn
 * as a hop, or join, are not two lines running close here.)
 */
function faultsOfClearance(drawing: Drawing, family: Family): string[] {
  const { connectors, size } = drawing;
  const faults: string[] = [];
  const lines = ownLinesOf(connectors);
  const pieces = piecesOf(connectors);
  const clearance = LINE_CLEARANCE * size;
  const bracketed = new Set(
    family.ties
      .filter((tie) => tie.kind === 'adoptive')
      .map((tie) => tie.child),
  );
  const brackets = [...bracketed].flatMap((id) => {
    const c = drawing.centre(id);
    return [-1, 1].map((side) => {
      const inner = c.x + side * size * 0.515;
      const outer = c.x + side * size * 0.69;
      return {
        left: Math.min(inner, outer),
        right: Math.max(inner, outer),
        top: c.y - size * 0.61,
        bottom: c.y + size * 0.61,
      };
    });
  });
  const partnershipSegments = connectors.groupLines.flatMap((line) => [
    line.segment,
    ...(line.endpointSegments ?? []),
    ...(line.doubleSegment ? [line.doubleSegment] : []),
  ]);
  const underSymbol = (p: Point) =>
    family.people.some(
      (id) =>
        outsideSymbol(p, drawing.centre(id), size, drawing.shapeOf(id)) < 0,
    );
  for (const line of lines) {
    const name = `${line.owners.join(' and ')}'s ${line.kind} line`;
    const reached = [...childrenReachedBy(connectors, line.line)];
    const joins = new Set([...line.owners, ...reached]);
    const hops = line.line.hops ?? [];
    const visible =
      line.child === undefined
        ? line.end
        : visibleEnd(line.line.points, drawing, line.child);
    let through = false;
    let past = false;
    let inBracket = false;
    // The longest stretch beside a line of descent, and the current one.
    let besideDescent = 0;
    let beside = 0;
    for (const s of line.segments) {
      for (const { p, length } of samples(s)) {
        for (const id of family.people) {
          const out = outsideSymbol(
            p,
            drawing.centre(id),
            size,
            drawing.shapeOf(id),
          );
          if (joins.has(id)) continue;
          if (out < 0) through = true;
          else if (out < clearance - 0.5) past = true;
        }
        if (
          brackets.some(
            (b) =>
              p.x > b.left && p.x < b.right && p.y > b.top && p.y < b.bottom,
          ) &&
          !reached.some(
            (id) => bracketed.has(id) && near(p, drawing.centre(id), size),
          )
        ) {
          inBracket = true;
        }
        // Beside a line of descent, where it shows, away from the line's
        // ends (where it leaves its owner and where it meets its target)
        // and hops.
        const nearEnd =
          near(p, visible, 0.3 * size) ||
          near(p, line.line.points[0]!, 0.3 * size) ||
          hops.some((h) => near(p, h, 0.3 * size));
        beside = nearEnd || underSymbol(p) ? 0 : beside;
        if (!nearEnd && !underSymbol(p)) {
          const apart = Math.min(
            Infinity,
            ...pieces
              .filter(
                (piece) =>
                  !(
                    line.owners.length > 1 &&
                    piece.role === 'parentLink' &&
                    line.owners.every((id) =>
                      piece.part.parentIds?.includes(id),
                    )
                  ),
              )
              .map((piece) => distanceToSegment(p, piece.segment)),
          );
          beside = apart < clearance - 0.25 ? beside + length : 0;
          besideDescent = Math.max(besideDescent, beside);
        }
      }
    }
    if (through) faults.push(`${name} passes through someone`);
    if (past) faults.push(`${name} passes close by someone it does not join`);
    if (inBracket) faults.push(`${name} passes through a bracket`);
    if (besideDescent > clearance) {
      faults.push(
        `${name} runs within a quarter of a symbol of a line of descent for ${(besideDescent / size).toFixed(2)} of a symbol`,
      );
    }
    if (
      sharedLength(line.segments, partnershipSegments, hops, underSymbol) > 1 ||
      sharedLength(
        line.segments,
        pieces
          .filter(
            (piece) =>
              !(
                line.owners.length > 1 &&
                piece.role === 'parentLink' &&
                line.owners.every((id) => piece.part.parentIds?.includes(id))
              ),
          )
          .map((piece) => piece.segment),
        [line.end, ...hops],
        underSymbol,
      ) > 1
    ) {
      faults.push(`${name} runs along another line`);
    }
  }
  // Where a line is last seen: where it meets the line of descent it joins,
  // or the top of the child it runs on into.
  const meetingOf = (line: OwnLine) =>
    line.child === undefined
      ? line.end
      : (line.line.points.find(
          (p) =>
            outsideSymbol(
              p,
              drawing.centre(line.child!),
              size,
              drawing.shapeOf(line.child!),
            ) < 0.5,
        ) ?? line.end);
  // Two lines. Lines of one owner leave the owner together, and may run on
  // as one course; once they part, they keep clear of each other like any
  // two lines.
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const [a, b] = [lines[i]!, lines[j]!];
      const sameOwners = a.owners.join() === b.owners.join();
      // Where both leave their owner: inside, or just outside, an owner's
      // symbol, or near the point on the partnership line they start at.
      const leaving = (p: Point) =>
        sameOwners &&
        (near(p, a.line.points[0]!, 0.3 * size) ||
          a.owners.some(
            (id) =>
              outsideSymbol(p, drawing.centre(id), size, drawing.shapeOf(id)) <
              0.3 * size,
          ));
      // Lines that meet at one point: on a line of descent (the donor
      // rule), or at the top of the child they converge on.
      if (
        near(meetingOf(a), meetingOf(b), 1) ||
        (a.child !== undefined && a.child === b.child)
      ) {
        continue;
      }
      // Where they cross, drawn as a hop, or where one joins the other to
      // be drawn as one line, they are not running close.
      const joinOf = (line: OwnLine) =>
        line.line.joinsAt === undefined
          ? []
          : [line.line.points[line.line.joinsAt]!];
      // Where two lines drawn as one part, at a corner of one on the
      // other, they meet at a point there as well.
      const partings = [
        ...b.line.points.filter((p) =>
          a.segments.some((t) => distanceToSegment(p, t) < 0.5),
        ),
        ...a.line.points.filter((p) =>
          b.segments.some((t) => distanceToSegment(p, t) < 0.5),
        ),
      ];
      const hops = [
        ...(a.line.hops ?? []),
        ...(b.line.hops ?? []),
        ...joinOf(a),
        ...joinOf(b),
        ...partings,
      ];
      // The longest stretch close beside, and the current one; a hop, or
      // where they meet, breaks a stretch.
      let closeRun = 0;
      let close = 0;
      for (const s of a.segments) {
        for (const { p, length } of samples(s)) {
          if (hops.some((h) => near(p, h, 0.3 * size)) || leaving(p)) {
            close = 0;
            continue;
          }
          // Inside the child's symbol, both lines are hidden.
          if (
            a.child !== undefined &&
            outsideSymbol(
              p,
              drawing.centre(a.child),
              size,
              drawing.shapeOf(a.child),
            ) < 0
          ) {
            continue;
          }
          const apart = Math.min(
            ...b.segments.map((t) => distanceToSegment(p, t)),
          );
          // On one course: constraint 3's.
          if (apart < 0.5) continue;
          close = apart < clearance - 0.25 ? close + length : 0;
          closeRun = Math.max(closeRun, close);
        }
      }
      if (closeRun > clearance) {
        faults.push(
          `${a.owners.join(' and ')}'s ${a.kind} line runs within a quarter of a symbol of ${b.owners.join(' and ')}'s ${b.kind} line for ${(closeRun / size).toFixed(2)} of a symbol`,
        );
      }
    }
  }
  return faults;
}

/**
 * Constraint 9, Crossings. Every crossing is drawn as a hop. No hop falls
 * at a junction, at a corner or inside a symbol. A line never crosses a
 * line of its own owner, or another line into the same child. No crossing
 * is exempted by kind or by family.
 */
function faultsOfCrossings(drawing: Drawing, family: Family): string[] {
  const { connectors, size } = drawing;
  const faults: string[] = [];
  const lines = ownLinesOf(connectors);
  const pieces = piecesOf(connectors);
  const inSymbol = (p: Point) =>
    family.people.some(
      (id) =>
        outsideSymbol(p, drawing.centre(id), size, drawing.shapeOf(id)) < 0,
    );
  const fixed: { segment: LineSegment; what: string; corners: Point[] }[] = [
    ...pieces.map((piece) => ({
      segment: piece.segment,
      what: `the line of descent from ${(piece.part.parentIds ?? []).join(' and ')}`,
      corners: [],
    })),
    ...connectors.groupLines.flatMap((line) =>
      [
        line.segment,
        ...(line.endpointSegments ?? []),
        ...(line.doubleSegment ? [line.doubleSegment] : []),
      ].map((segment) => ({
        segment,
        what: `the partnership line of ${(line.partnerIds ?? []).join(' and ')}`,
        corners: [],
      })),
    ),
    ...connectors.twinIndicators.flatMap((twin) =>
      twin.segment
        ? [{ segment: twin.segment, what: 'a twin mark', corners: [] }]
        : [],
    ),
  ];
  const ends = (s: LineSegment) => [
    { x: s.x1, y: s.y1 },
    { x: s.x2, y: s.y2 },
  ];
  // Every vertex of a line of descent or a partnership line: a crossing
  // there falls at a corner or junction.
  const vertices = fixed.flatMap((item) => ends(item.segment));
  const isHop = (line: OwnLine, at: Point) =>
    (line.line.hops ?? []).some((hop) => near(hop, at, 1));
  lines.forEach((line, i) => {
    const name = `${line.owners.join(' and ')}'s ${line.kind} line`;
    const ownVertices = line.line.points;
    for (const s of line.segments) {
      for (const item of fixed) {
        const at = crossingOf(s, item.segment);
        if (!at || inSymbol(at)) continue;
        if (!isHop(line, at)) {
          faults.push(`${name} crosses ${item.what} without a hop`);
        }
      }
      lines.forEach((other, j) => {
        if (j === i) return;
        for (const t of other.segments) {
          const at = crossingOf(s, t);
          if (!at || inSymbol(at)) continue;
          if (
            line.owners.some((id) => other.owners.includes(id)) ||
            (line.child !== undefined && line.child === other.child)
          ) {
            if (j > i) {
              faults.push(
                `${name} crosses ${other.owners.join(' and ')}'s ${other.kind} line, ${line.child !== undefined && line.child === other.child ? 'into the same child' : 'of its own owner'}`,
              );
            }
            continue;
          }
          if (j > i && !isHop(line, at) && !isHop(other, at)) {
            faults.push(
              `${name} crosses ${other.owners.join(' and ')}'s ${other.kind} line without a hop`,
            );
          }
        }
      });
    }
    const crossings = line.segments.flatMap((s) => [
      ...fixed.flatMap((item) => crossingOf(s, item.segment) ?? []),
      ...lines
        .filter((other) => other !== line)
        .flatMap((other) =>
          other.segments.flatMap((t) => crossingOf(s, t) ?? []),
        ),
    ]);
    for (const hop of line.line.hops ?? []) {
      if (!crossings.some((at) => near(at, hop, 1))) {
        faults.push(`${name} hops where nothing crosses`);
      }
      if (inSymbol(hop)) faults.push(`${name} hops inside a symbol`);
      const corners = [
        ...vertices,
        ...ownVertices,
        ...lines
          .filter((other) => other !== line)
          .flatMap((other) => other.line.points),
      ];
      if (corners.some((corner) => near(corner, hop, 0.1 * size))) {
        faults.push(`${name} hops at a corner or a junction`);
      }
    }
  });
  // Lines of descent and partnership lines are never drawn with hops, so
  // they never cross one another.
  for (let i = 0; i < fixed.length; i++) {
    for (let j = i + 1; j < fixed.length; j++) {
      const [a, b] = [fixed[i]!, fixed[j]!];
      if (a.what === b.what) continue;
      const at = crossingOf(a.segment, b.segment);
      if (at && !inSymbol(at)) {
        faults.push(
          `${a.what} crosses ${b.what}, which cannot be drawn as a hop`,
        );
      }
    }
  }
  return faults;
}

/** How many hops a drawing makes. */
export const hopCount = (connectors: PedigreeConnectors) =>
  connectors.auxiliaryLines.reduce(
    (total, line) => total + (line.hops?.length ?? 0),
    0,
  );

/** Whether two people share genes: one descends from the other, or both
 * from someone recorded. */
/** Whether `a` is a parent, of any kind, of `b` or of one of b's forebears. */
function forebear(family: Family, a: string, b: string): boolean {
  const found = new Set([b]);
  for (let grew = true; grew;) {
    grew = false;
    for (const tie of family.ties) {
      if (found.has(tie.child) && !found.has(tie.parent)) {
        found.add(tie.parent);
        grew = true;
      }
    }
  }
  return a !== b && found.has(a);
}

function bloodRelatives(family: Family, a: string, b: string): boolean {
  const ancestors = (id: string) => {
    const found = new Set([id]);
    for (let grew = true; grew;) {
      grew = false;
      for (const tie of family.ties) {
        const genetic = tie.kind === 'biological' || tie.kind === 'donor';
        if (genetic && found.has(tie.child) && !found.has(tie.parent)) {
          found.add(tie.parent);
          grew = true;
        }
      }
    }
    return found;
  };
  const ofB = ancestors(b);
  return [...ancestors(a)].some((id) => ofB.has(id));
}

/**
 * Constraint 10, Placement. Everyone sits at least one row below each of
 * their parents, whatever the kind. Partners share a row. Helpers share the
 * row of the child's descent owners, and sit next to the owners or next to
 * another helper of the same family (ruling 11, as restated 12 Oct 2026). A
 * sibship is contiguous, ordered by donor group. Twins sit together. Only
 * recorded partnerships get a partnership line.
 */
function faultsOfPlacement(drawing: Drawing, family: Family): string[] {
  const faults: string[] = [];
  const { connectors } = drawing;
  const descents = descentsOf(drawing);
  const row = (id: string) => drawing.centre(id).y;
  const x = (id: string) => drawing.centre(id).x;
  // Below each parent, whatever the kind — but a child raised by a relative
  // (a brother, an aunt, and whoever raises them with that relative) stays
  // on their row of birth, below their birth parents (ruling 18, widened):
  // the raising ties give no row of their own.
  const isRaising = (kind: TieKind) => kind === 'adoptive' || kind === 'social';
  for (const tie of family.ties) {
    if (row(tie.child) >= row(tie.parent) + 0.5) continue;
    const raisedByRelative =
      isRaising(tie.kind) &&
      family.ties.some(
        (other) =>
          other.child === tie.child &&
          isRaising(other.kind) &&
          bloodRelatives(family, other.parent, tie.child),
      );
    if (!raisedByRelative) {
      faults.push(`${tie.child} does not sit below their parent ${tie.parent}`);
    }
  }
  for (const [a, b] of family.partnerships) {
    if (Math.abs(row(a) - row(b)) > 0.5) {
      faults.push(`partners ${a} and ${b} do not share a row`);
    }
  }
  for (const line of connectors.groupLines) {
    const [a, b] = line.partnerIds ?? [];
    if (a !== undefined && b !== undefined && !partnered(family, a, b)) {
      faults.push(`${a} and ${b} are drawn as partners, unrecorded`);
    }
  }
  for (const [a, b] of family.twins) {
    const between = family.people.filter(
      (id) =>
        Math.abs(row(id) - row(a)) < 0.5 &&
        x(id) > Math.min(x(a), x(b)) + 0.5 &&
        x(id) < Math.max(x(a), x(b)) - 0.5,
    );
    if (Math.abs(row(a) - row(b)) > 0.5 || between.length > 0) {
      faults.push(`twins ${a} and ${b} do not sit together`);
    }
  }
  // Helpers beside the descent owners: between them, only the child's
  // other parents, and the partners of anyone already between.
  for (const tie of family.ties) {
    if (tie.kind !== 'donor' && tie.kind !== 'surrogate') continue;
    const descent = descentOfChild(descents, tie.child);
    if (!descent || descent.parents.includes(tie.parent)) continue;
    const owners = descent.parents;
    // The first placement rule comes first: a helper who is a forebear or a
    // descendant of an owner keeps the rows their own ties give them.
    const lineage = owners.some(
      (id) =>
        forebear(family, tie.parent, id) || forebear(family, id, tie.parent),
    );
    if (owners.some((id) => Math.abs(row(id) - row(tie.parent)) > 0.5)) {
      if (!lineage) {
        faults.push(
          `${tie.parent} does not share the row of ${tie.child}'s descent owners`,
        );
      }
      continue;
    }
    const nearest = owners.toSorted(
      (a, b) => Math.abs(x(a) - x(tie.parent)) - Math.abs(x(b) - x(tie.parent)),
    )[0]!;
    const between = family.people.filter(
      (id) =>
        Math.abs(row(id) - row(tie.parent)) < 0.5 &&
        x(id) > Math.min(x(nearest), x(tie.parent)) + 0.5 &&
        x(id) < Math.max(x(nearest), x(tie.parent)) - 0.5,
    );
    // Next to the owners, or next to another helper of the same family:
    // between them sit only parents of the family's children.
    const allowed = new Set(
      family.ties
        .filter((other) => descent.children.includes(other.child))
        .map((other) => other.parent),
    );
    for (let grew = true; grew;) {
      grew = false;
      for (const [a, b] of family.partnerships) {
        for (const [p, q] of [
          [a, b],
          [b, a],
        ] as const) {
          if (allowed.has(p) && !allowed.has(q) && between.includes(q)) {
            allowed.add(q);
            grew = true;
          }
        }
      }
    }
    for (const id of between) {
      if (!allowed.has(id)) {
        faults.push(
          `${id} sits between ${tie.parent} and ${tie.child}'s descent owners, and is no parent of their family`,
        );
      }
    }
  }
  faults.push(...faultsOfSiblingGrouping(drawing, family));
  return faults;
}

/** Siblings who share their donors and surrogates sit side by side: the
 * children of each set of donors are one run of their sibship. */
function faultsOfSiblingGrouping(drawing: Drawing, family: Family): string[] {
  const descents = descentsOf(drawing);
  const donorsOf = (id: string) =>
    family.ties
      .filter(
        (tie) =>
          tie.child === id &&
          (tie.kind === 'donor' || tie.kind === 'surrogate'),
      )
      .map((tie) => `${tie.parent}:${tie.kind}`)
      .toSorted()
      .join(',');
  const faults: string[] = [];
  for (const descent of descents) {
    const siblings = siblingsOf(drawing, descents, descent.children[0]!);
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
  }
  return faults;
}

/**
 * Constraint 11, Kinds. Each tie's kind is shown, in its own style, on the
 * pieces that carry that tie alone. A shared bar may be solid with a dashed
 * line up.
 */
function faultsOfKinds(drawing: Drawing, family: Family): string[] {
  const faults: string[] = [];
  const descents = descentsOf(drawing);
  for (const descent of descents) {
    if (!descent.drawn) continue;
    for (const part of descent.parts) {
      for (const child of part.uplineChildIds ?? []) {
        if (child === undefined) continue;
        // Birth ties are drawn solid, raising ties dashed (one dash for
        // both, ruling 14).
        const solid = isBirthKind(part.edgeType);
        for (const parent of descent.parents) {
          const kinds = tiesOf(family, parent, child);
          if (!kinds.some((kind) => isBirthKind(kind) === solid)) {
            faults.push(
              `${child}'s line up is drawn ${part.edgeType}, but ${parent}'s tie to them is ${kinds.join(', ') || 'none'}`,
            );
          }
        }
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

/** Every hard constraint, over a whole drawing. */
export function strictLineFaults(drawing: Drawing, family: Family): string[] {
  return [
    ...faultsOfReach(drawing, family),
    ...faultsOfOrigin(drawing, family),
    ...faultsOfJoining(drawing, family),
    ...faultsOfTarget(drawing, family),
    ...faultsOfStraightness(drawing, family),
    ...faultsOfRuns(drawing, family),
    ...faultsOfJunctions(drawing, family),
    ...faultsOfOrder(drawing, family),
    ...faultsOfClearance(drawing, family),
    ...faultsOfCrossings(drawing, family),
    ...faultsOfPlacement(drawing, family),
    ...faultsOfKinds(drawing, family),
    ...faultsOfRunBars(drawing),
  ].filter((fault, k, all) => all.indexOf(fault) === k);
}
