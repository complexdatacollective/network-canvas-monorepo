import {
  BRACKET_REACH,
  crossing,
  type DrawnLine,
  type From,
  courseCost,
  courseCosts,
  ownerXOf,
  peopleOf,
  JUNCTION_CLEARANCE,
  LINE_CLEARANCE,
  barPoints,
  symbolTop,
  type RouteEnd,
  routeLine,
  routeOptions,
  runOnInside,
  type RoutingScene,
  type RoutingWork,
  segmentsOf,
  symbolOf,
} from './auxiliaryRouting';
import {
  type ChildLines,
  isBirthTie,
  type LineOwner,
  lineOwnersOf,
  ownerKey,
} from './lineOwners';
import type {
  AuxiliaryConnector,
  DuplicateArc,
  LineSegment,
  ParentChildConnector,
  ParentConnection,
  ParentGroupConnector,
  PartnerConnection,
  PedigreeConnectors,
  PedigreeLayout,
  Point,
  ScalingParams,
  SibshipRun,
  TwinIndicator,
  PedigreeEdgeType,
  PedigreeSymbolShape,
} from './types';
import { areConsanguineous, inOrder, recordedKind } from './utils';

/** The height of the question mark between twins of unknown zygosity, as a
 * fraction of a symbol's height. */
const TWIN_LABEL_SIZE = 0.3;

/** How far above the children's row a run's sub-bar runs, as a fraction of
 * the leg from the sibling bar down to the row. */
const SUB_BAR_RISE = 0.2;
/** How long a run's stem is, at least, as a fraction of a symbol's height:
 * long enough for a line crossing the bar above to reach a run inside it
 * clear of both bars. */
const RUN_STEM = 2 * LINE_CLEARANCE;
/** How much of the gap between the parents' row and the children's a
 * sibship's bar may be raised into, at most, to give its runs' stems room. */
const MAX_LEG_SHARE = 0.8;

/** A run of a sibship (see `forkRuns` in `computeConnectors`). */
type SibshipRunPlan = {
  id: string;
  /** The children, by their place among the sibship's columns. */
  ks: number[];
  columns: number[];
  /** The owners of the birth lines that meet the run's line of descent
   * (see `lineKeyOf`). */
  helpers: Set<string>;
  /** The stem: the run's line of descent from the sibling bar (`topY`) down
   * to its sub-bar (`bottomY`). For one child, the top of their own line
   * up, once it is known. */
  stemX: number;
  topY: number;
  bottomY: number;
  /** The stem and sub-bar drawn for a run of two or more. */
  drawn?: SibshipRun;
};

/** Where a line joining its children's line of descent may end, best
 * first. */
type Join = {
  points: (towardX: number) => Point[];
  /** The one child it reaches: on their top, or the top of their line up. */
  reaches?: number;
};
const pointJoin = (p: Point, reaches?: number): Join => ({
  points: () => [p],
  ...(reaches === undefined ? {} : { reaches }),
});

/**
 * Compute connector geometry for rendering a pedigree.
 *
 * Produces abstract line segments and paths — no SVG or canvas dependency.
 *
 * @param layout - pedigree layout (positions, families, groups, twins)
 * @param scaling - box sizing and scale factors
 * @param parents - parent connections for edge type info
 * @param activePartnerPairs - set of "min,max" keys for active partner pairs.
 *   A recorded partnership that is not active (see `partnerPairs`) is drawn
 *   with a relationship break mark. When omitted, all group lines are treated
 *   as active (backwards-compatible default).
 * @param branch - branch style for parent-child links (0=diagonal shoulder,
 *   otherwise right-angled: a drop, a level run and a drop). Default 0.6
 * @param pconnect - where parent link meets sibling bar (0-1). Default 0.5
 * @param partnerPairs - all recorded partner pairs. Used to route recorded
 *   partnerships that the adjacent-node layout cannot encode directly.
 * @param shapes - each person's symbol shape, by index, so that lines meet
 *   the symbols' edges. When omitted, lines end where they would meet any
 *   shape.
 */
export function computeConnectors(
  ...args: Parameters<typeof routePedigree>
): PedigreeConnectors {
  return routePedigree(...args).connectors;
}

/** The indexes of `costs`, the cheapest first. */
const cheapestFirst = (costs: number[]) =>
  costs.map((_, k) => k).toSorted((x, y) => costs[x]! - costs[y]! || x - y);

/**
 * The connectors (see `computeConnectors`), and what their routed lines
 * cost the drawing, the cost every line's course is chosen by (see
 * `courseCost`), each meeting of two lines counted once: what a seating
 * costs once drawn.
 */
export function routePedigree(
  layout: PedigreeLayout,
  scaling: ScalingParams,
  parents: ParentConnection[][],
  activePartnerPairs?: Set<string>,
  branch = 0.6,
  pconnect = 0.5,
  nodeNames?: string[],
  id?: string[],
  partnerPairs?: Set<string>,
  shapes?: (PedigreeSymbolShape | undefined)[],
  /** How widely the lines' courses are searched: from one order of the
   * lines, or from several (see below). */
  search: 'quick' | 'thorough' = 'thorough',
  /** How much the search of the lines' courses may do past each line's
   * first routing (see `RoutingWork`); unbounded without it. */
  searchWork?: RoutingWork,
): { connectors: PedigreeConnectors; cost: number } {
  const {
    boxWidth: boxw,
    boxHeight: boxh,
    legHeight: legh,
    cornerRadius,
  } = scaling;
  const maxlev = layout.nid.length;
  const maxcol = Math.max(...layout.n, 0);

  const groupLines: ParentGroupConnector[] = [];
  const groupLineIndex = new Map<string, number>();
  const parentChildLines: ParentChildConnector[] = [];
  const auxiliaryLines: AuxiliaryConnector[] = [];
  const twinIndicators: TwinIndicator[] = [];
  const duplicateArcs: DuplicateArc[] = [];
  const renderedPartnerPairs = new Set<string>();
  // Only a recorded partnership is drawn with a partnership line. Co-parents
  // the layout seats side by side without one are joined by no line at
  // their symbols: their children's line of descent comes down from each of
  // them, the two lines joining into one below their row, so nothing reads
  // as a partnership and no line starts from the empty space between them.
  // (With no recorded partnerships given, every pair the layout makes is
  // taken to be one.)
  const isRecordedPartnership = (pairKey: string) =>
    partnerPairs === undefined || partnerPairs.has(pairKey);
  // Only a recorded former partnership is drawn with the break.
  const isFormerPartnership = (pairKey: string) =>
    activePartnerPairs !== undefined &&
    !activePartnerPairs.has(pairKey) &&
    isRecordedPartnership(pairKey);
  const nodeLocation = new Map<
    number,
    { layer: number; x: number; y: number }
  >();
  /** An adopted person is drawn within brackets. */
  // An adopted person, as recorded (carrying does not undo an adoption).
  const isBracketed = (personIndex: number) =>
    (parents[personIndex] ?? []).some((p) => recordedKind(p) === 'adoptive');

  const placeOf = new Map<number, { layer: number; col: number }>();
  for (let layer = 0; layer < maxlev; layer++) {
    for (let col = 0; col < (layout.n[layer] ?? 0); col++) {
      const personIndex = layout.nid[layer]![col]!;
      if (nodeLocation.has(personIndex)) continue;
      placeOf.set(personIndex, { layer, col });
      nodeLocation.set(personIndex, {
        layer,
        x: layout.pos[layer]![col]!,
        y: layer + boxh / 2,
      });
    }
  }

  // Who each child's lines come from, from the partnerships recorded (with
  // none given, every couple the layout seats together, as above).
  const recordedPartners: PartnerConnection[] = partnerPairs
    ? [...partnerPairs].map((pairKey) => {
        const [a, b] = pairKey.split(',').map(Number) as [number, number];
        return { partnerIndex1: a, partnerIndex2: b, isActive: true };
      })
    : layout.group.flatMap((row, layer) =>
        row.flatMap((marker, col) =>
          marker > 0
            ? [
                {
                  partnerIndex1: layout.nid[layer]![col]!,
                  partnerIndex2: layout.nid[layer]![col + 1]!,
                  isActive: true,
                },
              ]
            : [],
        ),
      );
  const owners: ChildLines[] = lineOwnersOf(parents, recordedPartners);
  const descentOwnerOf = (personIndex: number) => owners[personIndex]?.descent;
  /** A line's owner and kind, as a key: one line per owner and kind. */
  const lineKeyOf = (owner: LineOwner) => `${ownerKey(owner)}:${owner.kind}`;

  // --- Parent group lines (all partner pairs, marked active/inactive) ---
  for (let i = 0; i < maxlev; i++) {
    const tempy = i + boxh / 2;
    for (let j = 0; j < maxcol; j++) {
      if (layout.group[i]?.[j] && layout.group[i]![j]! > 0) {
        const leftId = layout.nid[i]![j]!;
        const rightId = layout.nid[i]![j + 1]!;
        const pairKey = `${Math.min(leftId, rightId)},${Math.max(leftId, rightId)}`;
        if (!isRecordedPartnership(pairKey)) continue;

        const isActive = !isFormerPartnership(pairKey);

        // The line stops at an adopted partner's bracket rather than
        // running through it.
        const endsAtBracket: [boolean, boolean] = [
          isBracketed(leftId),
          isBracketed(rightId),
        ];
        const toBracket = boxw * (0.5 + BRACKET_REACH);
        const x1 = layout.pos[i]![j]! + (endsAtBracket[0] ? toBracket : 0);
        const x2 = layout.pos[i]![j + 1]! - (endsAtBracket[1] ? toBracket : 0);
        const segment: LineSegment = {
          type: 'line',
          x1,
          y1: tempy,
          x2,
          y2: tempy,
        };

        const isDouble = layout.group[i]![j] === 2;

        const leftPersonIndex = layout.nid[i]![j]!;
        const rightPersonIndex = layout.nid[i]![j + 1]!;
        const partnerIds: [string, string] | undefined = id
          ? [id[leftPersonIndex] ?? '', id[rightPersonIndex] ?? '']
          : undefined;
        const connector: ParentGroupConnector = {
          type: 'parent-group',
          segment,
          double: isDouble,
          isActive,
          ...(partnerIds ? { partnerIds } : {}),
          ...(endsAtBracket.some(Boolean) ? { endsAtBracket } : {}),
        };

        // For inactive lines, determine which side to place the slash:
        if (!isActive) {
          if (nodeNames) {
            const rightName = nodeNames[rightId] ?? '';
            connector.slashSide = rightName.length === 0 ? 'right' : 'left';
          } else {
            connector.slashSide = 'left';
          }
        }

        if (isDouble) {
          connector.doubleSegment = {
            type: 'line',
            x1,
            y1: tempy + boxh / 10,
            x2,
            y2: tempy + boxh / 10,
          };
        }

        groupLineIndex.set(`${i},${j}`, groupLines.length);
        groupLines.push(connector);
        renderedPartnerPairs.add(pairKey);
      }
    }
  }

  // Each recorded partnership routed above its partners' shared row, by pair
  // key: the line a child of the couple descends from.
  const routedCouples = new Map<
    string,
    {
      connector: ParentGroupConnector;
      layer: number;
      /** The partners, left then right. */
      members: [number, number];
    }
  >();

  // A node can be horizontally adjacent to at most two partners. Preserve any
  // additional recorded partnerships with a routed connector above the row,
  // rather than silently dropping the edge or connecting the two neighbouring
  // partners to one another. Partners on different rows (one partnered with
  // their own grandchild, say) are routed above the higher partner's row,
  // down a lane clear of everyone on the rows it crosses, and into the lower
  // partner from above their row.
  //
  // A routed line runs in the strip between a row's sibling bars and the tops
  // of its symbols, which only vertical lines cross, so it never runs along
  // or at the height of a sibling bar or a line of descent. It rises from
  // each partner beside their centre, where their own line up to their
  // parents runs, on a stem of its own for each of their routed partnerships.
  if (partnerPairs) {
    // The lanes, as fractions of the strip above a row's symbols measured up
    // from their tops, keep clear of the twin marks at its middle.
    const LANES = [0.3, 0.72, 0.18, 0.84, 0.4, 0.6];
    const routedCountByLayer = new Map<number, number>();
    const stemCountBySide = new Map<string, number>();
    // Shorter lines take the lower lanes, so lines nest rather than cross.
    const routedPairs = inOrder(
      [...partnerPairs]
        .filter((pairKey) => !renderedPartnerPairs.has(pairKey))
        .map((pairKey) => {
          const [first, second] = pairKey.split(',').map(Number);
          const firstLocation =
            first === undefined ? undefined : nodeLocation.get(first);
          const secondLocation =
            second === undefined ? undefined : nodeLocation.get(second);
          return { pairKey, first, second, firstLocation, secondLocation };
        }),
      (a, b) => {
        const span = (pair: typeof a) =>
          pair.firstLocation && pair.secondLocation
            ? Math.abs(pair.firstLocation.x - pair.secondLocation.x) +
              Math.abs(pair.firstLocation.layer - pair.secondLocation.layer)
            : 0;
        return span(a) - span(b);
      },
    );

    for (const {
      pairKey,
      first,
      second,
      firstLocation,
      secondLocation,
    } of routedPairs) {
      if (first === undefined || second === undefined) continue;
      if (!firstLocation || !secondLocation) continue;

      const [leftIndex, left, rightIndex, right] =
        firstLocation.x <= secondLocation.x
          ? [first, firstLocation, second, secondLocation]
          : [second, secondLocation, first, firstLocation];
      const routeAbove = (layer: number) => {
        const routeIndex = routedCountByLayer.get(layer) ?? 0;
        routedCountByLayer.set(layer, routeIndex + 1);
        const lane =
          LANES[routeIndex % LANES.length]! +
          0.03 * Math.floor(routeIndex / LANES.length);
        return layer - legh * lane;
      };
      // A partner's stem toward the other partner, offset from their centre
      // by an amount of its own.
      const stemX = (
        personIndex: number,
        location: { x: number },
        towardX: number,
      ) => {
        const side = towardX < location.x ? -1 : 1;
        const key = `${personIndex},${side}`;
        const stem = stemCountBySide.get(key) ?? 0;
        stemCountBySide.set(key, stem + 1);
        // Far enough from the middle, where the line up to their parents
        // leaves, to read as a line of its own.
        return location.x + side * boxw * Math.min(0.28 + 0.1 * stem, 0.45);
      };
      const [upperIndex, upper, lowerIndex, lower] =
        left.layer <= right.layer
          ? [leftIndex, left, rightIndex, right]
          : [rightIndex, right, leftIndex, left];
      const routeY = routeAbove(upper.layer);
      const upperX = stemX(upperIndex, upper, lower.x);
      const lowerX = stemX(lowerIndex, lower, upper.x);
      // The vertical x nearest the lower partner that no one on the rows
      // from the upper partner's down to the lower partner's sits across.
      let laneX = lowerX;
      if (upper.layer !== lower.layer) {
        const blocked = [...nodeLocation.values()]
          .filter((loc) => loc.layer >= upper.layer && loc.layer < lower.layer)
          .map((loc) => loc.x);
        const clearance = boxw / 2 + 0.1;
        const isClear = (x: number) =>
          blocked.every((bx) => Math.abs(bx - x) >= clearance);
        for (let step = 0; !isClear(laneX); step++) {
          const offset = Math.ceil((step + 1) / 2) * 0.25;
          laneX = lowerX + (step % 2 === 0 ? offset : -offset);
        }
      }
      const lowerRouteY = laneX === lowerX ? routeY : routeAbove(lower.layer);
      const endpointSegments: LineSegment[] = [
        { type: 'line', x1: upperX, y1: upper.y, x2: upperX, y2: routeY },
      ];
      if (laneX !== lowerX) {
        endpointSegments.push(
          { type: 'line', x1: laneX, y1: routeY, x2: laneX, y2: lowerRouteY },
          {
            type: 'line',
            x1: laneX,
            y1: lowerRouteY,
            x2: lowerX,
            y2: lowerRouteY,
          },
        );
      }
      endpointSegments.push({
        type: 'line',
        x1: lowerX,
        y1: lower.y,
        x2: lowerX,
        y2: lowerRouteY,
      });
      const [segmentLeftX, segmentRightX] =
        upper.layer === lower.layer
          ? [Math.min(upperX, lowerX), Math.max(upperX, lowerX)]
          : [Math.min(upperX, laneX), Math.max(upperX, laneX)];

      const isDouble = areConsanguineous(leftIndex, rightIndex, parents);
      const connector: ParentGroupConnector = {
        type: 'parent-group',
        segment: {
          type: 'line',
          x1: segmentLeftX,
          y1: routeY,
          x2: segmentRightX,
          y2: routeY,
        },
        endpointSegments,
        double: isDouble,
        isActive: !isFormerPartnership(pairKey),
        ...(isDouble
          ? {
              doubleSegment: {
                type: 'line',
                x1: segmentLeftX,
                y1: routeY + boxh / 10,
                x2: segmentRightX,
                y2: routeY + boxh / 10,
              } satisfies LineSegment,
            }
          : {}),
        ...(id
          ? {
              partnerIds: [id[leftIndex] ?? '', id[rightIndex] ?? ''] as [
                string,
                string,
              ],
            }
          : {}),
      };

      if (!connector.isActive && nodeNames) {
        connector.slashSide =
          (nodeNames[rightIndex] ?? '').length === 0 ? 'right' : 'left';
      }

      groupLines.push(connector);
      renderedPartnerPairs.add(pairKey);
      if (upper.layer === lower.layer) {
        routedCouples.set(pairKey, {
          connector,
          layer: upper.layer,
          members: [leftIndex, rightIndex],
        });
      }
    }
  }

  // The sibling bar, uplines and twin marks of the children at whoIdx on
  // level i (the twin marks are recorded as they are found).
  const sibshipLines = (i: number, whoIdx: number[]) => {
    // Compute targets (twin grouping)
    let target: number[];
    if (!layout.twins) {
      target = whoIdx.map((j) => layout.pos[i]![j]!);
    } else {
      // A twin code is kept at the left twin's column; each child after the
      // first is a twin of the one to their left when it is set there.
      const twinToLeft: number[] = [0];
      for (let k = 1; k < whoIdx.length; k++) {
        const left = whoIdx[k - 1]!;
        twinToLeft.push(
          left === whoIdx[k]! - 1 ? (layout.twins[i]?.[left] ?? 0) : 0,
        );
      }
      const groups: number[] = [];
      let groupId = 0;
      for (const ttl of twinToLeft) {
        if (ttl === 0) groupId++;
        groups.push(groupId);
      }

      const groupMeans = new Map<number, number[]>();
      for (let k = 0; k < groups.length; k++) {
        const g = groups[k]!;
        if (!groupMeans.has(g)) groupMeans.set(g, []);
        groupMeans.get(g)!.push(layout.pos[i]![whoIdx[k]!]!);
      }
      const meanMap = new Map<number, number>();
      for (const [g, positions] of groupMeans) {
        meanMap.set(g, positions.reduce((a, b) => a + b, 0) / positions.length);
      }

      target = groups.map((g) => meanMap.get(g)!);
    }

    // Uplines: from each child to sibling bar
    const uplines: LineSegment[] = [];
    for (let k = 0; k < whoIdx.length; k++) {
      const childX = layout.pos[i]![whoIdx[k]!]!;
      uplines.push({
        type: 'line',
        x1: childX,
        y1: i + boxh / 2,
        x2: target[k]!,
        y2: i - legh,
      });
    }

    // Sibling bar
    const minTarget = Math.min(...target);
    const maxTarget = Math.max(...target);
    const siblingBar: LineSegment = {
      type: 'line',
      x1: minTarget,
      y1: i - legh,
      x2: maxTarget,
      y2: i - legh,
    };

    return { uplines, siblingBar, minTarget, maxTarget };
  };

  // The runs each child is in (keyed "level,column"), outermost first: the
  // children beside them who share a donor or surrogate the rest of the
  // sibship does not. Those donors' lines meet the run's line of descent:
  // the stem of its sub-bar, or a lone child's line up.
  const runsOfChild = new Map<string, SibshipRunPlan[]>();
  // The top of each child's line up (keyed "level,column"), where it leaves
  // their sibling bar or their run's sub-bar.
  const uplineTops = new Map<string, Point>();
  // The owners of the lines that join the line of descent of the child at
  // column j on level i (see `lineKeyOf`): birth lines, into a line of
  // descent that carries birth ties. None for a sibship drawn with no line
  // of descent (`withHelpers` false).
  let withHelpers = true;
  const helpersAt = (i: number, j: number) => {
    const child = layout.nid[i]![j]!;
    const { descent, lines } = owners[child] ?? { lines: [] };
    if (!withHelpers || !descent || !isBirthTie(descent.kind)) return [];
    return lines.filter((owner) => isBirthTie(owner.kind)).map(lineKeyOf);
  };
  // The sibship at `columns` on level i forked into its runs: for each donor
  // or surrogate who is not every child's, the children they gave to (or
  // carried) beside one another (no one sitting between them) with the same
  // style of line; donors who gave to the same children share a run. Where
  // one donor gave to some of another's children, the smaller run hangs
  // inside the larger: from its sub-bar, on a stem of its own. A run of two
  // or more children hangs from a sub-bar on a stem down from the sibling
  // bar (or the sub-bar of the run it is inside); their uplines are made to
  // end on the sub-bar. The gap below the bar is shared out between the
  // levels of runs, the bar raised where it is too short for each stem to
  // be `RUN_STEM` long. A stem keeps clear of `avoidX`, where the line of
  // descent meets the bar, and a run inside another clear of that one's
  // stem. Returns the runs, where each child's line meets the sibling bar,
  // the bar, and the height of the bar.
  const forkRuns = (
    i: number,
    columns: number[],
    uplines: LineSegment[],
    styleOf: (k: number) => string,
    avoidX?: number,
  ) => {
    const sets = columns.map((j) => helpersAt(i, j));
    const common = new Set(
      (sets[0] ?? []).filter((h) => sets.every((set) => set.includes(h))),
    );
    const targets = uplines.map((upline) => upline.x2);
    // Each helper's children, in stretches side by side.
    type Stretch = { ks: number[]; helpers: string[] };
    const candidates: Stretch[] = [];
    for (const helper of new Set(sets.flat())) {
      if (common.has(helper)) continue;
      let stretch: number[] = [];
      const close = () => {
        if (stretch.length > 0)
          candidates.push({ ks: stretch, helpers: [helper] });
        stretch = [];
      };
      sets.forEach((set, k) => {
        if (!set.includes(helper)) return;
        const last = stretch.at(-1);
        if (
          last !== undefined &&
          !(
            last === k - 1 &&
            columns[k] === columns[last]! + 1 &&
            styleOf(last) === styleOf(k)
          )
        ) {
          close();
        }
        stretch.push(k);
      });
      close();
    }
    // Twins hang from one point, so a run holds every twin of its children
    // or is no run (its donors' lines then end on each child).
    const holdsTwins = ({ ks }: Stretch) =>
      ks.every((k) =>
        targets.every(
          (t, other) => Math.abs(t - targets[k]!) > 1e-9 || ks.includes(other),
        ),
      );
    // The runs: each inside another or apart from it. A stretch overlapping
    // a run without being inside it is cut where that run ends, and its
    // donors reach each part by a line of its own (Josh, 12 Oct 2026: the
    // helper with more children, or the first recorded, keeps the run).
    const kept: Stretch[] = [];
    const queue = candidates.filter(holdsTwins);
    const bySize = (a: Stretch, b: Stretch) =>
      b.ks.length - a.ks.length || a.ks[0]! - b.ks[0]!;
    queue.splice(0, queue.length, ...inOrder(queue, bySize));
    while (queue.length > 0) {
      const stretch = queue.shift()!;
      const same = kept.find((run) => run.ks.join() === stretch.ks.join());
      if (same) {
        same.helpers.push(...stretch.helpers);
        continue;
      }
      const crossed = kept.find((run) => {
        const shared = stretch.ks.filter((k) => run.ks.includes(k)).length;
        return (
          shared > 0 && shared < stretch.ks.length && shared < run.ks.length
        );
      });
      if (!crossed) {
        kept.push({ ks: [...stretch.ks], helpers: [...stretch.helpers] });
        continue;
      }
      const inside = stretch.ks.filter((k) => crossed.ks.includes(k));
      const outside = stretch.ks.filter((k) => !crossed.ks.includes(k));
      queue.push(
        { ks: inside, helpers: stretch.helpers },
        { ks: outside, helpers: stretch.helpers },
      );
      queue.splice(0, queue.length, ...inOrder(queue, bySize));
    }
    const runs: SibshipRunPlan[] = kept.map((run) => ({
      id: `${i},${columns[run.ks[0]!]},${columns[run.ks.at(-1)!]}`,
      ks: run.ks,
      columns: run.ks.map((k) => columns[k]!),
      helpers: new Set(run.helpers),
      stemX: targets[run.ks[0]!]!,
      topY: 0,
      bottomY: 0,
    }));
    const forked = inOrder(
      runs.filter((run) => run.ks.length > 1),
      (a, b) => b.ks.length - a.ks.length,
    );
    const parentOf = new Map<SibshipRunPlan, SibshipRunPlan>();
    for (const run of runs) {
      const around = inOrder(
        forked.filter(
          (other) =>
            other.ks.length > run.ks.length &&
            run.ks.every((k) => other.ks.includes(k)),
        ),
        (a, b) => a.ks.length - b.ks.length,
      )[0];
      if (around) parentOf.set(run, around);
    }
    const insideOf = (run: SibshipRunPlan) =>
      forked.filter((other) => parentOf.get(other) === run);
    // How many levels of stems hang from a run's bar down to its children.
    const depth = (run: SibshipRunPlan): number =>
      1 + Math.max(0, ...insideOf(run).map(depth));
    const outermost = forked.filter((run) => !parentOf.has(run));
    const rise = legh * SUB_BAR_RISE;
    const leg = Math.min(
      Math.max(
        legh,
        ...outermost.map((run) => depth(run) * RUN_STEM * boxh + rise),
      ),
      Math.max(legh, MAX_LEG_SHARE * (1 - boxh)),
    );
    const barY = i - leg;
    // Each run's stem from the bar above it, the gap down to the sub-bars
    // above the children shared evenly between the levels on the way.
    const place = (run: SibshipRunPlan, topY: number) => {
      run.topY = topY;
      run.bottomY = topY + (i - rise - topY) / depth(run);
      for (const other of insideOf(run)) place(other, run.bottomY);
    };
    for (const run of outermost) place(run, barY);
    // Stems, sub-bars and the children's lines up, outermost runs first.
    const joinOf = [...targets];
    for (let k = 0; k < uplines.length; k++) {
      uplines[k] = { ...uplines[k]!, y2: barY };
    }
    for (const run of forked) {
      const xs = run.ks.map((k) => targets[k]!);
      const [from, to] = [Math.min(...xs), Math.max(...xs)];
      const clearance = JUNCTION_CLEARANCE * boxw;
      const avoid = parentOf.get(run)?.stemX ?? avoidX;
      let stemX = (from + to) / 2;
      if (avoid !== undefined && Math.abs(stemX - avoid) < clearance) {
        stemX =
          inOrder(
            [avoid - clearance, avoid + clearance].filter(
              (x) => x >= from - 1e-9 && x <= to + 1e-9,
            ),
            (a, b) => Math.abs(a - stemX) - Math.abs(b - stemX),
          )[0] ?? stemX;
      }
      run.stemX = stemX;
    }
    for (const run of forked) {
      // The sub-bar spans what hangs from it: the children's own lines up,
      // and the stems of the runs inside it in place of their children's.
      const xs = run.ks.map(
        (k) =>
          insideOf(run).find((inner) => inner.ks.includes(k))?.stemX ??
          targets[k]!,
      );
      const [from, to] = [Math.min(...xs), Math.max(...xs)];
      const { topY, bottomY, stemX } = run;
      for (const k of run.ks) {
        uplines[k] = { ...uplines[k]!, y2: bottomY };
        if (!parentOf.has(run)) joinOf[k] = stemX;
      }
      run.drawn = {
        stem: { type: 'line', x1: stemX, y1: topY, x2: stemX, y2: bottomY },
        ...(to - from > 1e-9
          ? {
              bar: {
                type: 'line',
                x1: from,
                y1: bottomY,
                x2: to,
                y2: bottomY,
              } satisfies LineSegment,
            }
          : {}),
      };
    }
    // A run of one child: the top of their line up.
    for (const run of runs) {
      if (run.ks.length > 1) continue;
      const upline = uplines[run.ks[0]!]!;
      run.stemX = upline.x2;
      run.topY = upline.y2;
      run.bottomY = upline.y2;
    }
    const minTarget = Math.min(...joinOf);
    const maxTarget = Math.max(...joinOf);
    const siblingBar: LineSegment = {
      type: 'line',
      x1: minTarget,
      y1: barY,
      x2: maxTarget,
      y2: barY,
    };
    const register = () => {
      columns.forEach((j, k) => {
        uplineTops.set(`${i},${j}`, {
          x: uplines[k]!.x2,
          y: uplines[k]!.y2,
        });
        const chain = inOrder(
          runs.filter((run) => run.ks.includes(k)),
          (a, b) => b.ks.length - a.ks.length,
        );
        if (chain.length > 0) runsOfChild.set(`${i},${j}`, chain);
      });
    };
    return {
      runs,
      joinOf,
      siblingBar,
      minTarget,
      maxTarget,
      register,
      leg,
    };
  };
  // The drawn runs among the children `ks` of a sibship.
  const drawnRuns = (runs: SibshipRunPlan[], ks: number[]) => {
    const drawn = runs.flatMap((run) =>
      run.drawn && run.ks.every((k) => ks.includes(k)) ? [run.drawn] : [],
    );
    return drawn.length > 0 ? { runs: drawn } : {};
  };

  // A point on a partnership line routed above the parents' row (`layer`)
  // that a line of descent can drop from, near `target` but clear of
  // everyone on the row and of every partnership line drawn between
  // two people sitting side by side, where the drop would read as that
  // couple's. Undefined when the routed line has no such point.
  const routedDescentX = (
    line: ParentGroupConnector,
    layer: number,
    target: number,
  ): number | undefined => {
    const from = Math.min(line.segment.x1, line.segment.x2);
    const to = Math.max(line.segment.x1, line.segment.x2);
    const row = (layout.pos[layer] ?? []).slice(0, layout.n[layer] ?? 0);
    const clearance = boxw / 2 + 0.05;
    const inCoupleGap = (x: number) =>
      row.some(
        (px, j) =>
          j + 1 < row.length &&
          (layout.group[layer]?.[j] ?? 0) > 0 &&
          x > px &&
          x < row[j + 1]!,
      );
    const isClear = (x: number) =>
      x >= from - 1e-9 &&
      x <= to + 1e-9 &&
      row.every((px) => Math.abs(px - x) >= clearance - 1e-9) &&
      !inCoupleGap(x);
    // The point under the target if it is clear; failing that, the middle
    // of a gap between two people; failing that, just clear of someone.
    const nearest = (candidates: number[]) =>
      inOrder(
        candidates.filter(isClear),
        (a, b) => Math.abs(a - target) - Math.abs(b - target),
      )[0];
    return (
      nearest([Math.max(from, Math.min(to, target))]) ??
      nearest(row.slice(1).map((px, j) => (row[j]! + px) / 2)) ??
      nearest(row.flatMap((px) => [px - clearance, px + clearance]))
    );
  };

  // Children whose couple could not sit together have no family in the
  // layout (fam 0). When the couple's recorded partnership is routed above
  // their row, the children are still one family, with one line of descent
  // from that line. When their two parents are co-parents with no recorded
  // partnership who sit side by side, the children are one family too, with
  // one line of descent, which comes down from each of them and joins below
  // their row (see `buildCoParentLink`). Otherwise (co-parents
  // with someone sitting between them, or a routed line with no clear point
  // to drop from), those who share every primary parent, in the same roles,
  // still form a sibship: a sibling bar with uplines and twin marks, though
  // no line of descent comes down from a couple; each parent joins the bar
  // with a line of its own. (Lines from co-parents with someone between them
  // joined below their row would pass beneath that person, and read as
  // theirs.) Each such family or sibship gets a key past every
  // column, so it never meets a family the layout named.
  const familyOf = layout.fam.map((row) => [...row]);
  const coupleless = new Set<number>();
  const routedFamilies = new Map<number, { pairKey: string; x: number }>();
  // The parents' columns, left then right, on the row above the children.
  const coParentFamilies = new Map<number, [number, number]>();
  // The columns of a sibship's two parents when they are co-parents with no
  // recorded partnership sitting side by side on the row above.
  const coParentsSideBySide = (
    i: number,
    descent: LineOwner,
  ): [number, number] | undefined => {
    const [a, b, ...more] = descent.parents;
    if (a === undefined || b === undefined || more.length > 0) {
      return undefined;
    }
    if (isRecordedPartnership(`${Math.min(a, b)},${Math.max(a, b)}`)) {
      return undefined;
    }
    const [at, bt] = [placeOf.get(a), placeOf.get(b)];
    if (!at || !bt || at.layer !== i - 1 || bt.layer !== i - 1) {
      return undefined;
    }
    if (Math.abs(at.col - bt.col) !== 1) return undefined;
    return at.col < bt.col ? [at.col, bt.col] : [bt.col, at.col];
  };
  let nextFamilyKey = maxcol + 1;
  for (let i = 1; i < maxlev; i++) {
    // Children are grouped by their sibship (see `lineOwnersOf`), never by
    // the owner of their line of descent alone, and, since such a sibship's
    // bar is drawn in one style, by the kind of that line too.
    const sibships = new Map<string, number[]>();
    const routedSibships = new Map<
      string,
      { pairKey: string; columns: number[] }
    >();
    for (let j = 0; j < (layout.n[i] ?? 0); j++) {
      if ((layout.fam[i]?.[j] ?? 0) !== 0 || layout.groupMember[i]?.[j]) {
        continue;
      }
      const { descent, sibship: named } = owners[layout.nid[i]![j]!] ?? {
        lines: [],
      };
      if (!descent || named === undefined) continue;
      const sibship = `${named}:${descent.kind}`;
      const [a, b] = descent.parents;
      const couple =
        a !== undefined && b !== undefined
          ? `${Math.min(a, b)},${Math.max(a, b)}`
          : undefined;
      if (couple !== undefined && routedCouples.get(couple)?.layer === i - 1) {
        const routed = routedSibships.get(sibship) ?? {
          pairKey: couple,
          columns: [],
        };
        routed.columns.push(j);
        routedSibships.set(sibship, routed);
        continue;
      }
      sibships.set(sibship, [...(sibships.get(sibship) ?? []), j]);
    }
    for (const [sibship, { pairKey, columns }] of routedSibships) {
      const target =
        columns.reduce((sum, j) => sum + layout.pos[i]![j]!, 0) /
        columns.length;
      const x = routedDescentX(
        routedCouples.get(pairKey)!.connector,
        i - 1,
        target,
      );
      if (x === undefined) {
        sibships.set(sibship, [...(sibships.get(sibship) ?? []), ...columns]);
        continue;
      }
      const famId = nextFamilyKey++;
      routedFamilies.set(famId, { pairKey, x });
      for (const j of columns) familyOf[i]![j] = famId;
    }
    for (const columns of sibships.values()) {
      const seated = coParentsSideBySide(
        i,
        descentOwnerOf(layout.nid[i]![columns[0]!]!)!,
      );
      if (seated) {
        const famId = nextFamilyKey++;
        coParentFamilies.set(famId, seated);
        for (const j of columns) familyOf[i]![j] = famId;
        continue;
      }
      if (columns.length < 2) continue;
      const famId = nextFamilyKey++;
      coupleless.add(famId);
      for (const j of columns) familyOf[i]![j] = famId;
    }
  }

  // Each drawn sibship, by key: its sibling bar, its size, and the children
  // in it (keyed "level,column"). Auxiliary and direct lines from a parent of
  // every child in a sibship join its bar; a child in no sibship is joined
  // directly.
  const sibshipOf = new Map<string, string>();
  const sibshipSize = new Map<string, number>();
  const sibshipBar = new Map<string, LineSegment>();
  // The x of every line meeting each sibship's bar from above or below.
  const sibshipStems = new Map<string, number[]>();
  const joinSibship = (
    key: string,
    i: number,
    columns: number[],
    bar: LineSegment,
    stems: number[],
  ) => {
    sibshipBar.set(key, bar);
    sibshipStems.set(key, stems);
    sibshipSize.set(key, columns.length);
    for (const j of columns) sibshipOf.set(`${i},${j}`, key);
  };
  // The parents whose ties each child's line of descent draws (keyed
  // "level,column"). Every other primary parent gets a line of their own.
  const descentParentsOf = new Map<string, Set<number>>();
  // Every line of descent with a level run, for the runs to be given heights
  // of their own once all are known.
  const descentLinks: {
    level: number;
    line: ParentChildConnector;
    childX: number;
    parentX: number;
    startY: number;
    /** For co-parents with no partnership line: where each sits, and who
     * they are. */
    coParentXs?: [number, number];
    coParentIds?: [string, string];
    /** How far above the children's row the sibling bar runs, where its
     * runs raised it (see `forkRuns`). */
    leg?: number;
  }[] = [];
  // A line of descent from its parents to the bar, its level run (if any)
  // at `runY`.
  const linkOf = (
    link: Omit<(typeof descentLinks)[number], 'line' | 'level'>,
    i: number,
    runY?: number,
  ) =>
    link.coParentXs
      ? buildCoParentLink(
          link.childX,
          link.coParentXs,
          link.startY,
          i,
          boxh,
          link.leg ?? legh,
          runY,
        )
      : buildParentLink(
          link.childX,
          link.parentX,
          link.startY,
          i,
          boxh,
          link.leg ?? legh,
          branch,
          runY,
        );

  // Whose tie each piece of a line of descent from co-parents with no
  // partnership line carries: the line down from each, and its level line
  // on to where the other's joins it, carry that parent's alone (see
  // `ParentChildConnector.parentLinkParentIds`).
  const carriersOf = (
    link: Omit<(typeof descentLinks)[number], 'line' | 'level'>,
    pieces: LineSegment[],
  ): { parentLinkParentIds?: string[][] } => {
    const { coParentXs: xs, coParentIds: ids, childX } = link;
    if (!xs || !ids) return {};
    const theirs = (keep: (x: number) => boolean) =>
      ids.filter((_, k) => keep(xs[k]!));
    return {
      parentLinkParentIds: pieces.map((piece) => {
        const [from, to] = [
          Math.min(piece.x1, piece.x2),
          Math.max(piece.x1, piece.x2),
        ];
        if (Math.abs(piece.y1 - piece.y2) < 1e-9) {
          // Level: from the parents on its far side from the line down.
          return to <= childX + 1e-9
            ? theirs((x) => x <= from + 1e-9)
            : theirs((x) => x >= to - 1e-9);
        }
        const top = Math.min(piece.y1, piece.y2);
        return Math.abs(top - link.startY) < 1e-9
          ? theirs((x) => Math.abs(x - piece.x1) < 1e-9)
          : [...ids];
      }),
    };
  };

  // Each couple's own line of descent from their partnership line, by pair
  // key: the first family whose children descend from both of them.
  const coupleDescents = new Map<string, ParentChildConnector>();

  // --- Parent-child lines ---
  for (let i = 1; i < maxlev; i++) {
    const familyIds = [...new Set(familyOf[i]!.filter((v) => v !== 0))];

    for (const fam of familyIds) {
      if (coupleless.has(fam)) {
        const whoIdx = familyOf[i]!.flatMap((f, j) => (f === fam ? [j] : []));
        const { uplines } = sibshipLines(i, whoIdx);
        withHelpers = false;
        const fork = forkRuns(i, whoIdx, uplines, () => '');
        withHelpers = true;
        fork.register();
        const { siblingBar } = fork;
        joinSibship(`${i},${fam}`, i, whoIdx, siblingBar, [
          ...new Set(fork.joinOf),
        ]);
        const sibshipOwner = descentOwnerOf(layout.nid[i]![whoIdx[0]!]!)!;
        const childIds = id
          ? whoIdx.map((j) => id[layout.nid[i]![j]!])
          : undefined;
        parentChildLines.push({
          type: 'parent-child',
          edgeType: sibshipOwner.kind,
          uplines,
          ...(siblingBar.x2 - siblingBar.x1 > 1e-9 ? { siblingBar } : {}),
          parentLink: [],
          ...drawnRuns(
            fork.runs,
            whoIdx.map((_, k) => k),
          ),
          ...(id
            ? {
                parentIds: sibshipOwner.parents.map((index) => id[index] ?? ''),
                uplineChildIds: childIds,
              }
            : {}),
        });
        continue;
      }

      // The family's parents: a couple seated side by side (or a single
      // parent), co-parents seated side by side with no partnership line, or
      // a couple whose partnership is routed above their row.
      const routed = routedFamilies.get(fam);
      const coParents = coParentFamilies.get(fam);
      let coupleLeftId: number;
      let coupleRightId: number;
      let leftPos: number;
      let rightPos: number;
      let groupLine: ParentGroupConnector | undefined;
      if (routed) {
        const couple = routedCouples.get(routed.pairKey)!;
        [coupleLeftId, coupleRightId] = couple.members;
        leftPos = nodeLocation.get(coupleLeftId)!.x;
        rightPos = nodeLocation.get(coupleRightId)!.x;
        groupLine = couple.connector;
      } else if (coParents) {
        const [left, right] = coParents;
        coupleLeftId = layout.nid[i - 1]![left]!;
        coupleRightId = layout.nid[i - 1]![right]!;
        leftPos = layout.pos[i - 1]![left]!;
        rightPos = layout.pos[i - 1]![right]!;
        groupLine = undefined;
      } else {
        const { left, right } = familyParentColumns(layout, i, fam);
        coupleLeftId = layout.nid[i - 1]![left]!;
        coupleRightId = layout.nid[i - 1]![right]!;
        leftPos = layout.pos[i - 1]![left]!;
        rightPos = layout.pos[i - 1]![right]!;
        // A single parent's children descend from the parent, not from a
        // partner line they may also be on.
        const glIdx =
          fam > 0 ? groupLineIndex.get(`${i - 1},${left}`) : undefined;
        groupLine = glIdx === undefined ? undefined : groupLines[glIdx];
      }
      const parentIdsForFamily = id
        ? [
            ...new Set(
              [coupleLeftId, coupleRightId].map((idx) => id[idx] ?? ''),
            ),
          ]
        : undefined;
      const childIdOf = (j: number) => {
        const personIndex = layout.nid[i]![j];
        return id && personIndex !== undefined ? id[personIndex] : undefined;
      };

      // Each child's line of descent comes from the family's parents, its
      // owners, in the style of the tie they hold.
      const descentKindOf = (j: number) =>
        descentOwnerOf(layout.nid[i]![j]!)?.kind ?? 'biological';
      const descentParents = new Set([coupleLeftId, coupleRightId]);
      const descentX = routed ? routed.x : (leftPos + rightPos) / 2;
      if (groupLine) {
        groupLine.descentXPositions ??= [];
        if (!groupLine.descentXPositions.includes(descentX)) {
          groupLine.descentXPositions.push(descentX);
        }
      }
      // A couple's line of descent starts on their partnership line (the
      // lower rail of a double one); co-parents' with no partnership line,
      // at each of them; one parent's, at the parent.
      const startY =
        groupLine && coupleLeftId !== coupleRightId
          ? groupLine.double && groupLine.doubleSegment
            ? groupLine.doubleSegment.y1
            : groupLine.segment.y1
          : i - 1 + boxh / 2;

      const whoIdx: number[] = [];
      for (let j = 0; j < (layout.n[i] ?? 0); j++) {
        if (familyOf[i]![j] === fam) whoIdx.push(j);
      }

      // The family's children form one sibship with one line of descent.
      if (whoIdx.length > 0) {
        const columns = whoIdx;
        const { uplines } = sibshipLines(i, columns);
        const fork = forkRuns(
          i,
          columns,
          uplines,
          (k) => descentKindOf(columns[k]!),
          descentX,
        );
        fork.register();
        const { siblingBar, minTarget, maxTarget } = fork;
        for (const j of columns) {
          descentParentsOf.set(`${i},${j}`, descentParents);
        }

        // Where the parent link meets the sibling bar: straight below the
        // descent wherever that lies on the bar; otherwise, when the descent
        // lies past the bar's end, part way in from that end. Never over
        // someone on the children's row who has no line up from this bar (a
        // partner sitting between two siblings), who would read as one of
        // these children.
        const targetRange = maxTarget - minTarget;
        const onBar =
          descentX >= minTarget - 1e-9 && descentX <= maxTarget + 1e-9;
        const [footFrom, footTo] = onBar
          ? [minTarget, maxTarget]
          : targetRange < 2 * pconnect
            ? [(minTarget + maxTarget) / 2, (minTarget + maxTarget) / 2]
            : [minTarget + pconnect, maxTarget - pconnect];
        const notOfThisBar = Array.from(
          { length: layout.n[i] ?? 0 },
          (_, j) => j,
        )
          .filter((j) => !columns.includes(j))
          .map((j) => layout.pos[i]![j]!)
          .filter((x) => x > minTarget && x < maxTarget);
        const x1 = clearOf(
          Math.max(footFrom, Math.min(footTo, descentX)),
          notOfThisBar,
          boxw / 2 + 0.05,
          [footFrom, footTo],
          [minTarget, maxTarget],
        );
        joinSibship(`${i},${fam}`, i, columns, siblingBar, [
          x1,
          ...new Set(fork.joinOf),
          ...notOfThisBar,
        ]);
        // Co-parents with no partnership line: a line down from each.
        const coParentXs =
          !routed && !groupLine && coupleLeftId !== coupleRightId
            ? ([leftPos, rightPos] as [number, number])
            : undefined;
        const coParentIds =
          coParentXs && id
            ? ([id[coupleLeftId] ?? '', id[coupleRightId] ?? ''] as [
                string,
                string,
              ])
            : undefined;
        const descent = {
          childX: x1,
          parentX: descentX,
          startY,
          leg: fork.leg,
          ...(coParentXs ? { coParentXs } : {}),
          ...(coParentIds ? { coParentIds } : {}),
        };
        const parentLink = linkOf(descent, i);

        // Each child's own tie sets the style of the line to them. The
        // parent link and the bar between it and the children of the first
        // style (solid, when any child holds a birth tie to the owners: a
        // gamete or the pregnancy) are drawn in that style; each other style
        // continues the bar out to its own children.
        const byStyle = groupBy(
          columns.map((_, k) => k),
          (k) => descentKindOf(columns[k]!),
        );
        const [primaryStyle, primaryKs] =
          [...byStyle].find(([style]) => isBirthTie(style)) ?? [...byStyle][0]!;
        // Where each child's line meets the bar: their own line up, or the
        // stem of their run.
        const targetOf = (k: number) => fork.joinOf[k]!;
        const primaryTargets = primaryKs.map(targetOf);
        const primaryMin = Math.min(x1, ...primaryTargets);
        const primaryMax = Math.max(x1, ...primaryTargets);
        const pushSibshipPart = (
          edgeType: PedigreeEdgeType,
          ks: number[],
          barFrom: number,
          barTo: number,
          link: LineSegment[],
        ) => {
          const part: ParentChildConnector = {
            type: 'parent-child',
            edgeType,
            uplines: ks.map((k) => uplines[k]!),
            ...(barTo - barFrom > 1e-9
              ? {
                  siblingBar: {
                    type: 'line',
                    x1: barFrom,
                    y1: siblingBar.y1,
                    x2: barTo,
                    y2: siblingBar.y1,
                  } satisfies LineSegment,
                }
              : {}),
            parentLink: link,
            ...(id
              ? {
                  parentIds: parentIdsForFamily,
                  uplineChildIds: ks.map((k) => childIdOf(columns[k]!)),
                }
              : {}),
            ...drawnRuns(fork.runs, ks),
          };
          parentChildLines.push(part);
          return part;
        };
        const primaryPart = pushSibshipPart(
          primaryStyle,
          primaryKs,
          primaryMin,
          primaryMax,
          parentLink,
        );
        Object.assign(primaryPart, carriersOf(descent, parentLink));
        descentLinks.push({ level: i, line: primaryPart, ...descent });
        if (groupLine && coupleLeftId !== coupleRightId) {
          const pairKey = `${Math.min(coupleLeftId, coupleRightId)},${Math.max(coupleLeftId, coupleRightId)}`;
          if (!coupleDescents.has(pairKey)) {
            coupleDescents.set(pairKey, primaryPart);
          }
        }
        for (const [style, ks] of byStyle) {
          if (style === primaryStyle) continue;
          const toLeft = ks.filter((k) => targetOf(k) < primaryMin);
          const toRight = ks.filter((k) => targetOf(k) > primaryMax);
          const within = ks.filter(
            (k) => !toLeft.includes(k) && !toRight.includes(k),
          );
          if (toLeft.length > 0) {
            const reach = Math.min(...toLeft.map(targetOf));
            pushSibshipPart(style, toLeft, reach, primaryMin, []);
          }
          if (toRight.length > 0) {
            const reach = Math.max(...toRight.map(targetOf));
            pushSibshipPart(style, toRight, primaryMax, reach, []);
          }
          if (within.length > 0) {
            const at = targetOf(within[0]!);
            pushSibshipPart(style, within, at, at, []);
          }
        }
      }
    }
  }

  // Lines of descent into one row whose level runs overlap are given runs
  // at heights of their own, so two families' lines never run along one
  // another (where they would read as one), stacked in the order that
  // crosses fewest of them.
  if (branch !== 0) {
    for (let i = 1; i < maxlev; i++) {
      const runs = descentLinks.filter(
        (link) =>
          link.level === i &&
          (link.coParentXs !== undefined ||
            Math.abs(link.childX - link.parentX) >= 1e-9),
      );
      for (const group of overlappingRuns(runs)) {
        if (group.length < 2) continue;
        const order = leastCrossingStack(group);
        const parentBottomY = i - 1 + boxh;
        const barY = Math.min(...order.map((link) => i - (link.leg ?? legh)));
        order.forEach((link, lane) => {
          const runY =
            parentBottomY +
            ((barY - parentBottomY) * (lane + 1)) / (order.length + 1);
          link.line.parentLink = linkOf(link, i, runY);
          Object.assign(link.line, carriersOf(link, link.line.parentLink));
        });
      }
    }
  }

  // --- Twin marks ---
  // A twin code is kept at the left twin's column, and the other twin sits
  // in the next column. The marks are placed from the two twins' own lines
  // up, whichever sibships those lines belong to (twins with different
  // recorded parents hang from different bars).
  const allUplines = parentChildLines.flatMap((line) => line.uplines);
  if (layout.twins) {
    const uplineAt = (i: number, col: number) => {
      const x = layout.pos[i]![col]!;
      return allUplines.find(
        (line) =>
          Math.abs(line.x1 - x) < 1e-9 &&
          Math.abs(line.y1 - (i + boxh / 2)) < 1e-9,
      );
    };
    // Midway between the point the twins hang from (on the sibling bar, or
    // their run's sub-bar) and the tops of their symbols.
    const markY = (i: number, col: number) => {
      const upline = uplineAt(i, col);
      return upline && upline.y2 < i ? (upline.y2 + i) / 2 : i - legh / 2;
    };
    // Where the twin's line up crosses the height of the marks: an upline
    // starts at the centre of the child's symbol. A twin with no line up
    // (no recorded parent drawn) is marked straight above their symbol.
    const crossingX = (i: number, col: number, y: number) => {
      const x = layout.pos[i]![col]!;
      const upline = uplineAt(i, col);
      if (!upline || Math.abs(upline.y2 - upline.y1) < 1e-9) return x;
      const t = (y - upline.y1) / (upline.y2 - upline.y1);
      return upline.x1 + Math.max(0, Math.min(1, t)) * (upline.x2 - upline.x1);
    };
    for (let i = 0; i < maxlev; i++) {
      for (let col = 0; col + 1 < (layout.n[i] ?? 0); col++) {
        const code = layout.twins[i]?.[col];
        if (code !== 1 && code !== 2 && code !== 3) continue;
        // Resolve the twins' node ids so the mark can be dimmed by node
        // membership in the focal view.
        const twinIds = id
          ? [col, col + 1].map((c) => id[layout.nid[i]![c]!] ?? '')
          : undefined;
        const y = markY(i, col);
        const [leftX, rightX] = [
          crossingX(i, col, y),
          crossingX(i, col + 1, y),
        ];
        twinIndicators.push({
          type: 'twin',
          code,
          // Identical twins: a bar ending on each twin's line.
          ...(code === 1
            ? {
                segment: {
                  type: 'line',
                  x1: leftX,
                  y1: y,
                  x2: rightX,
                  y2: y,
                } satisfies LineSegment,
              }
            : {}),
          // Zygosity unknown: a question mark between their lines, sized
          // with the symbols.
          ...(code === 3
            ? {
                label: { x: (leftX + rightX) / 2, y },
                labelSize: TWIN_LABEL_SIZE * boxh,
              }
            : {}),
          ...(twinIds ? { twinIds } : {}),
        });
      }
    }
  }

  // Where the line from a couple raising a relative's child starts: on the
  // couple's own line of descent, which it leaves sideways (the router
  // chooses the point), or, when they have no children drawn descending
  // from them both, at the point on their partnership line a line of
  // descent would drop from. Undefined when their partnership line has no
  // such point (partners on different rows, or a routed line with no clear
  // point to drop from).
  const coupleStartOf = (
    pairKey: string,
  ): { x: number; y: number; stem?: LineSegment[] } | undefined => {
    const descent = coupleDescents.get(pairKey);
    const top = descent?.parentLink[0];
    if (descent && top) {
      return { x: top.x1, y: top.y1, stem: descent.parentLink };
    }
    const [a, b] = pairKey.split(',').map(Number) as [number, number];
    const [at, bt] = [placeOf.get(a), placeOf.get(b)];
    if (!at || !bt || at.layer !== bt.layer) return undefined;
    const sideBySide =
      Math.abs(at.col - bt.col) === 1
        ? groupLineIndex.get(`${at.layer},${Math.min(at.col, bt.col)}`)
        : undefined;
    const line =
      sideBySide === undefined
        ? routedCouples.get(pairKey)?.connector
        : groupLines[sideBySide];
    if (!line) return undefined;
    const y =
      line.double && line.doubleSegment
        ? line.doubleSegment.y1
        : line.segment.y1;
    const x =
      sideBySide === undefined
        ? routedDescentX(
            line,
            at.layer,
            (line.segment.x1 + line.segment.x2) / 2,
          )
        : (layout.pos[at.layer]![at.col]! + layout.pos[bt.layer]![bt.col]!) / 2;
    return x === undefined ? undefined : { x, y };
  };
  // --- Routing the auxiliary and direct lines ---
  // Each is routed clear of everyone and of every line drawn so far,
  // including the auxiliary lines routed before it.
  const scene: RoutingScene = {
    boxWidth: boxw,
    boxHeight: boxh,
    symbols: [],
    brackets: [],
    lines: [],
    rowXs: layout.pos.map((row, layer) => row.slice(0, layout.n[layer] ?? 0)),
    barTops: new Map(),
    ...(cornerRadius === undefined ? {} : { cornerRadius }),
    ...(scaling.halfStroke === undefined
      ? {}
      : { halfStroke: scaling.halfStroke }),
    ...(searchWork ? { work: searchWork } : {}),
    ...(search === 'quick' ? { screening: true } : {}),
  };
  // Whether the search may weigh more courses. Each line's first routing
  // is always done; every search for a better course past it stops once
  // the work is spent.
  const mayWeighMore = () => !searchWork || searchWork.spent < searchWork.limit;
  for (const line of parentChildLines) {
    if (!line.siblingBar) continue;
    const y = line.siblingBar.y1;
    const above = Math.ceil(y) - 1;
    scene.barTops!.set(above, Math.min(scene.barTops!.get(above) ?? y, y));
  }
  for (let i = 0; i < maxlev; i++) {
    for (let j = 0; j < (layout.n[i] ?? 0); j++) {
      const personIndex = layout.nid[i]![j]!;
      const { symbol, brackets } = symbolOf(
        personIndex,
        layout.pos[i]![j]!,
        i,
        boxw,
        boxh,
        isBracketed(personIndex),
        shapes?.[personIndex],
        cornerRadius,
      );
      scene.symbols.push(symbol);
      scene.brackets.push(...brackets);
    }
  }
  for (const line of groupLines) {
    for (const segment of [
      line.segment,
      ...(line.endpointSegments ?? []),
      ...(line.doubleSegment ? [line.doubleSegment] : []),
    ]) {
      scene.lines.push({ segment, kind: 'partnership' });
    }
  }
  for (const line of parentChildLines) {
    // A line of descent reads as joining whatever crosses it, as an upline.
    for (const segment of line.parentLink) {
      scene.lines.push({ segment, kind: 'upline' });
    }
    if (line.siblingBar) {
      scene.lines.push({ segment: line.siblingBar, kind: 'bar' });
    }
    // Each line up comes from its owners, where their line of descent
    // leaves them (the middle of a couple).
    const top = inOrder(
      line.parentLink.flatMap((s) => [
        { x: s.x1, y: s.y1 },
        { x: s.x2, y: s.y2 },
      ]),
      (p, q) => p.y - q.y,
    )[0];
    for (const segment of line.uplines) {
      scene.lines.push({
        segment,
        kind: 'upline',
        ...(top ? { ownerX: top.x } : {}),
      });
    }
    for (const run of line.runs ?? []) {
      scene.lines.push({ segment: run.stem, kind: 'upline' });
      if (run.bar) scene.lines.push({ segment: run.bar, kind: 'bar' });
    }
  }
  for (const twin of twinIndicators) {
    if (twin.segment)
      scene.lines.push({ segment: twin.segment, kind: 'other' });
  }

  const pairKeyOf = (a: number, b: number) =>
    `${Math.min(a, b)},${Math.max(a, b)}`;
  // --- The lines drawn for ties outside each child's line of descent ---
  // One line per owner and kind of tie (see `lineOwnersOf`), for the
  // children it is drawn to: those of a sibship (or of a run of it) whose
  // line of descent it joins, or each child on its own.
  type LineTo = {
    owner: LineOwner;
    edgeType: PedigreeEdgeType;
    childLevel: number;
    sibship: string;
    childColumns: number[];
    /** Whether the line joins the children's line of descent (constraint
     * 3): a birth line, into a line of descent drawn from a row above that
     * carries birth ties. */
    joins: boolean;
    /** One of the owners of a line of descent drawn with no line down from
     * them, joining it at their children's sibling bar. */
    drop?: boolean;
    run?: SibshipRunPlan;
  };
  const linesTo = new Map<string, LineTo>();
  for (let i = 0; i < maxlev; i++) {
    for (let j = 0; j < (layout.n[i] ?? 0); j++) {
      const child = layout.nid[i]![j]!;
      if (child < 0) continue;
      const { descent, lines } = owners[child] ?? { lines: [] };
      const sibship = sibshipOf.get(`${i},${j}`) ?? `${i},none`;
      // A line of descent that cannot be drawn as one (its owners rows
      // above, or co-parents with someone seated between them) is drawn as
      // its owner's line, to the children's sibling bar when they have one.
      const drops =
        descent && !descentParentsOf.has(`${i},${j}`) ? [descent] : [];
      for (const owner of drops) {
        if (!owner.parents.every((parent) => nodeLocation.has(parent))) {
          continue;
        }
        const key = `${lineKeyOf(owner)}|${sibship}|drop`;
        const existing = linesTo.get(key);
        if (existing) {
          existing.childColumns.push(j);
        } else {
          linesTo.set(key, {
            owner,
            edgeType: owner.kind,
            childLevel: i,
            sibship,
            childColumns: [j],
            joins: false,
            drop: true,
          });
        }
      }
      for (const owner of lines) {
        if (!owner.parents.every((parent) => nodeLocation.has(parent))) {
          continue;
        }
        const joins =
          isBirthTie(owner.kind) &&
          descent !== undefined &&
          isBirthTie(descent.kind) &&
          descentParentsOf.has(`${i},${j}`) &&
          owner.parents.every((parent) => nodeLocation.get(parent)!.layer < i);
        const run = joins
          ? runsOfChild
              .get(`${i},${j}`)
              ?.find((candidate) => candidate.helpers.has(lineKeyOf(owner)))
          : undefined;
        const key = `${lineKeyOf(owner)}|${run ? `run ${run.id}` : sibship}|${joins}`;
        const existing = linesTo.get(key);
        if (existing) {
          existing.childColumns.push(j);
        } else {
          linesTo.set(key, {
            owner,
            edgeType: owner.kind,
            childLevel: i,
            sibship,
            childColumns: [j],
            joins,
            ...(run ? { run } : {}),
          });
        }
      }
    }
  }
  /** Whether two people sit side by side on one row. */
  const sideBySide = (a: number, b: number) => {
    const [at, bt] = [placeOf.get(a), placeOf.get(b)];
    return (
      at !== undefined &&
      bt !== undefined &&
      at.layer === bt.layer &&
      Math.abs(at.col - bt.col) === 1
    );
  };
  const plans = [...linesTo.values()].flatMap((conn) => {
    const [first, second] = conn.owner.parents as [number, number?];
    const singly = (person: number) => {
      const at = nodeLocation.get(person)!;
      return {
        person,
        ownerIds: [person],
        from: { person, x: at.x, layer: at.layer } as From,
        owner: `${person},${conn.edgeType}`,
      };
    };
    let starts: {
      person: number;
      ownerIds: number[];
      from: From;
      owner: string;
    }[];
    if (second === undefined) {
      starts = [singly(first)];
    } else if (isRecordedPartnership(pairKeyOf(first, second))) {
      // A couple's line starts on their partnership line, or leaves their
      // own line of descent; with no such place (partners on different
      // rows), each draws a line of their own.
      const pairKey = pairKeyOf(first, second);
      const couple = coupleStartOf(pairKey);
      const at = nodeLocation.get(first)!;
      starts = couple
        ? [
            {
              person: first,
              ownerIds: [first, second],
              from: {
                person: first,
                x: couple.x,
                layer: at.layer,
                y: couple.y,
                ...(couple.stem ? { stem: couple.stem } : {}),
                people: [first, second],
              },
              owner: `couple ${pairKey},${conn.edgeType}`,
            },
          ]
        : [singly(first), singly(second)];
    } else if (sideBySide(first, second)) {
      // Two birth parents with no partnership recorded, seated side by
      // side: each comes down from their own symbol, and their lines join
      // below the row (see `From.mate`), so none starts between them.
      const at = nodeLocation.get(first)!;
      starts = [
        {
          person: first,
          ownerIds: [first],
          from: {
            person: first,
            x: at.x,
            layer: at.layer,
            mate: { person: second, x: nodeLocation.get(second)!.x },
          },
          owner: `pair ${pairKeyOf(first, second)},${conn.edgeType}`,
        },
      ];
    } else {
      starts = [singly(first), singly(second)];
    }
    const bar = sibshipBar.get(conn.sibship);
    const totalChildren = sibshipSize.get(conn.sibship) ?? 0;
    const all =
      bar !== undefined &&
      totalChildren > 1 &&
      conn.childColumns.length >= totalChildren;
    // A line joining the children's line of descent ends where that line
    // first leads only to the children it is drawn for (the donor and
    // carrier line rule, Bennett et al. 2022): on their sibling bar, for
    // all of a sibship; at the top of their run's stem; at the top of one
    // child's line up; or at the top of an only child, where the lines
    // converge. One line each, for children of a sibship side by side in no
    // run. An owner of a line of descent drawn with no line down from them
    // joins it at the children's sibling bar. Any other line ends at the top
    // of each child, where every line into them converges.
    const barJoin: Join = {
      points: (towardX) =>
        barPoints(
          bar!,
          sibshipStems.get(conn.sibship) ?? [],
          towardX,
          JUNCTION_CLEARANCE * boxw,
        ),
    };
    let joins: Join[] = [];
    if ((conn.drop || (conn.joins && !conn.run)) && all) {
      joins = [barJoin];
    } else if (conn.joins && conn.run) {
      joins = [pointJoin({ x: conn.run.stemX, y: conn.run.topY })];
    } else if (conn.joins) {
      joins = conn.childColumns.map((col) => {
        const top = uplineTops.get(`${conn.childLevel},${col}`);
        const child = layout.nid[conn.childLevel]![col]!;
        if (totalChildren > 1 && top) return pointJoin(top, child);
        return pointJoin(
          {
            x: layout.pos[conn.childLevel]![col]!,
            y: symbolTop(conn.childLevel, boxh, shapes?.[child], cornerRadius),
          },
          child,
        );
      });
    }
    return starts.map((start) => ({ conn, ...start, joins }));
  });

  // Each line as routed, so that it can be routed again against the lines
  // routed after it.
  const routed: {
    from: (typeof plans)[number]['from'];
    end: RouteEnd;
    owner: string;
    line: AuxiliaryConnector;
    /** A co-parent's line joining this one (see `From.mate`). */
    mateLine?: AuxiliaryConnector;
    drawn: DrawnLine[];
    endX: number;
    /** The joins on the sibling bar it meets, if it meets one. */
    stems?: number[];
    /** Where across the page the children it reaches sit, on average. */
    anchor: number;
  }[] = [];
  const drawnOf = (
    points: Point[],
    {
      owner,
      end,
      from,
    }: Pick<(typeof routed)[number], 'owner' | 'end' | 'from'>,
    matePoints?: Point[],
  ): DrawnLine[] =>
    [...segmentsOf(points), ...segmentsOf(matePoints ?? [])].map((segment) => ({
      segment,
      kind: 'other',
      owner,
      ownerX: ownerXOf(from),
      people: peopleOf(from),
      ...(end.kind === 'child' ? { endsOn: end.person } : {}),
    }));

  // Every line, one after another across the page (by where its owner
  // sits, and then where the children it reaches sit), each routed among
  // the lines drawn before it (and then again among them all, below).
  type Work = {
    plan: (typeof plans)[number];
    join?: (typeof plans)[number]['joins'][number];
  };
  const childrenX = ({ conn }: (typeof plans)[number]) =>
    conn.childColumns.reduce(
      (sum, col) => sum + layout.pos[conn.childLevel]![col]!,
      0,
    ) / Math.max(1, conn.childColumns.length);
  const work: Work[] = inOrder(
    plans.flatMap((plan): Work[] =>
      plan.joins.length > 0
        ? plan.joins.map((join) => ({ plan, join }))
        : [{ plan }],
    ),
    (a, b) =>
      ownerXOf(a.plan.from) - ownerXOf(b.plan.from) ||
      childrenX(a.plan) - childrenX(b.plan) ||
      a.plan.from.layer - b.plan.from.layer,
  );
  const pushLine = (
    plan: (typeof plans)[number],
    points: Point[],
    childNodeId: string | undefined,
    matePoints?: Point[],
  ) => {
    const line: AuxiliaryConnector = {
      type: 'auxiliary',
      edgeType: plan.conn.edgeType,
      points,
      ...(id
        ? {
            endpointIds: [id[plan.person], childNodeId],
            ownerIds: plan.ownerIds.map((index) => id[index] ?? ''),
          }
        : {}),
    };
    auxiliaryLines.push(line);
    const mate = plan.from.mate;
    const mateLine: AuxiliaryConnector | undefined =
      mate && matePoints
        ? {
            type: 'auxiliary',
            edgeType: plan.conn.edgeType,
            points: matePoints,
            ...(id
              ? {
                  endpointIds: [id[mate.person], childNodeId],
                  ownerIds: [id[mate.person] ?? ''],
                }
              : {}),
          }
        : undefined;
    if (mateLine) auxiliaryLines.push(mateLine);
    return { line, mateLine };
  };
  for (const item of work) {
    const { plan, join } = item;
    const { conn, from, owner } = plan;
    const draw = (
      end: RouteEnd,
      childNodeId: string | undefined,
      stems?: number[],
      anchor = childrenX(plan),
    ) => {
      const { points, endX, matePoints } = routeLine(from, end, owner, scene);
      const drawn = drawnOf(points, { owner, end, from }, matePoints);
      scene.lines.push(...drawn);
      const { line, mateLine } = pushLine(
        plan,
        points,
        childNodeId,
        matePoints,
      );
      routed.push({
        from,
        end,
        owner,
        line,
        ...(mateLine ? { mateLine } : {}),
        drawn,
        endX,
        ...(stems ? { stems } : {}),
        anchor,
      });
      return endX;
    };
    if (join) {
      // Joins the line of descent where the rule puts it, routed round
      // whatever is in the way of a straight line, or (for a co-parent's
      // line) joined to the other's first.
      const stems = sibshipStems.get(conn.sibship);
      const joined = draw(
        {
          kind: 'join',
          points: join.points(from.mate ? (from.x + from.mate.x) / 2 : from.x),
          layer: conn.childLevel,
          ...(join.reaches === undefined ? {} : { reaches: join.reaches }),
        },
        undefined,
        stems,
      );
      if (stems && !stems.some((x) => Math.abs(x - joined) < 1e-9)) {
        stems.push(joined);
      }
      continue;
    }
    // Any other line ends at the top of each child, where every line into
    // them converges.
    for (const col of conn.childColumns) {
      const childPersonIndex = layout.nid[conn.childLevel]![col]!;
      const shape = shapes?.[childPersonIndex];
      draw(
        {
          kind: 'child',
          person: childPersonIndex,
          x: layout.pos[conn.childLevel]![col]!,
          layer: conn.childLevel,
          ...(shape ? { shape } : {}),
        },
        id ? id[childPersonIndex] : undefined,
        undefined,
        layout.pos[conn.childLevel]![col]!,
      );
    }
    // A drawing that may be abandoned is abandoned once its lines' first
    // routing alone has spent the work (see `RoutingWork`).
    if (
      searchWork?.abandonPast !== undefined &&
      searchWork.spent >= searchWork.abandonPast
    ) {
      return {
        connectors: {
          groupLines: [],
          parentChildLines: [],
          auxiliaryLines: [],
          twinIndicators: [],
          duplicateArcs: [],
        },
        cost: Number.POSITIVE_INFINITY,
      };
    }
  }

  type Routed = (typeof routed)[number];
  type Course = { points: Point[]; endX: number; matePoints?: Point[] };
  const courseOf = (entry: Routed): Course => ({
    points: entry.line.points,
    endX: entry.endX,
    ...(entry.mateLine ? { matePoints: entry.mateLine.points } : {}),
  });
  const adopt = (entry: Routed, course: Course, drawn?: DrawnLine[]) => {
    entry.line.points = course.points;
    if (entry.mateLine && course.matePoints) {
      entry.mateLine.points = course.matePoints;
    }
    // A course taken back is drawn with the lines it was drawn with, so
    // what was weighed against them is known still (see `courseCosts`).
    entry.drawn =
      drawn ?? drawnOf(course.points, entry, entry.mateLine?.points);
    if (entry.stems) {
      const at = entry.stems.indexOf(entry.endX);
      if (at >= 0) entry.stems[at] = course.endX;
    }
    entry.endX = course.endX;
  };
  const withoutLines = (...entries: Routed[]) => {
    scene.lines = scene.lines.filter(
      (line) => !entries.some((entry) => entry.drawn.includes(line)),
    );
  };
  // What the drawing costs: each line's course among the lines of descent
  // and partnership lines and the lines before it across the page (left to
  // right, by where its owner sits and where it ends), so that every
  // meeting of two lines is counted once, and the order the family was
  // recorded in plays no part.
  const fixedLines = scene.lines.filter((line) => line.owner === undefined);
  const acrossThePage = routed;
  const rankOf = new Map(acrossThePage.map((entry, k) => [entry, k]));
  const termOf = (entry: Routed) =>
    courseCost(
      entry.from,
      entry.end,
      entry.owner,
      {
        ...scene,
        lines: [
          ...fixedLines,
          ...acrossThePage.slice(0, rankOf.get(entry)).flatMap((e) => e.drawn),
        ],
      },
      entry.line.points,
      entry.mateLine?.points,
    );
  const terms = new Map<Routed, number>();
  const totalOf = () => {
    let total = 0;
    for (const entry of routed) total += terms.get(entry) ?? 0;
    return total;
  };
  const costEveryLine = () => {
    for (const entry of routed) terms.set(entry, termOf(entry));
  };
  const place = (entry: Routed, course: Course, drawn?: DrawnLine[]) => {
    withoutLines(entry);
    adopt(entry, course, drawn);
    scene.lines.push(...entry.drawn);
  };
  // Two lines far apart cannot get in each other's way.
  const reachOfLine = 0.3 * Math.max(boxw, boxh);
  const areaOf = (points: Point[]) => {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    return {
      left: Math.min(...xs) - reachOfLine,
      right: Math.max(...xs) + reachOfLine,
      top: Math.min(...ys) - reachOfLine,
      bottom: Math.max(...ys) + reachOfLine,
    };
  };
  const mayMeet = (a: Routed, b: Routed) => {
    const [p, q] = [
      areaOf([...a.line.points, ...(a.mateLine?.points ?? [])]),
      areaOf([...b.line.points, ...(b.mateLine?.points ?? [])]),
    ];
    return (
      p.right >= q.left &&
      p.left <= q.right &&
      p.bottom >= q.top &&
      p.top <= q.bottom
    );
  };
  // When each line last changed, and when each line and each pair were last
  // routed again: a line (or pair) is not routed again until it, or a line
  // near it, has changed since.
  let tick = 0;
  const changedAt = new Map<Routed, number>();
  const triedAt = new Map<string, number>();
  const changedNear = (...entries: Routed[]) =>
    Math.max(
      ...routed
        .filter(
          (entry) =>
            entries.includes(entry) ||
            entries.some((other) => mayMeet(entry, other)),
        )
        .map((entry) => changedAt.get(entry) ?? 0),
    );
  const untriedSince = (key: string, ...entries: Routed[]) =>
    (triedAt.get(key) ?? -1) < changedNear(...entries);
  // Takes new courses for some lines if the drawing then costs less: what
  // each changed line costs, and what each line after it across the page
  // that comes near its old or new course costs, before and after.
  const takeIfCheaper = (changes: Map<Routed, Course>): boolean => {
    const changed = [...changes.keys()];
    const first = Math.min(...changed.map((entry) => rankOf.get(entry)!));
    const near = (moved: Routed[]) =>
      acrossThePage.filter(
        (entry) =>
          changes.has(entry) ||
          (rankOf.get(entry)! > first &&
            moved.some((other) => mayMeet(entry, other))),
      );
    const before = new Map(
      changed.map((entry) => [
        entry,
        { course: courseOf(entry), drawn: entry.drawn },
      ]),
    );
    const affected = new Set(near(changed));
    for (const [entry, course] of changes) place(entry, course);
    for (const entry of near(changed)) affected.add(entry);
    const was = [...affected].reduce((sum, e) => sum + terms.get(e)!, 0);
    const now = new Map([...affected].map((e) => [e, termOf(e)]));
    const is = [...now.values()].reduce((sum, cost) => sum + cost, 0);
    if (is < was - 1e-9) {
      for (const [entry, cost] of now) terms.set(entry, cost);
      tick++;
      for (const entry of changed) changedAt.set(entry, tick);
      return true;
    }
    for (const [entry, { course, drawn }] of before) {
      place(entry, course, drawn);
    }
    return false;
  };
  // Each line routed again among all the others, those after it included,
  // taken if the drawing costs less.
  const rerouteEach = (order: Routed[]) => {
    let bettered = false;
    for (const entry of order) {
      if (!mayWeighMore()) return false;
      const key = `${routed.indexOf(entry)}`;
      if (!untriedSince(key, entry)) continue;
      triedAt.set(key, tick);
      withoutLines(entry);
      const next = routeLine(
        entry.from,
        entry.end,
        entry.owner,
        scene,
        courseOf(entry),
      );
      scene.lines.push(...entry.drawn);
      if (next.points === entry.line.points) continue;
      if (takeIfCheaper(new Map([[entry, next]]))) bettered = true;
    }
    return bettered;
  };
  // Two lines that still cross or crowd each other are routed together:
  // of the best few courses for each, the two that are best together. (Two
  // lines down one gap may each be clear only on the other's lane.)
  const PAIR_OPTIONS = 24;
  const costAmong = (entry: Routed, course: Course, extra: DrawnLine[]) =>
    courseCost(
      entry.from,
      entry.end,
      entry.owner,
      { ...scene, lines: [...scene.lines, ...extra] },
      course.points,
      course.matePoints,
    );
  const routeInPairs = (order: Routed[]) => {
    let bettered = false;
    for (let i = 0; i < order.length; i++) {
      for (let j = i + 1; j < order.length; j++) {
        if (!mayWeighMore()) return false;
        const [a, b] = [order[i]!, order[j]!];
        if (!mayMeet(a, b)) continue;
        const key = [routed.indexOf(a), routed.indexOf(b)]
          .toSorted((x, y) => x - y)
          .join(',');
        if (!untriedSince(key, a, b)) continue;
        triedAt.set(key, tick);
        withoutLines(a, b);
        const together = (first: Course, second: Course) =>
          costAmong(a, first, drawnOf(second.points, b, second.matePoints)) +
          costAmong(b, second, drawnOf(first.points, a, first.matePoints));
        const apart =
          costAmong(a, courseOf(a), []) + costAmong(b, courseOf(b), []);
        let best = {
          first: courseOf(a),
          second: courseOf(b),
          cost: together(courseOf(a), courseOf(b)),
        };
        if (best.cost > apart + 1e-9) {
          const options = (entry: Routed) => [
            courseOf(entry),
            ...routeOptions(
              entry.from,
              entry.end,
              entry.owner,
              scene,
              PAIR_OPTIONS,
            ),
          ];
          const [firsts, seconds] = [options(a), options(b)];
          // What each course costs among the scene, and what each course of
          // the other line adds to that: a course's cost among two sets of
          // lines is the sum of what each adds (see `courseCosts`), and
          // neither adds less than nothing, so two courses dearer alone
          // than the best two together are not weighed together.
          const alone = (entry: Routed, courses: Course[]) => {
            const costOf = courseCosts(
              entry.from,
              entry.end,
              entry.owner,
              scene,
            );
            return courses.map((course) =>
              costOf(course.points, course.matePoints),
            );
          };
          const addedBy = (entry: Routed, other: Routed, course: Course) =>
            courseCosts(
              entry.from,
              entry.end,
              entry.owner,
              {
                ...scene,
                lines: drawnOf(course.points, other, course.matePoints),
              },
              true,
            );
          const [aAlone, bAlone] = [alone(a, firsts), alone(b, seconds)];
          const [fs, gs] = [cheapestFirst(aAlone), cheapestFirst(bAlone)];
          const givenA = new Map<number, ReturnType<typeof courseCosts>>();
          for (const g of gs) {
            if (bAlone[g]! + aAlone[fs[0]!]! >= best.cost - 1e-9) break;
            const second = seconds[g]!;
            const aGivenB = addedBy(a, b, second);
            for (const f of fs) {
              const both = aAlone[f]! + bAlone[g]!;
              if (both >= best.cost - 1e-9) break;
              const first = firsts[f]!;
              const withB = both + aGivenB(first.points, first.matePoints);
              if (withB >= best.cost - 1e-9) continue;
              let bGivenA = givenA.get(f);
              if (!bGivenA) {
                bGivenA = addedBy(b, a, first);
                givenA.set(f, bGivenA);
              }
              const cost = withB + bGivenA(second.points, second.matePoints);
              if (cost < best.cost - 1e-9) best = { first, second, cost };
            }
          }
        }
        scene.lines.push(...a.drawn, ...b.drawn);
        const changes = new Map<Routed, Course>();
        if (best.first.points !== a.line.points) changes.set(a, best.first);
        if (best.second.points !== b.line.points) changes.set(b, best.second);
        if (changes.size > 0 && takeIfCheaper(changes)) bettered = true;
      }
    }
    return bettered;
  };
  // Lines are rerouted one at a time until none can be bettered alone, and
  // then in pairs; whenever a pair is bettered, one at a time again.
  const ROUNDS = 6;
  const improve = (order: Routed[]) => {
    for (let round = 0; round < ROUNDS; round++) {
      for (let pass = 0; pass < 4 * ROUNDS && rerouteEach(order); pass++);
      if (!routeInPairs(order)) break;
    }
  };
  // The search starts afresh from a few orders of the lines, each line
  // routed among those before it, and keeps the cheapest drawing it
  // reaches: from left to right, from right to left, and the longest lines
  // first (a quick search, from left to right only). Which line was
  // recorded first plays no part.
  const spanOf = (entry: Routed) =>
    Math.abs(entry.anchor - ownerXOf(entry.from)) +
    (entry.end.layer - entry.from.layer);
  const orders = [
    acrossThePage,
    acrossThePage.toReversed(),
    inOrder(acrossThePage, (a, b) => spanOf(b) - spanOf(a)),
  ];
  let cheapest: { courses: Map<Routed, Course>; total: number } | undefined;
  for (const order of search === 'quick' || routed.length < 2
    ? [acrossThePage]
    : orders) {
    // Across the page, the lines are as first routed, above.
    if (order !== acrossThePage) {
      if (!mayWeighMore()) break;
      scene.lines = [...fixedLines];
      for (const entry of order) {
        adopt(entry, routeLine(entry.from, entry.end, entry.owner, scene));
        scene.lines.push(...entry.drawn);
      }
    }
    costEveryLine();
    tick++;
    for (const entry of routed) changedAt.set(entry, tick);
    triedAt.clear();
    improve(order);
    const total = totalOf();
    if (!cheapest || total < cheapest.total - 1e-9) {
      cheapest = {
        courses: new Map(routed.map((entry) => [entry, courseOf(entry)])),
        total,
      };
    }
  }
  scene.lines = [...fixedLines];
  for (const entry of routed) {
    adopt(entry, cheapest!.courses.get(entry)!);
    scene.lines.push(...entry.drawn);
  }
  const cost = cheapest?.total ?? 0;

  // A line into a child runs on under their symbol in its own direction,
  // from where it meets the outline, so the lines into a child converge on
  // the outline and no turn shows there. One too flat to run on from there
  // (flatter than the outline where the lines converge) ends where they
  // converge, on the outline: a turn there would show, and a line running
  // on would run on past the child.
  for (const entry of routed) {
    const { end } = entry;
    if (end.kind !== 'child') continue;
    const { person } = end;
    const symbol = scene.symbols.find((s) => s.person === person);
    if (!symbol) continue;
    // Its top, or, for a line from the same row, its bottom.
    const top = symbolTop(end.layer, boxh, symbol.shape, cornerRadius);
    const meets = (p: Point) =>
      Math.abs(p.x - end.x) < 1e-9 &&
      (Math.abs(p.y - top) < 1e-9 ||
        Math.abs(p.y - (2 * end.layer + boxh - top)) < 1e-9);
    for (const line of [entry.line, entry.mateLine]) {
      if (!line) continue;
      const meetAt = line.points.findIndex(
        (p, k) => k > 0 && k < line.points.length - 1 && meets(p),
      );
      if (meetAt < 1) continue;
      const under = runOnInside(
        line.points[meetAt - 1]!,
        line.points[meetAt]!,
        symbol,
        scaling.halfStroke ?? 0,
      );
      line.points = [
        ...line.points.slice(0, meetAt + 1),
        ...(under ? [under] : []),
      ];
    }
  }

  // A former partnership's break keeps clear of the auxiliary lines that
  // cross the partnership line, or leave it.
  for (const group of groupLines) {
    if (group.isActive) continue;
    const { x1, x2, y1 } = group.segment;
    const [from, to] = [Math.min(x1, x2), Math.max(x1, x2)];
    const xs = auxiliaryLines.flatMap((line) =>
      segmentsOf(line.points).flatMap((segment) => {
        const [lowY, highY] = [
          Math.min(segment.y1, segment.y2),
          Math.max(segment.y1, segment.y2),
        ];
        if (y1 < lowY - 1e-9 || y1 > highY + 1e-9) return [];
        if (Math.abs(segment.y2 - segment.y1) < 1e-9) return [];
        const x =
          segment.x1 +
          ((y1 - segment.y1) / (segment.y2 - segment.y1)) *
            (segment.x2 - segment.x1);
        return x > from && x < to ? [x] : [];
      }),
    );
    if (xs.length > 0) group.auxiliaryXPositions = [...new Set(xs)];
  }

  // Two co-parents' lines that join follow one course from where they
  // meet: each records that point, so the course is drawn once.
  for (const { line, mateLine } of routed) {
    if (!mateLine) continue;
    const meeting = firstMeeting(mateLine.points, line.points);
    if (!meeting) continue;
    for (const joined of [mateLine, line]) {
      joined.joinsAt = withPoint(joined.points, meeting);
    }
  }

  // Where an auxiliary line crosses another line it hops over it, so the
  // crossing does not read as a junction. Of two auxiliary lines, the later
  // hops.
  const hiddenBySymbol = (p: Point) =>
    scene.symbols.some(
      (symbol) =>
        p.x > symbol.left &&
        p.x < symbol.right &&
        p.y > symbol.top &&
        p.y < symbol.bottom,
    );
  const fixedSegments = scene.lines
    .filter((line) => line.owner === undefined)
    .map((line) => line.segment);
  auxiliaryLines.forEach((line, index) => {
    const crossed = [
      ...fixedSegments,
      ...auxiliaryLines
        .slice(0, index)
        .flatMap((other) => segmentsOf(other.points)),
    ];
    const hops = segmentsOf(line.points).flatMap((segment) =>
      inOrder(
        crossed
          .flatMap((other) => crossing(segment, other) ?? [])
          .filter((at) => !hiddenBySymbol(at))
          // Two lines of one course crossed at one point: one hop.
          .filter(
            (at, k, all) =>
              all.findIndex(
                (p) => Math.hypot(p.x - at.x, p.y - at.y) < 1e-6,
              ) === k,
          ),
        (a, b) =>
          Math.hypot(a.x - segment.x1, a.y - segment.y1) -
          Math.hypot(b.x - segment.x1, b.y - segment.y1),
      ),
    );
    if (hops.length > 0) line.hops = hops;
  });

  // --- Duplicate subject arcs ---
  const allIds = new Set<number>();
  for (let i = 0; i < maxlev; i++) {
    for (let j = 0; j < (layout.n[i] ?? 0); j++) {
      const nid = layout.nid[i]![j]!;
      allIds.add(nid);
    }
  }

  for (const personIdx of allIds) {
    const positions: { x: number; y: number }[] = [];
    for (let i = 0; i < maxlev; i++) {
      for (let j = 0; j < (layout.n[i] ?? 0); j++) {
        if (layout.nid[i]![j] === personIdx) {
          positions.push({ x: layout.pos[i]![j]!, y: i });
        }
      }
    }

    if (positions.length > 1) {
      positions.splice(
        0,
        positions.length,
        ...inOrder(positions, (a, b) => a.x - b.x),
      );

      for (let j = 0; j < positions.length - 1; j++) {
        const p1 = positions[j]!;
        const p2 = positions[j + 1]!;

        const points: Point[] = [];
        for (let k = 0; k < 15; k++) {
          const t = k / 14;
          const xx = p1.x + t * (p2.x - p1.x);
          const seq = -7 + k;
          const yy = p1.y + t * (p2.y - p1.y) + (seq * seq) / 98 - 0.5;
          points.push({ x: xx, y: yy });
        }

        const personId = id ? id[personIdx] : undefined;
        duplicateArcs.push({
          type: 'duplicate-arc',
          path: { type: 'arc', points, dashed: true },
          personIndex: personIdx,
          ...(personId !== undefined ? { personId } : {}),
        });
      }
    }
  }

  return {
    connectors: {
      groupLines,
      parentChildLines,
      auxiliaryLines,
      twinIndicators,
      duplicateArcs,
    },
    cost,
  };
}

/**
 * The columns, on the level above, of a family's parents: a couple's left and
 * right partners, or a single parent twice. See `PedigreeLayout.fam`.
 */
function familyParentColumns(
  layout: PedigreeLayout,
  childLevel: number,
  famId: number,
): { left: number; right: number } {
  if (famId < 0) {
    const col = -famId - 1;
    return { left: col, right: col };
  }
  const left = famId - 1;
  const hasPartnerRight =
    left + 1 < (layout.n[childLevel - 1] ?? 0) &&
    (layout.group[childLevel - 1]?.[left] ?? 0) > 0;
  return { left, right: hasPartnerRight ? left + 1 : left };
}

/**
 * `x`, or the nearest point to it within `preferred` (failing that, within
 * `allowed`) at least `clearance` from every one of `blocked`.
 */
function clearOf(
  x: number,
  blocked: number[],
  clearance: number,
  preferred: [number, number],
  allowed: [number, number],
): number {
  const isClear = (candidate: number) =>
    blocked.every((b) => Math.abs(b - candidate) >= clearance - 1e-9);
  if (isClear(x)) return x;
  const candidates = inOrder(
    blocked.flatMap((b) => [b - clearance, b + clearance]).filter(isClear),
    (a, b) => Math.abs(a - x) - Math.abs(b - x),
  );
  const within = ([from, to]: [number, number]) =>
    candidates.find((c) => c >= from - 1e-9 && c <= to + 1e-9);
  return within(preferred) ?? within(allowed) ?? x;
}

/** Whether `p` lies on the segment from `a` to `b`. */
function liesOn(p: Point, a: Point, b: Point): boolean {
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y) < 1e-9;
  if (Math.abs(cross) / length > 1e-9) return false;
  const along = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
  return along >= -1e-9 && along <= length * length + 1e-9;
}

/** The first point along `course` (after its start) that lies on `other`'s
 * course: where a line joining another meets it. */
function firstMeeting(course: Point[], other: Point[]): Point | undefined {
  const onOther = (p: Point) =>
    other.slice(1).some((b, k) => liesOn(p, other[k]!, b));
  for (let k = 1; k < course.length; k++) {
    const [a, b] = [course[k - 1]!, course[k]!];
    // The places along this piece where it may first touch the other
    // course: its far end, and the ends of the other's pieces on it.
    const along = (p: Point) =>
      (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
    const candidates = inOrder(
      [b, ...other.filter((p) => liesOn(p, a, b))].filter(onOther),
      (p, q) => along(p) - along(q),
    );
    if (candidates[0]) return candidates[0];
  }
  return undefined;
}

/** The index of `p` in a course, inserting it where it lies on a piece. */
function withPoint(points: Point[], p: Point): number {
  const at = points.findIndex(
    (q) => Math.abs(q.x - p.x) < 1e-9 && Math.abs(q.y - p.y) < 1e-9,
  );
  if (at >= 0) return at;
  const k = points
    .slice(1)
    .findIndex((b, index) => liesOn(p, points[index]!, b));
  points.splice(k + 1, 0, { ...p });
  return k + 1;
}

/** The items in groups by key, each group and the groups in first-seen order. */
function groupBy<T, K>(items: T[], keyOf: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

/**
 * The line of descent from a parent (or a couple's descent point) at
 * `parentx`, starting at `startY` (the parent's centre, or the couple's
 * partnership line), down to where it meets the sibling bar, or a lone
 * child's line up, at `childX`. Right-angled (any `branch` but 0): a drop, a
 * level run at `runY` (by default halfway between the parent's row and the
 * sibling bar), and a drop, or one straight drop when the two are in line.
 * With `branch` 0 the shoulder is a diagonal.
 */
function buildParentLink(
  childX: number,
  parentx: number,
  startY: number,
  i: number,
  boxh: number,
  legh: number,
  branch: number,
  runY?: number,
): LineSegment[] {
  const barY = i - legh;
  const parentBottomY = i - 1 + boxh;
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    ({ type: 'line', x1, y1, x2, y2 }) satisfies LineSegment;

  if (Math.abs(childX - parentx) < 1e-9) {
    return [line(parentx, startY, parentx, barY)];
  }
  if (branch === 0) {
    return [
      line(parentx, startY, parentx, parentBottomY),
      line(parentx, parentBottomY, childX, barY),
    ];
  }
  const levelY = runY ?? parentBottomY + (barY - parentBottomY) / 2;
  return [
    line(parentx, startY, parentx, levelY),
    line(parentx, levelY, childX, levelY),
    line(childX, levelY, childX, barY),
  ];
}

/**
 * The line of descent from two co-parents with no partnership line between
 * them, seated at `xs` on the row above level i: a line straight down from
 * each parent (from `startY`, the height of their centres) to `runY`, a
 * level line there joining the two and running on to above the children
 * (`childX`), and from there one line down to the bar. Nothing joins them
 * at the height of their symbols, which would read as a partnership, and
 * no line starts from the empty space between them.
 */
function buildCoParentLink(
  childX: number,
  xs: [number, number],
  startY: number,
  i: number,
  boxh: number,
  legh: number,
  runY?: number,
): LineSegment[] {
  const barY = i - legh;
  const parentBottomY = i - 1 + boxh;
  const levelY = runY ?? parentBottomY + (barY - parentBottomY) / 2;
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    ({ type: 'line', x1, y1, x2, y2 }) satisfies LineSegment;
  // The level line in pieces between the drops and the line down, so that
  // each meets it at a piece's end.
  const stops = [...new Set([...xs, childX])].toSorted((a, b) => a - b);
  return [
    ...xs.map((x) => line(x, startY, x, levelY)),
    ...stops.slice(1).map((x, k) => line(stops[k]!, levelY, x, levelY)),
    line(childX, levelY, childX, barY),
  ];
}

type DescentRun = {
  childX: number;
  parentX: number;
  coParentXs?: [number, number];
};

/** Where a line of descent's level run reaches, from end to end: from
 * the parents (each of two co-parents with no partnership line) to above
 * the children. */
const spanOf = (run: DescentRun) =>
  [
    Math.min(run.childX, run.parentX, ...(run.coParentXs ?? [])),
    Math.max(run.childX, run.parentX, ...(run.coParentXs ?? [])),
  ] as const;

/** Where a line of descent comes down from its parents to its level run:
 * from each of two co-parents with no partnership line, or from the one
 * point it starts at. */
const dropsOf = (run: DescentRun) => run.coParentXs ?? [run.parentX];

/** The runs in groups whose level spans overlap or meet, each in order. */
function overlappingRuns<T extends DescentRun>(runs: T[]): T[][] {
  const span = spanOf;
  const sorted = inOrder(runs, (a, b) => span(a)[0] - span(b)[0]);
  const groups: T[][] = [];
  let reach = -Infinity;
  for (const run of sorted) {
    const [from, to] = span(run);
    if (groups.length === 0 || from > reach + 1e-9) {
      groups.push([run]);
      reach = to;
    } else {
      groups.at(-1)!.push(run);
      reach = Math.max(reach, to);
    }
  }
  return groups;
}

/**
 * The runs stacked from the parents' row down in the order where the fewest
 * pieces cross: a lower run's drops from its parents (one from each of two
 * co-parents) cross every higher run they pass through, and a higher run's
 * drop to its children every lower run. A drop meeting a run's end counts as
 * a crossing, since it would join it. On a tie the given order is kept.
 */
function leastCrossingStack<T extends DescentRun>(runs: T[]): T[] {
  const within = (x: number, run: T) => {
    const [from, to] = spanOf(run);
    return x >= from - 1e-9 && x <= to + 1e-9;
  };
  const crossings = (stack: T[]) => {
    let count = 0;
    for (let a = 0; a < stack.length; a++) {
      for (let b = a + 1; b < stack.length; b++) {
        for (const x of dropsOf(stack[b]!)) {
          if (within(x, stack[a]!)) count++;
        }
        if (within(stack[a]!.childX, stack[b]!)) count++;
      }
    }
    return count;
  };
  if (runs.length > 6) return runs;
  let best = runs;
  let bestCount = crossings(runs);
  const permute = (prefix: T[], rest: T[]) => {
    if (rest.length === 0) {
      const count = crossings(prefix);
      if (count < bestCount) {
        best = prefix;
        bestCount = count;
      }
      return;
    }
    rest.forEach((run, k) =>
      permute([...prefix, run], [...rest.slice(0, k), ...rest.slice(k + 1)]),
    );
  };
  permute([], runs);
  return best;
}
