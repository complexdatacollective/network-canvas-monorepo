import {
  attachmentsFor,
  joinsFor,
  type RouteEnd,
  routeLine,
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
} from './types';
import { ancestor } from './utils';

const AUXILIARY_EDGE_TYPES = new Set<PedigreeEdgeType>(['donor', 'surrogate']);

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
 * @param branch - branch style for parent-child links (0=diagonal, >0=right-angle). Default 0.6
 * @param pconnect - where parent link meets sibling bar (0-1). Default 0.5
 * @param partnerPairs - all recorded partner pairs. Used to route recorded
 *   partnerships that the adjacent-node layout cannot encode directly.
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

        const x1 = layout.pos[i]![j]!;
        const x2 = layout.pos[i]![j + 1]!;
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
        return location.x + side * boxw * Math.min(0.15 + 0.1 * stem, 0.45);
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

      const ancestorsLeft = ancestor(leftIndex, parents);
      const ancestorsRight = new Set(ancestor(rightIndex, parents));
      const isDouble = ancestorsLeft.some((value) => ancestorsRight.has(value));
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
      const twinToLeft: number[] = [0];
      for (let k = 1; k < whoIdx.length; k++) {
        twinToLeft.push(layout.twins[i]?.[whoIdx[k]!] ?? 0);
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

    // Twin indicators
    if (layout.twins) {
      for (let k = 0; k < whoIdx.length; k++) {
        // The twin bar/label joins siblings k and k+1, who share a twin
        // group target. Resolve their node ids so the connector can be
        // dimmed by node membership in the focal view.
        const twinColumns = [whoIdx[k], whoIdx[k + 1]];
        const twinIds = id
          ? twinColumns
              .map((col) =>
                col !== undefined ? layout.nid[i]?.[col] : undefined,
              )
              .filter((idx) => idx !== undefined)
              .map((idx) => id[idx] ?? '')
          : undefined;

        if (layout.twins[i]?.[whoIdx[k]!] === 1) {
          const temp1 = (layout.pos[i]![whoIdx[k]!]! + target[k]!) / 2;
          const temp2 = (layout.pos[i]![whoIdx[k + 1]!]! + target[k]!) / 2;
          twinIndicators.push({
            type: 'twin',
            code: 1,
            segment: {
              type: 'line',
              x1: temp1,
              y1: i - legh / 2,
              x2: temp2,
              y2: i - legh / 2,
            },
            ...(twinIds ? { twinIds } : {}),
          });
        }

        if (layout.twins[i]?.[whoIdx[k]!] === 3) {
          const temp1 = (layout.pos[i]![whoIdx[k]!]! + target[k]!) / 2;
          const temp2 = (layout.pos[i]![whoIdx[k + 1]!]! + target[k]!) / 2;
          twinIndicators.push({
            type: 'twin',
            code: 3,
            label: { x: (temp1 + temp2) / 2, y: i - legh / 2 },
            ...(twinIds ? { twinIds } : {}),
          });
        }

        if (layout.twins[i]?.[whoIdx[k]!] === 2) {
          twinIndicators.push({
            type: 'twin',
            code: 2,
            ...(twinIds ? { twinIds } : {}),
          });
        }
      }
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
          siblingBar,
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

        // Where the parent link meets the sibling bar
        const targetRange = maxTarget - minTarget;
        const x1 =
          targetRange < 2 * pconnect
            ? (minTarget + maxTarget) / 2
            : Math.max(
                minTarget + pconnect,
                Math.min(maxTarget - pconnect, descentX),
              );
        joinSibship(`${i},${fam},${from}`, i, columns, siblingBar, [
          x1,
          ...uplines.map((upline) => upline.x2),
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
            siblingBar: {
              type: 'line',
              x1: barFrom,
              y1: siblingBar.y1,
              x2: barTo,
              y2: siblingBar.y1,
            },
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
          siblingBar: {
            type: 'line',
            x1: childX,
            y1: i - legh,
            x2: childX,
            y2: i - legh,
          },
          parentLink: buildParentLink(childX, descentX, i, boxh, legh, branch),
          ...(id
            ? { parentIds: parentIdsForFamily, uplineChildIds: [childIdOf(j)] }
            : {}),
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
      edgeType: PedigreeEdgeType;
      childLevel: number;
      sibship: string;
      childColumns: number[];
    }
  >();

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

      for (const parentEdge of parentEdges) {
        const parentId = parentEdge.parentIndex;
        if (descentParents?.has(parentId)) continue;

        // Each line carries the parent's own relationship to the child.
        const { edgeType } = parentEdge;

        // One line carries one relationship: a parent who is biological to one
        // child and social to another is grouped once for each.
        const key = `${parentId},${edgeType},${sibship}`;
        const existing = socialConnections.get(key);
        if (existing) {
          existing.childColumns.push(j);
        } else {
          socialConnections.set(key, {
            parentIndex: parentId,
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
      const bracketed = (parents[personIndex] ?? []).some(
        (p) => p.edgeType === 'adoptive',
      );
      const { symbol, brackets } = symbolOf(
        personIndex,
        layout.pos[i]![j]!,
        i,
        boxw,
        boxh,
        bracketed,
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
    for (const segment of line.parentLink) {
      scene.lines.push({ segment, kind: 'other' });
    }
    scene.lines.push({ segment: line.siblingBar, kind: 'bar' });
    for (const segment of line.uplines) {
      scene.lines.push({ segment, kind: 'upline' });
    }
  }
  for (const twin of twinIndicators) {
    if (twin.segment)
      scene.lines.push({ segment: twin.segment, kind: 'other' });
  }

  const usedAttachments = new Map<string, number[]>();
  for (const conn of [
    ...auxConnections.values(),
    ...socialConnections.values(),
  ]) {
    const parentAt = nodeLocation.get(conn.parentIndex);
    if (!parentAt) continue;
    const from = {
      person: conn.parentIndex,
      x: parentAt.x,
      layer: parentAt.layer,
    };
    const owner = `${conn.parentIndex},${conn.edgeType}`;
    const parentNodeId = id ? id[conn.parentIndex] : undefined;

    const bar = sibshipBar.get(conn.sibship);
    const totalChildren = sibshipSize.get(conn.sibship) ?? 0;
    const isParentOfAllSiblings = conn.childColumns.length >= totalChildren;

    const draw = (end: RouteEnd, childNodeId: string | undefined) => {
      const { points, endX } = routeLine(from, end, owner, scene);
      for (const segment of segmentsOf(points)) {
        scene.lines.push({ segment, kind: 'other', owner });
      }
      auxiliaryLines.push({
        type: 'auxiliary',
        edgeType: conn.edgeType,
        points,
        ...(id ? { endpointIds: [parentNodeId, childNodeId] } : {}),
      });
      return endX;
    };

    if (bar && isParentOfAllSiblings && totalChildren > 1) {
      // A parent of every child in the sibship joins its bar, away from
      // every line already meeting it.
      const stems = sibshipStems.get(conn.sibship) ?? [];
      const joined = draw(
        {
          kind: 'bar',
          bar,
          layer: conn.childLevel,
          joins: joinsFor(bar, stems),
        },
        undefined,
      );
      stems.push(joined);
    } else {
      // A parent of only some children (or of a child with no sibling bar)
      // joins each child, at a point of the line's own on their top edge.
      for (const col of conn.childColumns) {
        const childPersonIndex = layout.nid[conn.childLevel]![col]!;
        const childX = layout.pos[conn.childLevel]![col]!;
        const key = `${conn.childLevel},${col}`;
        const used = usedAttachments.get(key) ?? [];
        const attachments = attachmentsFor(childX, boxw).filter(
          (x) => !used.some((u) => Math.abs(u - x) < 1e-9),
        );
        const attached = draw(
          {
            kind: 'child',
            person: childPersonIndex,
            x: childX,
            layer: conn.childLevel,
            attachments,
          },
          id ? id[childPersonIndex] : undefined,
        );
        usedAttachments.set(key, [...used, attached]);
      }
    }
  }

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

/** The items in groups by key, each group and the groups in first-seen order. */
function groupBy<T, K>(items: T[], keyOf: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function buildParentLink(
  childX: number,
  parentx: number,
  i: number,
  boxh: number,
  legh: number,
  branch: number,
): LineSegment[] {
  const y1 = i - legh;
  const parentCenterY = i - 1 + boxh / 2;
  const parentBottomY = i - 1 + boxh;
  const link: LineSegment[] = [];

  if (branch === 0) {
    link.push(
      {
        type: 'line',
        x1: parentx,
        y1: parentCenterY,
        x2: parentx,
        y2: parentBottomY,
      },
      {
        type: 'line',
        x1: parentx,
        y1: parentBottomY,
        x2: childX,
        y2: y1,
      },
    );
  } else {
    const gapSpan = y1 - parentBottomY;
    const ydelta = (gapSpan * branch) / 2;
    link.push(
      {
        type: 'line',
        x1: parentx,
        y1: parentCenterY,
        x2: parentx,
        y2: parentBottomY,
      },
      {
        type: 'line',
        x1: parentx,
        y1: parentBottomY,
        x2: parentx,
        y2: parentBottomY + ydelta,
      },
      {
        type: 'line',
        x1: parentx,
        y1: parentBottomY + ydelta,
        x2: childX,
        y2: y1 - ydelta,
      },
      { type: 'line', x1: childX, y1: y1 - ydelta, x2: childX, y2: y1 },
    );
  }

  return link;
}
