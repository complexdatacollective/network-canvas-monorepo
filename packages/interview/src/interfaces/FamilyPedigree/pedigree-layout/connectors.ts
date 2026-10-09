import {
  BRACKET_REACH,
  childAttachments,
  crossing,
  type DrawnLine,
  courseCost,
  joinsFor,
  type RouteEnd,
  routeLine,
  routeOptions,
  type RoutingScene,
  segmentsOf,
  symbolOf,
} from './auxiliaryRouting';
import type {
  AuxiliaryConnector,
  DuplicateArc,
  LineSegment,
  ParentChildConnector,
  ParentConnection,
  ParentGroupConnector,
  PedigreeConnectors,
  PedigreeLayout,
  Point,
  ScalingParams,
  TwinIndicator,
  PedigreeEdgeType,
  PedigreeSymbolShape,
} from './types';
import { areConsanguineous } from './utils';

const AUXILIARY_EDGE_TYPES = new Set<PedigreeEdgeType>(['donor', 'surrogate']);

/** The height of the question mark between twins of unknown zygosity, as a
 * fraction of a symbol's height. */
const TWIN_LABEL_SIZE = 0.3;

function isPrimaryEdge(edgeType: PedigreeEdgeType): boolean {
  return !AUXILIARY_EDGE_TYPES.has(edgeType);
}

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
): PedigreeConnectors {
  const { boxWidth: boxw, boxHeight: boxh, legHeight: legh } = scaling;
  const maxlev = layout.nid.length;
  const maxcol = Math.max(...layout.n, 0);

  const groupLines: ParentGroupConnector[] = [];
  const groupLineIndex = new Map<string, number>();
  const parentChildLines: ParentChildConnector[] = [];
  const auxiliaryLines: AuxiliaryConnector[] = [];
  const twinIndicators: TwinIndicator[] = [];
  const duplicateArcs: DuplicateArc[] = [];
  const renderedPartnerPairs = new Set<string>();
  // Only a recorded former partnership is drawn with the break. Co-parents
  // the layout pairs up without a recorded partnership are drawn joined by a
  // plain line: nothing says they were ever partners, let alone separated.
  const isFormerPartnership = (pairKey: string) =>
    activePartnerPairs !== undefined &&
    !activePartnerPairs.has(pairKey) &&
    (partnerPairs === undefined || partnerPairs.has(pairKey));
  const nodeLocation = new Map<
    number,
    { layer: number; x: number; y: number }
  >();
  /** An adopted person is drawn within brackets. */
  const isBracketed = (personIndex: number) =>
    (parents[personIndex] ?? []).some((p) => p.edgeType === 'adoptive');

  for (let layer = 0; layer < maxlev; layer++) {
    for (let col = 0; col < (layout.n[layer] ?? 0); col++) {
      const personIndex = layout.nid[layer]![col]!;
      if (nodeLocation.has(personIndex)) continue;
      nodeLocation.set(personIndex, {
        layer,
        x: layout.pos[layer]![col]!,
        y: layer + boxh / 2,
      });
    }
  }

  // --- Parent group lines (all partner pairs, marked active/inactive) ---
  for (let i = 0; i < maxlev; i++) {
    const tempy = i + boxh / 2;
    for (let j = 0; j < maxcol; j++) {
      if (layout.group[i]?.[j] && layout.group[i]![j]! > 0) {
        const leftId = layout.nid[i]![j]!;
        const rightId = layout.nid[i]![j + 1]!;
        const pairKey = `${Math.min(leftId, rightId)},${Math.max(leftId, rightId)}`;

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
    const routedPairs = [...partnerPairs]
      .filter((pairKey) => !renderedPartnerPairs.has(pairKey))
      .map((pairKey) => {
        const [first, second] = pairKey.split(',').map(Number);
        const firstLocation =
          first === undefined ? undefined : nodeLocation.get(first);
        const secondLocation =
          second === undefined ? undefined : nodeLocation.get(second);
        return { pairKey, first, second, firstLocation, secondLocation };
      })
      .toSorted((a, b) => {
        const span = (pair: typeof a) =>
          pair.firstLocation && pair.secondLocation
            ? Math.abs(pair.firstLocation.x - pair.secondLocation.x) +
              Math.abs(pair.firstLocation.layer - pair.secondLocation.layer)
            : 0;
        return span(a) - span(b);
      });

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

  // Children whose couple could not sit together have no family in the
  // layout (fam 0). Those who share every primary parent, in the same roles,
  // still form a sibship: a sibling bar with uplines and twin marks, though no
  // line of descent comes down from a couple; each parent joins the bar with
  // a line of its own. Each such sibship gets a key past every column, so it
  // never meets a family's.
  const familyOf = layout.fam.map((row) => [...row]);
  const coupleless = new Set<number>();
  for (let i = 1; i < maxlev; i++) {
    const sibships = new Map<string, number[]>();
    for (let j = 0; j < (layout.n[i] ?? 0); j++) {
      if ((layout.fam[i]?.[j] ?? 0) !== 0 || layout.groupMember[i]?.[j]) {
        continue;
      }
      const primary = (parents[layout.nid[i]![j]!] ?? []).filter((p) =>
        isPrimaryEdge(p.edgeType),
      );
      if (primary.length === 0) continue;
      const key = primary
        .map((p) => `${p.parentIndex}:${p.edgeType}`)
        .toSorted()
        .join(',');
      sibships.set(key, [...(sibships.get(key) ?? []), j]);
    }
    for (const columns of sibships.values()) {
      if (columns.length < 2) continue;
      const famId = maxcol + 1 + coupleless.size;
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

  // --- Parent-child lines ---
  for (let i = 1; i < maxlev; i++) {
    const familyIds = [...new Set(familyOf[i]!.filter((v) => v !== 0))];

    for (const fam of familyIds) {
      if (coupleless.has(fam)) {
        const whoIdx = familyOf[i]!.flatMap((f, j) => (f === fam ? [j] : []));
        const { uplines, siblingBar } = sibshipLines(i, whoIdx);
        joinSibship(
          `${i},${fam}`,
          i,
          whoIdx,
          siblingBar,
          uplines.map((upline) => upline.x2),
        );
        const sibshipParents = (
          parents[layout.nid[i]![whoIdx[0]!]!] ?? []
        ).filter((p) => isPrimaryEdge(p.edgeType));
        const childIds = id
          ? whoIdx.map((j) => id[layout.nid[i]![j]!])
          : undefined;
        parentChildLines.push({
          type: 'parent-child',
          edgeType:
            sibshipParents.find((p) => p.edgeType === 'biological')?.edgeType ??
            sibshipParents[0]!.edgeType,
          uplines,
          ...(siblingBar.x2 - siblingBar.x1 > 1e-9 ? { siblingBar } : {}),
          parentLink: [],
          ...(id
            ? {
                parentIds: sibshipParents.map((p) => id[p.parentIndex] ?? ''),
                uplineChildIds: childIds,
              }
            : {}),
        });
        continue;
      }

      const { left: coupleLeft, right: coupleRight } = familyParentColumns(
        layout,
        i,
        fam,
      );
      const coupleLeftId = layout.nid[i - 1]![coupleLeft]!;
      const coupleRightId = layout.nid[i - 1]![coupleRight]!;
      const leftPos = layout.pos[i - 1]![coupleLeft]!;
      const rightPos = layout.pos[i - 1]![coupleRight]!;
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

      const descentOf = (j: number) =>
        coupleDescent(
          parents[layout.nid[i]![j]!] ?? [],
          coupleLeftId,
          coupleRightId,
        );
      const descentParents = (from: DescentSource) =>
        new Set(
          from === 'left'
            ? [coupleLeftId]
            : from === 'right'
              ? [coupleRightId]
              : [coupleLeftId, coupleRightId],
        );
      // A single parent's children descend from the parent, not from a
      // partner line they may also be on.
      const glIdx =
        fam > 0 ? groupLineIndex.get(`${i - 1},${coupleLeft}`) : undefined;
      const descentXOf = (from: DescentSource) => {
        const descentX =
          from === 'left'
            ? leftPos
            : from === 'right'
              ? rightPos
              : (leftPos + rightPos) / 2;
        if (glIdx !== undefined) {
          const gl = groupLines[glIdx]!;
          gl.descentXPositions ??= [];
          if (!gl.descentXPositions.includes(descentX)) {
            gl.descentXPositions.push(descentX);
          }
        }
        return descentX;
      };

      const whoIdx: number[] = [];
      const marriedInIdx: number[] = [];
      for (let j = 0; j < layout.fam[i]!.length; j++) {
        if (layout.fam[i]![j] !== fam) continue;
        if (layout.groupMember[i]?.[j]) {
          marriedInIdx.push(j);
        } else {
          whoIdx.push(j);
        }
      }

      // Children whose descent starts at the same place share a sibling bar.
      for (const [from, columns] of groupBy(whoIdx, (j) => descentOf(j).from)) {
        const descentX = descentXOf(from);
        const { uplines, siblingBar, minTarget, maxTarget } = sibshipLines(
          i,
          columns,
        );
        for (const j of columns) {
          descentParentsOf.set(`${i},${j}`, descentParents(from));
        }

        // Where the parent link meets the sibling bar: below the descent
        // where it can be, but never over someone on the children's row who
        // has no line up from this bar (a partner sitting between two
        // siblings), who would read as one of these children.
        const targetRange = maxTarget - minTarget;
        const [footFrom, footTo] =
          targetRange < 2 * pconnect
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
        joinSibship(`${i},${fam},${from}`, i, columns, siblingBar, [
          x1,
          ...uplines.map((upline) => upline.x2),
          ...notOfThisBar,
        ]);
        const parentLink = buildParentLink(x1, descentX, i, boxh, legh, branch);

        // Each child's own tie sets the style of the line to them. The
        // parent link and the bar between it and the children of the first
        // style (solid, when any child is a birth child) are drawn in that
        // style; each other style continues the bar out to its own children.
        const byStyle = groupBy(
          columns.map((_, k) => k),
          (k) => descentOf(columns[k]!).edgeType,
        );
        const [primaryStyle, primaryKs] = byStyle.has('biological')
          ? (['biological', byStyle.get('biological')!] as const)
          : [...byStyle][0]!;
        const targetOf = (k: number) => uplines[k]!.x2;
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
          parentChildLines.push({
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
          });
        };
        pushSibshipPart(
          primaryStyle,
          primaryKs,
          primaryMin,
          primaryMax,
          parentLink,
        );
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

      // A married-in member of the family descends on a line of their own.
      for (const j of marriedInIdx) {
        const { from, edgeType } = descentOf(j);
        const descentX = descentXOf(from);
        descentParentsOf.set(`${i},${j}`, descentParents(from));
        const childX = layout.pos[i]![j]!;
        parentChildLines.push({
          type: 'parent-child',
          edgeType,
          uplines: [
            {
              type: 'line',
              x1: childX,
              y1: i + boxh / 2,
              x2: childX,
              y2: i - legh,
            },
          ],
          parentLink: buildParentLink(childX, descentX, i, boxh, legh, branch),
          ...(id
            ? { parentIds: parentIdsForFamily, uplineChildIds: [childIdOf(j)] }
            : {}),
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
    const markY = (i: number) => i - legh / 2;
    // Where the twin's line up crosses the height of the marks: an upline
    // starts at the centre of the child's symbol. A twin with no line up
    // (no recorded parent drawn) is marked straight above their symbol.
    const crossingX = (i: number, col: number) => {
      const x = layout.pos[i]![col]!;
      const upline = allUplines.find(
        (line) =>
          Math.abs(line.x1 - x) < 1e-9 &&
          Math.abs(line.y1 - (i + boxh / 2)) < 1e-9,
      );
      if (!upline || Math.abs(upline.y2 - upline.y1) < 1e-9) return x;
      const t = (markY(i) - upline.y1) / (upline.y2 - upline.y1);
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
        const [leftX, rightX] = [crossingX(i, col), crossingX(i, col + 1)];
        const y = markY(i);
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

  // --- Auxiliary lines for donor/surrogate edges ---
  // Group connections by (parentIndex, edgeType, sibship), tracking which
  // specific children each auxiliary parent connects to.
  const auxConnections = new Map<
    string,
    {
      parentIndex: number;
      edgeType: 'donor' | 'surrogate';
      childLevel: number;
      sibship: string;
      childColumns: number[];
    }
  >();

  for (let i = 0; i < maxlev; i++) {
    for (let j = 0; j < (layout.n[i] ?? 0); j++) {
      const childId = layout.nid[i]![j]!;
      if (childId < 0) continue;
      // A child in no sibship has no sibling bar, so each of its donors and
      // surrogates joins it directly.
      const sibship = sibshipOf.get(`${i},${j}`) ?? `${i},none`;

      const childParents = parents[childId] ?? [];
      for (const pc of childParents) {
        if (pc.edgeType === 'donor' || pc.edgeType === 'surrogate') {
          // One line carries one relationship, so a person who is a donor to
          // one child and a surrogate to another is grouped twice.
          const key = `${pc.parentIndex},${pc.edgeType},${sibship}`;
          const existing = auxConnections.get(key);
          if (existing) {
            existing.childColumns.push(j);
          } else {
            auxConnections.set(key, {
              parentIndex: pc.parentIndex,
              edgeType: pc.edgeType,
              childLevel: i,
              sibship,
              childColumns: [j],
            });
          }
        }
      }
    }
  }

  // --- Direct lines from parents a child's family does not name ---
  // Group direct parent connections by (parentIndex, edgeType, sibship) so
  // we can decide per-parent whether to connect to the sibling bar or
  // directly to individual children.
  const socialConnections = new Map<
    string,
    {
      parentIndex: number;
      /** A partner seated beside the parent who is the child's parent in
       * the same way: the line then comes down from the couple. */
      partnerIndex?: number;
      edgeType: PedigreeEdgeType;
      childLevel: number;
      sibship: string;
      childColumns: number[];
    }
  >();
  const placeOf = new Map<number, { layer: number; col: number }>();
  for (let i = 0; i < maxlev; i++) {
    for (let j = 0; j < (layout.n[i] ?? 0); j++) {
      const person = layout.nid[i]![j]!;
      if (!placeOf.has(person)) placeOf.set(person, { layer: i, col: j });
    }
  }
  /** Whether two people sit side by side joined by a partnership line. */
  const seatedAsCouple = (a: number, b: number) => {
    const at = placeOf.get(a);
    const bt = placeOf.get(b);
    if (!at || !bt || at.layer !== bt.layer) return false;
    if (Math.abs(at.col - bt.col) !== 1) return false;
    return (layout.group[at.layer]?.[Math.min(at.col, bt.col)] ?? 0) > 0;
  };

  for (let i = 0; i < maxlev; i++) {
    for (let j = 0; j < (layout.n[i] ?? 0); j++) {
      const childId = layout.nid[i]![j]!;
      const childParents = parents[childId] ?? [];

      const parentEdges = childParents.filter((pc) =>
        isPrimaryEdge(pc.edgeType),
      );
      // A child's line of descent draws the ties of the parents it starts
      // from. Every other primary parent is joined to the child by a line of
      // their own, whether or not they are anyone's partner.
      const descentParents = descentParentsOf.get(`${i},${j}`);
      const sibship = sibshipOf.get(`${i},${j}`) ?? `${i},none`;

      // A child with no line of descent (their parents sit more than a row
      // above them) still descends from a couple of their parents seated
      // together, tied to them in the same way: one line comes down from
      // the couple rather than one from each.
      const own = parentEdges.filter(
        (p) => !descentParents?.has(p.parentIndex),
      );
      const partnerOf = new Map<number, number>();
      if (!descentParents) {
        for (const a of own) {
          for (const b of own) {
            if (a.parentIndex >= b.parentIndex) continue;
            if (a.edgeType !== b.edgeType) continue;
            if (partnerOf.has(a.parentIndex) || partnerOf.has(b.parentIndex)) {
              continue;
            }
            if (!seatedAsCouple(a.parentIndex, b.parentIndex)) continue;
            partnerOf.set(a.parentIndex, b.parentIndex);
            partnerOf.set(b.parentIndex, -1);
          }
        }
      }

      for (const parentEdge of own) {
        const parentId = parentEdge.parentIndex;
        const partnerId = partnerOf.get(parentId);
        if (partnerId === -1) continue;

        // Each line carries the parent's own relationship to the child.
        const { edgeType } = parentEdge;

        // One line carries one relationship: a parent who is biological to one
        // child and social to another is grouped once for each.
        const key = `${parentId}${partnerId === undefined ? '' : `+${partnerId}`},${edgeType},${sibship}`;
        const existing = socialConnections.get(key);
        if (existing) {
          existing.childColumns.push(j);
        } else {
          socialConnections.set(key, {
            parentIndex: parentId,
            ...(partnerId === undefined ? {} : { partnerIndex: partnerId }),
            edgeType,
            childLevel: i,
            sibship,
            childColumns: [j],
          });
        }
      }
    }
  }

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
  };
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
      scene.lines.push({ segment, kind: 'other' });
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
    for (const segment of line.uplines) {
      scene.lines.push({ segment, kind: 'upline' });
    }
  }
  for (const twin of twinIndicators) {
    if (twin.segment)
      scene.lines.push({ segment: twin.segment, kind: 'other' });
  }

  const plans = [...auxConnections.values(), ...socialConnections.values()]
    .map((conn) => {
      const parentAt = nodeLocation.get(conn.parentIndex);
      if (!parentAt) return undefined;
      const partnerAt =
        'partnerIndex' in conn && conn.partnerIndex !== undefined
          ? nodeLocation.get(conn.partnerIndex)
          : undefined;
      const from = {
        person: conn.parentIndex,
        // A couple's line starts on their partnership line, between them.
        x: partnerAt ? (parentAt.x + partnerAt.x) / 2 : parentAt.x,
        layer: parentAt.layer,
      };
      const owner = `${conn.parentIndex}${partnerAt ? '+' : ''},${conn.edgeType}`;
      const bar = sibshipBar.get(conn.sibship);
      const totalChildren = sibshipSize.get(conn.sibship) ?? 0;
      const isParentOfAllSiblings = conn.childColumns.length >= totalChildren;
      // A parent of every child in the sibship joins its bar. (One on the
      // children's own row, a relative who raises them, joins each child,
      // from below, instead.)
      const joinsBar =
        bar !== undefined &&
        isParentOfAllSiblings &&
        totalChildren > 1 &&
        parentAt.layer < conn.childLevel;
      return { conn, from, owner, bar, joinsBar };
    })
    .filter((plan) => plan !== undefined);

  // The lines that end on each child share the child's edge in the order of
  // their parents, left to right, so that they neither cross nor bunch.
  const endsOnChild = new Map<string, { plan: number; x: number }[]>();
  plans.forEach((plan, index) => {
    if (plan.joinsBar) return;
    for (const col of plan.conn.childColumns) {
      const key = `${plan.conn.childLevel},${col}`;
      endsOnChild.set(key, [
        ...(endsOnChild.get(key) ?? []),
        { plan: index, x: plan.from.x },
      ]);
    }
  });
  // Whether a child's own line up to their parents leaves from the middle
  // of their top edge.
  const hasUpline = (layer: number, x: number) =>
    allUplines.some(
      (upline) =>
        Math.abs(upline.x1 - x) < 1e-9 &&
        Math.abs(upline.y1 - (layer + boxh / 2)) < 1e-9,
    );
  // The places each line may end on its child: with the lines kept to the
  // side of the child their parent is on, and (where that differs) spread
  // over the whole edge, which is tried once everything is routed.
  const attachmentsOf = new Map<string, number[]>();
  const wholeEdgeAttachmentsOf = new Map<string, number[]>();
  for (const [key, ends] of endsOnChild) {
    const [layer, col] = key.split(',').map(Number) as [number, number];
    const childX = layout.pos[layer]![col]!;
    const ordered = ends.toSorted((a, b) => a.x - b.x || a.plan - b.plan);
    const placesFor = (bySide: boolean) =>
      childAttachments(
        childX,
        boxw,
        shapes?.[layout.nid[layer]![col]!],
        ordered.map((end) => end.x),
        hasUpline(layer, childX),
        bySide,
      );
    const [bySide, wholeEdge] = [placesFor(true), placesFor(false)];
    const differs = bySide.some(
      (places, index) => places.join() !== wholeEdge[index]!.join(),
    );
    ordered.forEach((end, index) => {
      attachmentsOf.set(`${end.plan}|${key}`, bySide[index]!);
      if (differs) {
        wholeEdgeAttachmentsOf.set(`${end.plan}|${key}`, wholeEdge[index]!);
      }
    });
  }

  // Each line as routed, so that it can be routed again against the lines
  // routed after it.
  const routed: {
    from: (typeof plans)[number]['from'];
    end: RouteEnd;
    owner: string;
    line: AuxiliaryConnector;
    drawn: DrawnLine[];
    endX: number;
    /** The joins on the sibling bar it meets, if it meets one. */
    stems?: number[];
    /** For a line ending on a child: "plan|level,column". */
    slot?: string;
  }[] = [];
  const drawnOf = (points: Point[], owner: string): DrawnLine[] =>
    segmentsOf(points).map((segment) => ({ segment, kind: 'other', owner }));

  plans.forEach(({ conn, from, owner, bar, joinsBar }, planIndex) => {
    const parentNodeId = id ? id[conn.parentIndex] : undefined;

    const draw = (
      end: RouteEnd,
      childNodeId: string | undefined,
      stems?: number[],
      slot?: string,
    ) => {
      const { points, endX } = routeLine(from, end, owner, scene);
      const drawn = drawnOf(points, owner);
      scene.lines.push(...drawn);
      const line: AuxiliaryConnector = {
        type: 'auxiliary',
        edgeType: conn.edgeType,
        points,
        ...(id ? { endpointIds: [parentNodeId, childNodeId] } : {}),
      };
      auxiliaryLines.push(line);
      routed.push({
        from,
        end,
        owner,
        line,
        drawn,
        endX,
        ...(stems ? { stems } : {}),
        ...(slot ? { slot } : {}),
      });
      return endX;
    };

    if (joinsBar && bar) {
      // Joins the bar away from every line already meeting it.
      const stems = sibshipStems.get(conn.sibship) ?? [];
      const joined = draw(
        {
          kind: 'bar',
          bar,
          layer: conn.childLevel,
          joins: joinsFor(bar, stems),
        },
        undefined,
        stems,
        undefined,
      );
      stems.push(joined);
      return;
    }
    // A parent of only some children (or of a child with no sibling bar)
    // joins each child, at a point of the line's own on their top edge.
    for (const col of conn.childColumns) {
      const childPersonIndex = layout.nid[conn.childLevel]![col]!;
      const childX = layout.pos[conn.childLevel]![col]!;
      const key = `${conn.childLevel},${col}`;
      const shape = shapes?.[childPersonIndex];
      draw(
        {
          kind: 'child',
          person: childPersonIndex,
          x: childX,
          layer: conn.childLevel,
          attachments: attachmentsOf.get(`${planIndex}|${key}`) ?? [childX],
          ...(shape ? { shape } : {}),
        },
        id ? id[childPersonIndex] : undefined,
        undefined,
        `${planIndex}|${key}`,
      );
    }
  });

  type Routed = (typeof routed)[number];
  const courseOf = (entry: Routed) => ({
    points: entry.line.points,
    endX: entry.endX,
  });
  const adopt = (entry: Routed, course: { points: Point[]; endX: number }) => {
    entry.line.points = course.points;
    entry.drawn = drawnOf(course.points, entry.owner);
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
  // Each line again, against every other line, those routed after it
  // included, until none can be bettered.
  const rerouteEach = (entries: Routed[], passes: number) => {
    for (let pass = 0; pass < passes; pass++) {
      let bettered = false;
      for (const entry of entries) {
        withoutLines(entry);
        const next = routeLine(
          entry.from,
          entry.end,
          entry.owner,
          scene,
          courseOf(entry),
        );
        if (next.points !== entry.line.points) {
          bettered = true;
          adopt(entry, next);
        }
        scene.lines.push(...entry.drawn);
      }
      if (!bettered) break;
    }
  };
  // Two lines that still cross or crowd each other are routed together:
  // of the best few courses for each, the two that are best together. (Two
  // lines down one gap may each be clear only on the other's lane.)
  const PAIR_OPTIONS = 8;
  const costAmong = (entry: Routed, points: Point[], extra: DrawnLine[]) =>
    courseCost(
      entry.from,
      entry.end,
      entry.owner,
      { ...scene, lines: [...scene.lines, ...extra] },
      points,
    );
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
    const [p, q] = [areaOf(a.line.points), areaOf(b.line.points)];
    return (
      p.right >= q.left &&
      p.left <= q.right &&
      p.bottom >= q.top &&
      p.top <= q.bottom
    );
  };
  const routeInPairs = (entries: Routed[]) => {
    let bettered = false;
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [a, b] = [entries[i]!, entries[j]!];
        if (!mayMeet(a, b)) continue;
        withoutLines(a, b);
        const together = (first: Point[], second: Point[]) =>
          costAmong(a, first, drawnOf(second, b.owner)) +
          costAmong(b, second, drawnOf(first, a.owner));
        const apart =
          costAmong(a, a.line.points, []) + costAmong(b, b.line.points, []);
        let best = {
          first: courseOf(a),
          second: courseOf(b),
          cost: together(a.line.points, b.line.points),
        };
        if (best.cost > apart + 1e-9) {
          const options = (entry: Routed) =>
            routeOptions(
              entry.from,
              entry.end,
              entry.owner,
              scene,
              PAIR_OPTIONS,
            );
          const seconds = options(b);
          for (const first of options(a)) {
            for (const second of seconds) {
              const cost = together(first.points, second.points);
              if (cost < best.cost - 1e-9) best = { first, second, cost };
            }
          }
          if (best.first.points !== a.line.points) {
            adopt(a, best.first);
            bettered = true;
          }
          if (best.second.points !== b.line.points) {
            adopt(b, best.second);
            bettered = true;
          }
        }
        scene.lines.push(...a.drawn, ...b.drawn);
      }
    }
    return bettered;
  };
  const optimise = (entries: Routed[]) => {
    rerouteEach(entries, 3);
    if (routeInPairs(entries)) rerouteEach(entries, 1);
  };
  optimise(routed);

  // A side of a child kept for the lines from that side may be reached only
  // the long way round, when their parents sit rows above (the child's line
  // up is no barrier there): the lines into such a child are routed again
  // over the whole edge, and kept so when that is better.
  const totalCost = (entries: Routed[]) => {
    withoutLines(...entries);
    const total = entries.reduce(
      (sum, entry) =>
        sum +
        costAmong(
          entry,
          entry.line.points,
          entries.filter((other) => other !== entry).flatMap((o) => o.drawn),
        ),
      0,
    );
    for (const entry of entries) scene.lines.push(...entry.drawn);
    return total;
  };
  const children = new Set(
    routed.flatMap((entry) =>
      entry.slot && wholeEdgeAttachmentsOf.has(entry.slot)
        ? [entry.slot.split('|')[1]!]
        : [],
    ),
  );
  let rerouted = false;
  for (const child of children) {
    const entries = routed.filter(
      (entry) => entry.slot?.split('|')[1] === child,
    );
    const before = entries.map((entry) => ({
      end: entry.end,
      course: courseOf(entry),
    }));
    const kept = totalCost(entries);
    withoutLines(...entries);
    for (const entry of entries) {
      if (entry.end.kind === 'child') {
        entry.end = {
          ...entry.end,
          attachments: wholeEdgeAttachmentsOf.get(entry.slot!)!,
        };
      }
      adopt(entry, routeLine(entry.from, entry.end, entry.owner, scene));
      scene.lines.push(...entry.drawn);
    }
    optimise(entries);
    if (totalCost(entries) < kept - 1e-9) {
      rerouted = true;
    } else {
      withoutLines(...entries);
      entries.forEach((entry, index) => {
        entry.end = before[index]!.end;
        adopt(entry, before[index]!.course);
        scene.lines.push(...entry.drawn);
      });
    }
  }
  if (rerouted) optimise(routed);

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
      crossed
        .flatMap((other) => crossing(segment, other) ?? [])
        .filter((at) => !hiddenBySymbol(at))
        .toSorted(
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
      positions.sort((a, b) => a.x - b.x);

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
    groupLines,
    parentChildLines,
    auxiliaryLines,
    twinIndicators,
    duplicateArcs,
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

type DescentSource = 'left' | 'right' | 'both';

/**
 * Where a child's line of descent from their family's parents starts, and the
 * style it is drawn in. The descent draws a birth (biological) parent's tie
 * solid: from the couple when both partners are birth parents, from the one
 * who is when only one is (the other partner is then joined to the child by a
 * line of their own). When neither is, it comes from the couple, dashed.
 */
function coupleDescent(
  childParents: ParentConnection[],
  leftId: number,
  rightId: number,
): { from: DescentSource; edgeType: PedigreeEdgeType } {
  const tieTo = (parentId: number) =>
    childParents.find(
      (p) => p.parentIndex === parentId && isPrimaryEdge(p.edgeType),
    )?.edgeType;
  const left = tieTo(leftId);
  if (leftId === rightId) {
    return { from: 'both', edgeType: left ?? 'biological' };
  }
  const right = tieTo(rightId);
  if (left === 'biological' && right === 'biological') {
    return { from: 'both', edgeType: 'biological' };
  }
  if (left === 'biological') return { from: 'left', edgeType: left };
  if (right === 'biological') return { from: 'right', edgeType: right };
  if (right === undefined) {
    return { from: 'left', edgeType: left ?? 'biological' };
  }
  if (left === undefined) return { from: 'right', edgeType: right };
  return {
    from: 'both',
    edgeType: left === 'adoptive' || right === 'adoptive' ? 'adoptive' : left,
  };
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
  const candidates = blocked
    .flatMap((b) => [b - clearance, b + clearance])
    .filter(isClear)
    .toSorted((a, b) => Math.abs(a - x) - Math.abs(b - x));
  const within = ([from, to]: [number, number]) =>
    candidates.find((c) => c >= from - 1e-9 && c <= to + 1e-9);
  return within(preferred) ?? within(allowed) ?? x;
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
 * `parentx` down to where it meets the sibling bar, or a lone child's line up,
 * at `childX`. Right-angled (any `branch` but 0): a drop, a level run
 * halfway between the parent's row and the sibling bar, and a drop, or one
 * straight drop when the two are in line. With `branch` 0 the shoulder is a
 * diagonal.
 */
function buildParentLink(
  childX: number,
  parentx: number,
  i: number,
  boxh: number,
  legh: number,
  branch: number,
): LineSegment[] {
  const barY = i - legh;
  const parentCenterY = i - 1 + boxh / 2;
  const parentBottomY = i - 1 + boxh;
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    ({ type: 'line', x1, y1, x2, y2 }) satisfies LineSegment;

  if (Math.abs(childX - parentx) < 1e-9) {
    return [line(parentx, parentCenterY, parentx, barY)];
  }
  if (branch === 0) {
    return [
      line(parentx, parentCenterY, parentx, parentBottomY),
      line(parentx, parentBottomY, childX, barY),
    ];
  }
  const runY = parentBottomY + (barY - parentBottomY) / 2;
  return [
    line(parentx, parentCenterY, parentx, runY),
    line(parentx, runY, childX, runY),
    line(childX, runY, childX, barY),
  ];
}
