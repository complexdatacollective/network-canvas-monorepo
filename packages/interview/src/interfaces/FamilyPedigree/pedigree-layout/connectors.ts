import type { RelationshipType } from '@codaco/protocol-validation';

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
} from './types';
import { ancestor } from './utils';

const AUXILIARY_EDGE_TYPES = new Set<RelationshipType>(['donor', 'surrogate']);

function isPrimaryEdge(edgeType: RelationshipType): boolean {
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
 *   Inactive pairs are drawn with a relationship break mark. When omitted, all
 *   group lines are treated as active (backwards-compatible default).
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
  // Maps "childLevel,famId" → sibling bar segment (populated during parent-child computation)
  const familySiblingBar = new Map<string, LineSegment>();
  const renderedPartnerPairs = new Set<string>();
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

        let isActive = true;
        if (activePartnerPairs) {
          isActive = activePartnerPairs.has(pairKey);
        }

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
  if (partnerPairs) {
    const routedCountByLayer = new Map<number, number>();

    for (const pairKey of partnerPairs) {
      if (renderedPartnerPairs.has(pairKey)) continue;

      const [first, second] = pairKey.split(',').map(Number);
      if (first === undefined || second === undefined) continue;
      const firstLocation = nodeLocation.get(first);
      const secondLocation = nodeLocation.get(second);
      if (!firstLocation || !secondLocation) continue;

      const [leftIndex, left, rightIndex, right] =
        firstLocation.x <= secondLocation.x
          ? [first, firstLocation, second, secondLocation]
          : [second, secondLocation, first, firstLocation];
      const routeAbove = (layer: number) => {
        const routeIndex = routedCountByLayer.get(layer) ?? 0;
        routedCountByLayer.set(layer, routeIndex + 1);
        return layer - legh * (1 + routeIndex * 0.5);
      };
      const [upper, lower] =
        left.layer <= right.layer ? [left, right] : [right, left];
      const routeY = routeAbove(upper.layer);
      // The vertical x nearest the lower partner that no one on the rows
      // from the upper partner's down to the lower partner's sits across.
      let laneX = lower.x;
      if (upper.layer !== lower.layer) {
        const blocked = [...nodeLocation.values()]
          .filter((loc) => loc.layer >= upper.layer && loc.layer < lower.layer)
          .map((loc) => loc.x);
        const clearance = boxw / 2 + 0.1;
        const isClear = (x: number) =>
          blocked.every((bx) => Math.abs(bx - x) >= clearance);
        for (let step = 0; !isClear(laneX); step++) {
          const offset = Math.ceil((step + 1) / 2) * 0.25;
          laneX = lower.x + (step % 2 === 0 ? offset : -offset);
        }
      }
      const lowerRouteY = laneX === lower.x ? routeY : routeAbove(lower.layer);
      const endpointSegments: LineSegment[] = [
        { type: 'line', x1: upper.x, y1: upper.y, x2: upper.x, y2: routeY },
      ];
      if (laneX !== lower.x) {
        endpointSegments.push(
          { type: 'line', x1: laneX, y1: routeY, x2: laneX, y2: lowerRouteY },
          {
            type: 'line',
            x1: laneX,
            y1: lowerRouteY,
            x2: lower.x,
            y2: lowerRouteY,
          },
        );
      }
      endpointSegments.push({
        type: 'line',
        x1: lower.x,
        y1: lower.y,
        x2: lower.x,
        y2: lowerRouteY,
      });
      const [segmentLeftX, segmentRightX] =
        upper.layer === lower.layer
          ? [left.x, right.x]
          : [Math.min(upper.x, laneX), Math.max(upper.x, laneX)];

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
        isActive:
          activePartnerPairs === undefined || activePartnerPairs.has(pairKey),
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

  // --- Parent-child lines ---
  for (let i = 1; i < maxlev; i++) {
    const familyIds = [...new Set(familyOf[i]!.filter((v) => v !== 0))];

    for (const fam of familyIds) {
      if (coupleless.has(fam)) {
        const whoIdx = familyOf[i]!.flatMap((f, j) => (f === fam ? [j] : []));
        const { uplines, siblingBar } = sibshipLines(i, whoIdx);
        familySiblingBar.set(`${i},${fam}`, siblingBar);
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

      // Determine descent point: genetic contributor or couple midpoint
      const descentX = computeDescentX(
        layout,
        parents,
        i,
        fam,
        coupleLeft,
        coupleRight,
      );

      // A single parent's children descend from the parent, not from a
      // partner line they may also be on.
      const glKey = `${i - 1},${coupleLeft}`;
      const glIdx = fam > 0 ? groupLineIndex.get(glKey) : undefined;
      if (glIdx !== undefined) {
        const gl = groupLines[glIdx]!;
        gl.descentXPositions ??= [];
        gl.descentXPositions.push(descentX);
      }

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

      const firstIdx = whoIdx[0] ?? marriedInIdx[0]!;
      const firstChildId = layout.nid[i]![firstIdx]!;
      const childParents = parents[firstChildId] ?? [];

      // Determine the edge type for the primary couple→child connector.
      // Only consider edges from parents in this couple, and prefer
      // biological over social so the connector style is deterministic.
      const coupleLeftId = layout.nid[i - 1]![coupleLeft]!;
      const coupleRightId =
        coupleLeft !== coupleRight
          ? layout.nid[i - 1]![coupleRight]!
          : coupleLeftId;
      const coupleEdges = childParents.filter(
        (p) =>
          p.parentIndex === coupleLeftId || p.parentIndex === coupleRightId,
      );
      const primaryEdgeType: RelationshipType =
        coupleEdges.find((p) => p.edgeType === 'biological')?.edgeType ??
        coupleEdges.find((p) => isPrimaryEdge(p.edgeType))?.edgeType ??
        'biological';

      const parentIdsForFamily = id
        ? [
            ...new Set(
              [coupleLeftId, coupleRightId]
                .filter((idx) => idx !== undefined)
                .map((idx) => id[idx] ?? ''),
            ),
          ]
        : undefined;

      if (whoIdx.length === 0) {
        for (const j of marriedInIdx) {
          const childX = layout.pos[i]![j]!;
          const marriedInPersonIndex = layout.nid[i]![j]!;
          const upline: LineSegment = {
            type: 'line',
            x1: childX,
            y1: i + boxh / 2,
            x2: childX,
            y2: i - legh,
          };
          const bar: LineSegment = {
            type: 'line',
            x1: childX,
            y1: i - legh,
            x2: childX,
            y2: i - legh,
          };
          const link = buildParentLink(childX, descentX, i, boxh, legh, branch);
          parentChildLines.push({
            type: 'parent-child',
            edgeType: primaryEdgeType,
            uplines: [upline],
            siblingBar: bar,
            parentLink: link,
            ...(id
              ? {
                  parentIds: parentIdsForFamily,
                  uplineChildIds: [id[marriedInPersonIndex]],
                }
              : {}),
          });
        }
        continue;
      }

      const { uplines, siblingBar, minTarget, maxTarget } = sibshipLines(
        i,
        whoIdx,
      );
      familySiblingBar.set(`${i},${fam}`, siblingBar);

      // Parent link
      const targetRange = maxTarget - minTarget;
      let x1: number;
      if (targetRange < 2 * pconnect) {
        x1 = (minTarget + maxTarget) / 2;
      } else {
        x1 = Math.max(
          minTarget + pconnect,
          Math.min(maxTarget - pconnect, descentX),
        );
      }

      const y1 = i - legh;
      const parentLink: LineSegment[] = [];

      const parentCenterY = i - 1 + boxh / 2;
      const parentBottomY = i - 1 + boxh;

      const x2 = descentX;

      if (branch === 0) {
        parentLink.push(
          {
            type: 'line',
            x1: x2,
            y1: parentCenterY,
            x2,
            y2: parentBottomY,
          },
          {
            type: 'line',
            x1: x2,
            y1: parentBottomY,
            x2: x1,
            y2: y1,
          },
        );
      } else {
        const gapSpan = y1 - parentBottomY;
        const ydelta = (gapSpan * branch) / 2;
        parentLink.push(
          {
            type: 'line',
            x1: x2,
            y1: parentCenterY,
            x2,
            y2: parentBottomY,
          },
          {
            type: 'line',
            x1: x2,
            y1: parentBottomY,
            x2,
            y2: parentBottomY + ydelta,
          },
          {
            type: 'line',
            x1: x2,
            y1: parentBottomY + ydelta,
            x2: x1,
            y2: y1 - ydelta,
          },
          { type: 'line', x1, y1: y1 - ydelta, x2: x1, y2: y1 },
        );
      }

      const uplineChildIdsForFamily = id
        ? whoIdx.map((j) => {
            const personIndex = layout.nid[i]![j];
            return personIndex !== undefined ? id[personIndex] : undefined;
          })
        : undefined;

      parentChildLines.push({
        type: 'parent-child',
        edgeType: primaryEdgeType,
        uplines,
        siblingBar,
        parentLink,
        ...(id
          ? {
              parentIds: parentIdsForFamily,
              uplineChildIds: uplineChildIdsForFamily,
            }
          : {}),
      });

      // Render individual connectors for married-in group members
      for (const j of marriedInIdx) {
        const childX = layout.pos[i]![j]!;
        const miPersonIndex = layout.nid[i]![j]!;
        const miUpline: LineSegment = {
          type: 'line',
          x1: childX,
          y1: i + boxh / 2,
          x2: childX,
          y2: i - legh,
        };
        const miBar: LineSegment = {
          type: 'line',
          x1: childX,
          y1: i - legh,
          x2: childX,
          y2: i - legh,
        };
        const miLink = buildParentLink(childX, descentX, i, boxh, legh, branch);
        parentChildLines.push({
          type: 'parent-child',
          edgeType: primaryEdgeType,
          uplines: [miUpline],
          siblingBar: miBar,
          parentLink: miLink,
          ...(id
            ? {
                parentIds: parentIdsForFamily,
                uplineChildIds: [id[miPersonIndex]],
              }
            : {}),
        });
      }
    }
  }

  // --- Auxiliary lines for donor/surrogate edges ---
  // Group connections by (parentIndex, childLevel, famId), tracking which
  // specific children each auxiliary parent connects to.
  const auxConnections = new Map<
    string,
    {
      parentIndex: number;
      edgeType: 'donor' | 'surrogate';
      childLevel: number;
      famId: number;
      childColumns: number[];
    }
  >();

  // Count total children per (level, famId) to compare against.
  const familyChildCount = new Map<string, number>();

  for (let i = 0; i < maxlev; i++) {
    for (let j = 0; j < (layout.n[i] ?? 0); j++) {
      const childId = layout.nid[i]![j]!;
      if (childId < 0) continue;
      // A child with neither a family nor a sibship has no sibling bar, so
      // each of its donors and surrogates joins it directly.
      const famId = familyOf[i]?.[j] ?? 0;
      const famKey = `${i},${famId}`;
      if (famId !== 0) {
        familyChildCount.set(famKey, (familyChildCount.get(famKey) ?? 0) + 1);
      }

      const childParents = parents[childId] ?? [];
      for (const pc of childParents) {
        if (pc.edgeType === 'donor' || pc.edgeType === 'surrogate') {
          // One line carries one relationship, so a person who is a donor to
          // one child and a surrogate to another is grouped twice.
          const key = `${pc.parentIndex},${pc.edgeType},${i},${famId}`;
          const existing = auxConnections.get(key);
          if (existing) {
            existing.childColumns.push(j);
          } else {
            auxConnections.set(key, {
              parentIndex: pc.parentIndex,
              edgeType: pc.edgeType,
              childLevel: i,
              famId,
              childColumns: [j],
            });
          }
        }
      }
    }
  }

  for (const conn of auxConnections.values()) {
    let parentX: number | undefined;
    let parentY: number | undefined;
    for (let pi = 0; pi < maxlev; pi++) {
      for (let pj = 0; pj < (layout.n[pi] ?? 0); pj++) {
        if (layout.nid[pi]![pj] === conn.parentIndex) {
          parentX = layout.pos[pi]![pj]!;
          parentY = pi + boxh / 2;
          break;
        }
      }
      if (parentX !== undefined) break;
    }
    if (parentX === undefined || parentY === undefined) continue;

    const bar = familySiblingBar.get(`${conn.childLevel},${conn.famId}`);
    const famKey = `${conn.childLevel},${conn.famId}`;
    const totalChildren = familyChildCount.get(famKey) ?? 0;
    const isParentOfAllSiblings = conn.childColumns.length >= totalChildren;

    const donorParentNodeId = id ? id[conn.parentIndex] : undefined;

    if (bar && isParentOfAllSiblings && totalChildren > 1) {
      // Parent of all siblings — connect to the sibling bar
      const barMinX = Math.min(bar.x1, bar.x2);
      const barMaxX = Math.max(bar.x1, bar.x2);
      const connectX = Math.max(barMinX, Math.min(parentX, barMaxX));

      const endpointIds: [string | undefined, string | undefined] | undefined =
        id ? [donorParentNodeId, undefined] : undefined;
      auxiliaryLines.push({
        type: 'auxiliary',
        edgeType: conn.edgeType,
        segment: {
          type: 'line',
          x1: parentX,
          y1: parentY,
          x2: connectX,
          y2: bar.y1,
        },
        ...(endpointIds ? { endpointIds } : {}),
      });
    } else {
      // Parent of only some children (or no sibling bar) — connect
      // directly to each child node
      for (const col of conn.childColumns) {
        const childPersonIndex = layout.nid[conn.childLevel]![col];
        const childNodeId =
          id && childPersonIndex !== undefined
            ? id[childPersonIndex]
            : undefined;
        const endpointIds:
          | [string | undefined, string | undefined]
          | undefined = id ? [donorParentNodeId, childNodeId] : undefined;
        auxiliaryLines.push({
          type: 'auxiliary',
          edgeType: conn.edgeType,
          segment: {
            type: 'line',
            x1: parentX,
            y1: parentY,
            x2: layout.pos[conn.childLevel]![col]!,
            y2: conn.childLevel + boxh / 2,
          },
          ...(endpointIds ? { endpointIds } : {}),
        });
      }
    }
  }

  // --- Direct lines from parents a child's family does not name ---
  const nodePosition = new Map<number, { x: number; y: number }>();
  for (let i = 0; i < maxlev; i++) {
    for (let j = 0; j < (layout.n[i] ?? 0); j++) {
      const nid = layout.nid[i]![j]!;
      if (!nodePosition.has(nid)) {
        nodePosition.set(nid, { x: layout.pos[i]![j]!, y: i });
      }
    }
  }

  // Group direct parent connections by (parentIndex, childLevel, famId) so
  // we can decide per-parent whether to connect to the sibling bar or
  // directly to individual children.
  const socialConnections = new Map<
    string,
    {
      parentIndex: number;
      edgeType: RelationshipType;
      childLevel: number;
      famId: number;
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
      // Determine which parent pair the child is assigned to (primary family)
      const childFam = layout.fam[i]?.[j] ?? 0;

      // A child's family names the parents it descends from: its couple, or
      // its single parent. Every other primary parent is joined to the child
      // by a line of their own, whether or not they are anyone's partner.
      const primaryFamilyIds = new Set<number>();
      if (childFam !== 0) {
        const { left, right } = familyParentColumns(layout, i, childFam);
        for (const col of new Set([left, right])) {
          const parentId = layout.nid[i - 1]?.[col];
          if (parentId !== undefined) primaryFamilyIds.add(parentId);
        }
      }

      const famId = familyOf[i]?.[j] ?? 0;

      for (const parentEdge of parentEdges) {
        const parentId = parentEdge.parentIndex;
        if (primaryFamilyIds.has(parentId)) continue;

        // Each line carries the parent's own relationship to the child.
        const { edgeType } = parentEdge;

        // One line carries one relationship: a parent who is biological to one
        // child and social to another is grouped once for each.
        const key = `${parentId},${edgeType},${i},${famId}`;
        const existing = socialConnections.get(key);
        if (existing) {
          existing.childColumns.push(j);
        } else {
          socialConnections.set(key, {
            parentIndex: parentId,
            edgeType,
            childLevel: i,
            famId,
            childColumns: [j],
          });
        }
      }
    }
  }

  for (const conn of socialConnections.values()) {
    const parentPos = nodePosition.get(conn.parentIndex);
    if (!parentPos) continue;

    const socialParentNodeId = id ? id[conn.parentIndex] : undefined;

    const bar = familySiblingBar.get(`${conn.childLevel},${conn.famId}`);
    const famKey = `${conn.childLevel},${conn.famId}`;
    const totalChildren = familyChildCount.get(famKey) ?? 0;
    const isParentOfAllSiblings = conn.childColumns.length >= totalChildren;

    if (bar && isParentOfAllSiblings && totalChildren > 1) {
      const barMinX = Math.min(bar.x1, bar.x2);
      const barMaxX = Math.max(bar.x1, bar.x2);
      const connectX = Math.max(barMinX, Math.min(parentPos.x, barMaxX));
      const endpointIds: [string | undefined, string | undefined] | undefined =
        id ? [socialParentNodeId, undefined] : undefined;

      auxiliaryLines.push({
        type: 'auxiliary',
        edgeType: conn.edgeType,
        segment: {
          type: 'line',
          x1: parentPos.x,
          y1: parentPos.y + boxh / 2,
          x2: connectX,
          y2: bar.y1,
        },
        ...(endpointIds ? { endpointIds } : {}),
      });
    } else {
      for (const col of conn.childColumns) {
        const childPersonIndex = layout.nid[conn.childLevel]![col];
        const childNodeId =
          id && childPersonIndex !== undefined
            ? id[childPersonIndex]
            : undefined;
        const endpointIds:
          | [string | undefined, string | undefined]
          | undefined = id ? [socialParentNodeId, childNodeId] : undefined;
        auxiliaryLines.push({
          type: 'auxiliary',
          edgeType: conn.edgeType,
          segment: {
            type: 'line',
            x1: parentPos.x,
            y1: parentPos.y + boxh / 2,
            x2: layout.pos[conn.childLevel]![col]!,
            y2: conn.childLevel + boxh / 2,
          },
          ...(endpointIds ? { endpointIds } : {}),
        });
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

/**
 * Determine the x-coordinate for the line of descent from parents to children.
 *
 * When both parents in the couple have biological edges to the children,
 * descent is from the couple midpoint. When only one parent is a genetic
 * contributor (biological edge), descent is from that parent's node position.
 */
function computeDescentX(
  layout: PedigreeLayout,
  parents: ParentConnection[][],
  childLevel: number,
  famId: number,
  coupleLeft: number,
  coupleRight: number,
): number {
  const leftPos = layout.pos[childLevel - 1]![coupleLeft]!;
  const rightPos = layout.pos[childLevel - 1]![coupleRight]!;

  if (coupleLeft === coupleRight) {
    return leftPos;
  }

  const leftId = layout.nid[childLevel - 1]![coupleLeft]!;
  const rightId = layout.nid[childLevel - 1]![coupleRight]!;

  // Check children in this family for their parent edge types
  let leftIsBiological = false;
  let rightIsBiological = false;

  for (let j = 0; j < layout.fam[childLevel]!.length; j++) {
    if (layout.fam[childLevel]![j] !== famId) continue;
    const childId = layout.nid[childLevel]![j]!;
    const childParents = parents[childId] ?? [];

    for (const pc of childParents) {
      if (pc.parentIndex === leftId && pc.edgeType === 'biological') {
        leftIsBiological = true;
      }
      if (pc.parentIndex === rightId && pc.edgeType === 'biological') {
        rightIsBiological = true;
      }
    }
  }

  if (leftIsBiological && !rightIsBiological) {
    return leftPos;
  }
  if (rightIsBiological && !leftIsBiological) {
    return rightPos;
  }

  return (leftPos + rightPos) / 2;
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
