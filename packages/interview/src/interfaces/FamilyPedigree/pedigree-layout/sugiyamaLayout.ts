import type { RelationshipType } from '@codaco/shared-consts';

import { kindepth } from './kindepth';
import type { ParentConnection, PedigreeInput, PedigreeLayout } from './types';
import { ancestor } from './utils';

type PartnerGroup = {
  members: number[];
  isActive: boolean;
};

type FamilyUnit = {
  parentGroup: PartnerGroup;
  children: number[];
};

type SiblingGroup = {
  members: number[];
  parentGroup: PartnerGroup;
};

type ConstraintBlock = {
  nodes: number[];
  barycenter: number;
};

type PedigreeGraph = {
  nodeCount: number;
  layers: number[];
  parents: ParentConnection[][];
  partnerGroups: PartnerGroup[];
  familyUnits: FamilyUnit[];
  siblingGroups: SiblingGroup[];
  auxiliaryParents: Map<number, number[]>;
  parentEdgeTypes: Map<string, RelationshipType>;
};

function isPrimaryEdge(edgeType: RelationshipType): boolean {
  return (
    edgeType === 'biological' ||
    edgeType === 'social' ||
    edgeType === 'adoptive'
  );
}

function isAuxiliaryEdge(edgeType: RelationshipType): boolean {
  return edgeType === 'donor' || edgeType === 'surrogate';
}

function partnerGroupKey(members: number[]): string {
  return [...members].toSorted((a, b) => a - b).join(',');
}

function buildPedigreeGraph(ped: PedigreeInput): PedigreeGraph {
  const n = ped.id.length;

  // 1. Assign layers (1-based)
  const depth = kindepth(ped.parents, true);
  const layers = depth.map((d) => d + 1);

  // 2. Force auxiliary parents to same layer as social parents
  for (let i = 0; i < n; i++) {
    const pConns = ped.parents[i]!;
    if (pConns.length === 0) continue;
    const socialLevel = Math.max(
      ...pConns
        .filter((p) => isPrimaryEdge(p.edgeType))
        .map((p) => layers[p.parentIndex]!),
      -1,
    );
    if (socialLevel < 0) continue;
    for (const p of pConns) {
      if (isAuxiliaryEdge(p.edgeType)) {
        layers[p.parentIndex] = socialLevel;
      }
    }
  }

  // 3. Build partner groups from all sources, deduplicating by sorted key
  const groupMap = new Map<string, PartnerGroup>();

  // From explicit partners array
  if (ped.partners) {
    for (const p of ped.partners) {
      const members = [p.partnerIndex1, p.partnerIndex2];
      const key = partnerGroupKey(members);
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          members: [...members].toSorted((a, b) => a - b),
          isActive: p.isActive,
        });
      }
    }
  }

  // From relation entries with code=4
  if (ped.relation) {
    for (const r of ped.relation) {
      if (r.code !== 4) continue;
      const members = [r.id1, r.id2];
      const key = partnerGroupKey(members);
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          members: [...members].toSorted((a, b) => a - b),
          isActive: true,
        });
      }
    }
  }

  // From implicit co-parent detection
  for (let i = 0; i < n; i++) {
    const pConns = ped.parents[i]!;
    if (pConns.length === 0) continue;
    const primaryParents = pConns
      .filter((p) => isPrimaryEdge(p.edgeType))
      .map((p) => p.parentIndex);
    if (primaryParents.length < 2) continue;

    // For multi-parent scenarios, create pairwise groups — but only for
    // pairs that share the same edge type (both biological or both social).
    // Mixed pairs (bio + social) are not partnerships. Also skip siblings.
    for (let a = 0; a < primaryParents.length; a++) {
      for (let b = a + 1; b < primaryParents.length; b++) {
        const pa = primaryParents[a]!;
        const pb = primaryParents[b]!;

        const edgeA = pConns.find(
          (p) => p.parentIndex === pa && isPrimaryEdge(p.edgeType),
        )?.edgeType;
        const edgeB = pConns.find(
          (p) => p.parentIndex === pb && isPrimaryEdge(p.edgeType),
        )?.edgeType;
        if (edgeA !== edgeB) continue;

        const parentsOfA = new Set(ped.parents[pa]!.map((p) => p.parentIndex));
        const parentsOfB = new Set(ped.parents[pb]!.map((p) => p.parentIndex));
        const areSiblings =
          parentsOfA.size > 0 &&
          parentsOfB.size > 0 &&
          [...parentsOfA].some((p) => parentsOfB.has(p));

        if (areSiblings) continue;

        const members = [pa, pb];
        const key = partnerGroupKey(members);
        if (!groupMap.has(key)) {
          groupMap.set(key, {
            members: [...members].toSorted((c, d) => c - d),
            isActive: true,
          });
        }
      }
    }
  }

  const partnerGroups = [...groupMap.values()];

  // 3b. Align partner group members to the same layer
  for (const group of partnerGroups) {
    const maxLayer = Math.max(...group.members.map((m) => layers[m]!));
    for (const m of group.members) {
      layers[m] = maxLayer;
    }
  }

  // 4. Build family units
  const familyUnits: FamilyUnit[] = [];
  for (const group of partnerGroups) {
    const children: number[] = [];

    for (let i = 0; i < n; i++) {
      const pConns = ped.parents[i]!;
      if (pConns.length === 0) continue;
      const primaryParents = new Set(
        pConns
          .filter((p) => isPrimaryEdge(p.edgeType))
          .map((p) => p.parentIndex),
      );

      // Child belongs to this family if all group members are among its primary parents
      const allMatch = group.members.every((m) => primaryParents.has(m));
      if (allMatch) {
        children.push(i);
      }
    }

    if (children.length > 0) {
      familyUnits.push({ parentGroup: group, children });
    }
  }

  // Handle single-parent families: group children who share the same sole
  // primary parent and aren't already covered by a partner-group family unit.
  const singleParentChildren = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const pConns = ped.parents[i]!;
    if (pConns.length === 0) continue;
    const primaryParents = pConns
      .filter((p) => isPrimaryEdge(p.edgeType))
      .map((p) => p.parentIndex);
    if (primaryParents.length !== 1) continue;

    const parentIdx = primaryParents[0]!;
    const alreadyCovered = familyUnits.some((fu) => fu.children.includes(i));
    if (alreadyCovered) continue;

    if (!singleParentChildren.has(parentIdx)) {
      singleParentChildren.set(parentIdx, []);
    }
    singleParentChildren.get(parentIdx)!.push(i);
  }

  for (const [parentIdx, children] of singleParentChildren) {
    const singleGroup: PartnerGroup = {
      members: [parentIdx],
      isActive: true,
    };
    familyUnits.push({ parentGroup: singleGroup, children });
  }

  // 5. Build sibling groups
  const siblingGroups: SiblingGroup[] = familyUnits
    .filter((fu) => fu.children.length > 1)
    .map((fu) => ({
      members: fu.children,
      parentGroup: fu.parentGroup,
    }));

  // 6. Collect auxiliary parents
  const auxiliaryParents = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const pConns = ped.parents[i]!;
    const auxParents = pConns
      .filter((p) => isAuxiliaryEdge(p.edgeType))
      .map((p) => p.parentIndex);
    if (auxParents.length > 0) {
      auxiliaryParents.set(i, auxParents);
    }
  }

  // 7. Store edge types
  const parentEdgeTypes = new Map<string, RelationshipType>();
  for (let i = 0; i < n; i++) {
    for (const p of ped.parents[i]!) {
      parentEdgeTypes.set(`${p.parentIndex}-${i}`, p.edgeType);
    }
  }

  return {
    nodeCount: n,
    layers,
    parents: ped.parents,
    partnerGroups,
    familyUnits,
    siblingGroups,
    auxiliaryParents,
    parentEdgeTypes,
  };
}

function getNodesAtLayer(graph: PedigreeGraph, layer: number): number[] {
  const nodes: number[] = [];
  for (let i = 0; i < graph.nodeCount; i++) {
    if (graph.layers[i] === layer) {
      nodes.push(i);
    }
  }
  return nodes;
}

function getChildrenOf(node: number, graph: PedigreeGraph): number[] {
  const children: number[] = [];
  for (let i = 0; i < graph.nodeCount; i++) {
    const pConns = graph.parents[i]!;
    if (pConns.some((p) => p.parentIndex === node)) {
      children.push(i);
    }
  }
  return children;
}

function getParentsOf(node: number, graph: PedigreeGraph): number[] {
  return graph.parents[node]!.map((p) => p.parentIndex);
}

function buildConstraintBlocks(
  nodesOnLayer: number[],
  graph: PedigreeGraph,
): ConstraintBlock[] {
  const nodeSet = new Set(nodesOnLayer);
  const assigned = new Set<number>();
  const blocks: ConstraintBlock[] = [];

  // Sibships with ≥2 members present on this layer. Their members are kept
  // together as one block EVEN WHEN they are partnered — otherwise each married
  // sibling drifts toward its own spouse's barycenter and the sibship is torn
  // apart (e.g. two married siblings ending up at opposite ends of the row).
  const realSibships = graph.siblingGroups
    .map((sg) => sg.members.filter((m) => nodeSet.has(m)))
    .filter((members) => members.length > 1);
  const inRealSibship = new Set<number>();
  for (const members of realSibships) {
    for (const m of members) inRealSibship.add(m);
  }

  // Spouses present on this layer, per node (from partner groups fully on-layer).
  const spousesOf = new Map<number, number[]>();
  for (const pg of graph.partnerGroups) {
    if (!pg.members.every((m) => nodeSet.has(m))) continue;
    for (const m of pg.members) {
      const existing = spousesOf.get(m) ?? [];
      existing.push(...pg.members.filter((x) => x !== m));
      spousesOf.set(m, existing);
    }
  }

  // A spouse can be attached to a sibling's sibship block only when the spouse
  // is not itself holding another sibship together (i.e. is not in a real
  // sibship on this layer). When both spouses have siblings shown (two sibships
  // intermarry) the couple becomes an inter-block link — the only arrangement
  // that keeps BOTH sibships contiguous.
  const attachableSpouses = (sibling: number): number[] =>
    (spousesOf.get(sibling) ?? []).filter(
      (sp) => !inRealSibship.has(sp) && !assigned.has(sp),
    );

  // 1. One block per real sibship: siblings in index order, with each married
  //    sibling's attachable spouse(s) beside it so couples stay adjacent while
  //    the sibship stays contiguous. A sibling that anchors TWO OR MORE marriages
  //    must sit BETWEEN its spouses — pushing them all to one side would leave a
  //    spouse non-adjacent and silently drop that marriage line. A single spouse
  //    goes on the outer side (the leftmost sibling's to its left, later siblings'
  //    to their right) to keep the block compact.
  for (const members of realSibships) {
    const siblings = members.toSorted((a, b) => a - b);
    const ordered: number[] = [];
    siblings.forEach((sib, idx) => {
      const spouses = attachableSpouses(sib).toSorted((a, b) => a - b);
      assigned.add(sib);
      for (const sp of spouses) assigned.add(sp);
      if (spouses.length >= 2) {
        const half = Math.floor(spouses.length / 2);
        ordered.push(...spouses.slice(0, half), sib, ...spouses.slice(half));
      } else if (idx === 0) {
        ordered.push(...spouses, sib);
      } else {
        ordered.push(sib, ...spouses);
      }
    });
    blocks.push({ nodes: ordered, barycenter: 0 });
  }

  // 2. Partner blocks for the remaining couples — those where neither partner is
  //    in a real sibship (e.g. a consanguineous cousin union, both only-children)
  //    — reusing the anchor-merge so a person with multiple partners sits between
  //    them. Only partner groups whose members are all still unassigned qualify.
  const eligible = new Set<number>();
  for (let gi = 0; gi < graph.partnerGroups.length; gi++) {
    const pg = graph.partnerGroups[gi]!;
    if (!pg.members.every((m) => nodeSet.has(m) && !assigned.has(m))) continue;
    eligible.add(gi);
  }

  const nodeToPartnerGroups = new Map<number, number[]>();
  for (const gi of eligible) {
    for (const m of graph.partnerGroups[gi]!.members) {
      const existing = nodeToPartnerGroups.get(m) ?? [];
      existing.push(gi);
      nodeToPartnerGroups.set(m, existing);
    }
  }

  const groupUnion = new Map<number, Set<number>>(); // groupIdx -> merged members
  const mergedInto = new Map<number, number>(); // groupIdx -> canonical groupIdx

  for (const gi of eligible) {
    if (mergedInto.has(gi)) continue;

    const merged = new Set(graph.partnerGroups[gi]!.members);
    const toProcess = [gi];
    const visited = new Set<number>([gi]);

    while (toProcess.length > 0) {
      const current = toProcess.pop()!;
      const currentPg = graph.partnerGroups[current]!;
      for (const m of currentPg.members) {
        const groups = nodeToPartnerGroups.get(m) ?? [];
        for (const otherGi of groups) {
          if (visited.has(otherGi)) continue;
          visited.add(otherGi);
          const otherPg = graph.partnerGroups[otherGi]!;
          for (const om of otherPg.members) merged.add(om);
          mergedInto.set(otherGi, gi);
          toProcess.push(otherGi);
        }
      }
    }

    groupUnion.set(gi, merged);
  }

  for (const [, members] of groupUnion) {
    const blockNodes = [...members].toSorted((a, b) => a - b);
    // Order anchor (shared node) between its partners
    const anchors = blockNodes.filter(
      (n) => (nodeToPartnerGroups.get(n)?.length ?? 0) > 1,
    );
    if (anchors.length === 1) {
      const anchor = anchors[0]!;
      const others = blockNodes.filter((n) => n !== anchor);
      const half = Math.floor(others.length / 2);
      const ordered = [...others.slice(0, half), anchor, ...others.slice(half)];
      for (const n of ordered) assigned.add(n);
      blocks.push({ nodes: ordered, barycenter: 0 });
    } else {
      for (const n of blockNodes) assigned.add(n);
      blocks.push({ nodes: blockNodes, barycenter: 0 });
    }
  }

  // 2b. Seat auxiliary parents (donor/surrogate) beside the couple they
  //     contribute to. An auxiliary parent is not part of any partnership or
  //     sibship, so without this it would fall through to a singleton and drift
  //     away from its couple — drawing a very long donor/surrogate line. Attach
  //     it to the OUTER edge of the block holding the child's family-unit
  //     parents so the couple stays contiguous and the connector stays short.
  for (const [child, auxParents] of graph.auxiliaryParents) {
    for (const aux of auxParents) {
      if (!nodeSet.has(aux) || assigned.has(aux)) continue;
      // Skip aux parents that are themselves partnered or in a sibship here;
      // those are already placed by steps 1–2.
      if (inRealSibship.has(aux) || spousesOf.has(aux)) continue;

      // Find the family unit for this child, then the block holding its parents.
      const familyUnit = graph.familyUnits.find((fu) =>
        fu.children.includes(child),
      );
      if (!familyUnit) continue;

      const coupleOnLayer = familyUnit.parentGroup.members.filter((m) =>
        nodeSet.has(m),
      );
      if (coupleOnLayer.length === 0) continue; // couple not on this layer

      const coupleSet = new Set(coupleOnLayer);
      const targetBlock = blocks.find((b) =>
        b.nodes.some((node) => coupleSet.has(node)),
      );
      if (!targetBlock) continue;

      // Seat the aux parent immediately adjacent to the couple, on the couple's
      // OUTER side (the side nearer the block boundary). When the couple is its
      // own block this lands on the block edge; when the couple is embedded in a
      // sibship block it lands beside the couple rather than at the far end, so
      // the donor/surrogate connector stays short either way.
      const couplePositions = targetBlock.nodes
        .map((node, i) => (coupleSet.has(node) ? i : -1))
        .filter((i) => i >= 0);
      const leftPos = Math.min(...couplePositions);
      const rightPos = Math.max(...couplePositions);
      const distToLeftEdge = leftPos;
      const distToRightEdge = targetBlock.nodes.length - 1 - rightPos;
      if (distToRightEdge <= distToLeftEdge) {
        targetBlock.nodes.splice(rightPos + 1, 0, aux);
      } else {
        targetBlock.nodes.splice(leftPos, 0, aux);
      }
      assigned.add(aux);
    }
  }

  // 3. Singleton blocks for remaining nodes.
  for (const node of nodesOnLayer) {
    if (!assigned.has(node)) {
      blocks.push({ nodes: [node], barycenter: 0 });
    }
  }

  blocks.sort((a, b) => Math.min(...a.nodes) - Math.min(...b.nodes));

  return blocks;
}

function positionMap(layerOrdering: number[][]): Map<number, number> {
  const pos = new Map<number, number>();
  for (const layer of layerOrdering) {
    for (let i = 0; i < layer.length; i++) {
      pos.set(layer[i]!, i);
    }
  }
  return pos;
}

/**
 * In pedigree layout, a family unit's children connect to a single descent
 * point at the midpoint of the partner group, not to individual parents.
 * This function collects edges using that model: one edge per
 * (descent-point, child) for family-unit children, plus direct edges for
 * auxiliary parents and children not covered by any family unit.
 */
function collectLayerEdges(
  upperLayer: number[],
  lowerLayer: number[],
  graph: PedigreeGraph,
  pos: Map<number, number>,
): [number, number][] {
  const upperSet = new Set(upperLayer);
  const lowerSet = new Set(lowerLayer);
  const edges: [number, number][] = [];
  const coveredChildren = new Set<number>();

  for (const fu of graph.familyUnits) {
    const parentsOnUpper = fu.parentGroup.members.filter((m) =>
      upperSet.has(m),
    );
    const childrenOnLower = fu.children.filter((c) => lowerSet.has(c));
    if (parentsOnUpper.length === 0 || childrenOnLower.length === 0) continue;

    // Descent point is the midpoint of the parent group positions
    const descentX =
      parentsOnUpper.reduce((sum, p) => sum + pos.get(p)!, 0) /
      parentsOnUpper.length;

    for (const child of childrenOnLower) {
      edges.push([descentX, pos.get(child)!]);
      coveredChildren.add(child);
    }
  }

  // Auxiliary parent edges (donor/surrogate) are direct connections
  for (const child of lowerLayer) {
    const auxParents = graph.auxiliaryParents.get(child) ?? [];
    for (const auxParent of auxParents) {
      if (upperSet.has(auxParent)) {
        edges.push([pos.get(auxParent)!, pos.get(child)!]);
      }
    }
  }

  // Uncovered children: direct edges to each parent
  for (const child of lowerLayer) {
    if (coveredChildren.has(child)) continue;
    const parents = getParentsOf(child, graph);
    for (const parent of parents) {
      if (upperSet.has(parent)) {
        edges.push([pos.get(parent)!, pos.get(child)!]);
      }
    }
  }

  return edges;
}

function countCrossings(
  layerOrdering: number[][],
  graph: PedigreeGraph,
): number {
  const pos = positionMap(layerOrdering);
  let crossings = 0;

  for (let k = 0; k < layerOrdering.length - 1; k++) {
    const upperLayer = layerOrdering[k]!;
    const lowerLayer = layerOrdering[k + 1]!;

    const edges = collectLayerEdges(upperLayer, lowerLayer, graph, pos);

    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const [u1, v1] = edges[i]!;
        const [u2, v2] = edges[j]!;
        if ((u1 < u2 && v1 > v2) || (u1 > u2 && v1 < v2)) {
          crossings++;
        }
      }
    }
  }

  return crossings;
}

function barycentricSweep(
  layerOrdering: number[][],
  graph: PedigreeGraph,
  direction: 'down' | 'up',
): number[][] {
  const result = layerOrdering.map((layer) => [...layer]);

  if (direction === 'down') {
    for (let k = 1; k < result.length; k++) {
      const fixedLayer = result[k - 1]!;
      const fixedPos = new Map<number, number>();
      for (let i = 0; i < fixedLayer.length; i++) {
        fixedPos.set(fixedLayer[i]!, i);
      }

      const currentLayer = result[k]!;
      const blocks = buildConstraintBlocks(currentLayer, graph);

      // Compute barycenters
      for (const block of blocks) {
        let totalBarycenter = 0;
        let countWithParents = 0;
        for (const node of block.nodes) {
          const parents = getParentsOf(node, graph);
          const parentPositions = parents
            .filter((p) => fixedPos.has(p))
            .map((p) => fixedPos.get(p)!);
          if (parentPositions.length > 0) {
            const avg =
              parentPositions.reduce((a, b) => a + b, 0) /
              parentPositions.length;
            totalBarycenter += avg;
            countWithParents++;
          }
        }
        if (countWithParents > 0) {
          block.barycenter = totalBarycenter / countWithParents;
        } else {
          // Keep current position
          const positions = block.nodes.map((n) => currentLayer.indexOf(n));
          block.barycenter =
            positions.reduce((a, b) => a + b, 0) / positions.length;
        }
      }

      blocks.sort((a, b) => a.barycenter - b.barycenter);
      result[k] = blocks.flatMap((b) => b.nodes);
    }
  } else {
    for (let k = result.length - 2; k >= 0; k--) {
      const fixedLayer = result[k + 1]!;
      const fixedPos = new Map<number, number>();
      for (let i = 0; i < fixedLayer.length; i++) {
        fixedPos.set(fixedLayer[i]!, i);
      }

      const currentLayer = result[k]!;
      const blocks = buildConstraintBlocks(currentLayer, graph);

      for (const block of blocks) {
        let totalBarycenter = 0;
        let countWithChildren = 0;
        for (const node of block.nodes) {
          const children = getChildrenOf(node, graph);
          const childPositions = children
            .filter((c) => fixedPos.has(c))
            .map((c) => fixedPos.get(c)!);
          if (childPositions.length > 0) {
            const avg =
              childPositions.reduce((a, b) => a + b, 0) / childPositions.length;
            totalBarycenter += avg;
            countWithChildren++;
          }
        }
        if (countWithChildren > 0) {
          block.barycenter = totalBarycenter / countWithChildren;
        } else {
          const positions = block.nodes.map((n) => currentLayer.indexOf(n));
          block.barycenter =
            positions.reduce((a, b) => a + b, 0) / positions.length;
        }
      }

      blocks.sort((a, b) => a.barycenter - b.barycenter);
      result[k] = blocks.flatMap((b) => b.nodes);
    }
  }

  return result;
}

/**
 * Recover the contiguous constraint blocks present in a layer's CURRENT
 * left-to-right ordering. buildConstraintBlocks emits blocks in canonical
 * (index) order; the barycentric sweeps then reorder whole blocks, so the
 * current ordering is a permutation of those blocks laid end to end. This walks
 * the ordering and groups consecutive nodes that belong to the same block,
 * returning each block as a [start, end) half-open range into `layerOrdering`.
 */
function currentBlockRuns(
  layerOrdering: number[],
  graph: PedigreeGraph,
): [number, number][] {
  const blocks = buildConstraintBlocks(layerOrdering, graph);
  const nodeToBlock = new Map<number, number>();
  for (let bi = 0; bi < blocks.length; bi++) {
    for (const node of blocks[bi]!.nodes) {
      nodeToBlock.set(node, bi);
    }
  }

  const runs: [number, number][] = [];
  let start = 0;
  while (start < layerOrdering.length) {
    const blockId = nodeToBlock.get(layerOrdering[start]!);
    let end = start + 1;
    while (
      end < layerOrdering.length &&
      nodeToBlock.get(layerOrdering[end]!) === blockId
    ) {
      end++;
    }
    runs.push([start, end]);
    start = end;
  }
  return runs;
}

/**
 * Block-reversal (reflection) refinement. The barycentric sweeps only reorder
 * whole blocks and re-emit each block's internal node order verbatim, so a
 * block whose internal orientation is wrong (e.g. two intermarrying sibships
 * forced into one order by ascending node index) can never be corrected by the
 * sweeps. This pass tries reversing each contiguous block's node run in place
 * and keeps a reversal only when it STRICTLY reduces crossings. Reversing a
 * whole block preserves couple/sibship contiguity.
 */
function reverseBlocks(
  ordering: number[][],
  graph: PedigreeGraph,
  startingCrossings: number,
  iterationCap: number,
): { ordering: number[][]; crossings: number } {
  let current = ordering.map((layer) => [...layer]);
  let currentCrossings = startingCrossings;

  for (let iter = 0; iter < iterationCap; iter++) {
    let improvedThisPass = false;

    for (let layer = 0; layer < current.length; layer++) {
      const layerOrdering = current[layer]!;
      if (layerOrdering.length < 2) continue;

      const runs = currentBlockRuns(layerOrdering, graph);
      for (const [start, end] of runs) {
        if (end - start < 2) continue;

        const candidate = current.map((l) => [...l]);
        const run = candidate[layer]!.slice(start, end).toReversed();
        for (let i = 0; i < run.length; i++) {
          candidate[layer]![start + i] = run[i]!;
        }

        const candidateCrossings = countCrossings(candidate, graph);
        if (candidateCrossings < currentCrossings) {
          current = candidate;
          currentCrossings = candidateCrossings;
          improvedThisPass = true;
        }
      }
    }

    if (!improvedThisPass) break;
    if (currentCrossings === 0) break;
  }

  return { ordering: current, crossings: currentCrossings };
}

function minimizeCrossings(graph: PedigreeGraph): number[][] {
  const maxLayer = Math.max(...graph.layers);

  // Step 1: Initial ordering
  const ordering: number[][] = [];
  for (let layer = 0; layer <= maxLayer; layer++) {
    const nodesOnLayer = getNodesAtLayer(graph, layer);
    const blocks = buildConstraintBlocks(nodesOnLayer, graph);
    ordering.push(blocks.flatMap((b) => b.nodes));
  }

  let bestOrdering = ordering.map((layer) => [...layer]);
  let bestCrossings = countCrossings(bestOrdering, graph);

  if (bestCrossings === 0) return bestOrdering;

  let noImprovementCount = 0;

  for (let iter = 0; iter < 24; iter++) {
    const afterDown = barycentricSweep(bestOrdering, graph, 'down');
    const downCrossings = countCrossings(afterDown, graph);

    if (downCrossings < bestCrossings) {
      bestCrossings = downCrossings;
      bestOrdering = afterDown;
      noImprovementCount = 0;
    } else {
      noImprovementCount++;
    }

    if (bestCrossings === 0) break;

    const afterUp = barycentricSweep(bestOrdering, graph, 'up');
    const upCrossings = countCrossings(afterUp, graph);

    if (upCrossings < bestCrossings) {
      bestCrossings = upCrossings;
      bestOrdering = afterUp;
      noImprovementCount = 0;
    } else {
      noImprovementCount++;
    }

    if (bestCrossings === 0) break;
    if (noImprovementCount >= 3) break;
  }

  // Block-reversal refinement: run after the sweeps converge. The sweeps can
  // only permute blocks, never reflect one, so a block frozen in the wrong
  // internal orientation (two intermarrying sibships) still leaves crossings a
  // whole-block reversal can remove.
  if (bestCrossings > 0) {
    const reflected = reverseBlocks(bestOrdering, graph, bestCrossings, 24);
    if (reflected.crossings < bestCrossings) {
      bestOrdering = reflected.ordering;
    }
  }

  return bestOrdering;
}

function encodePedigreeLayout(
  graph: PedigreeGraph,
  ordering: number[][],
  ped: PedigreeInput,
): PedigreeLayout {
  const maxLayer = ordering.length;

  // Step 1: nid and n
  const n: number[] = [];
  const nid: number[][] = [];
  for (let layer = 0; layer < maxLayer; layer++) {
    const layerNodes = ordering[layer] ?? [];
    n.push(layerNodes.length);
    nid.push([...layerNodes]);
  }

  // Step 2: pos — center children under their primary parents, then resolve
  // overlaps while maintaining node order and a minimum gap of 1.
  const pos: number[][] = [];
  for (let layer = 0; layer < maxLayer; layer++) {
    pos.push(nid[layer]!.map((_, col) => col));
  }

  // Build a lookup: node -> (layer, col)
  const nodeLocation = new Map<number, { layer: number; col: number }>();
  for (let layer = 0; layer < maxLayer; layer++) {
    for (let col = 0; col < n[layer]!; col++) {
      nodeLocation.set(nid[layer]![col]!, { layer, col });
    }
  }

  // Downward centering: position sibling groups under their parent group
  // midpoint, and individual nodes under their primary parents.
  for (let layer = 1; layer < maxLayer; layer++) {
    const layerN = n[layer]!;
    if (layerN === 0) continue;

    const ideal: number[] = pos[layer]!.slice(0, layerN);

    // Center each family unit's children as a group under the parent midpoint
    for (const fu of graph.familyUnits) {
      const childCols = fu.children
        .map((c) => {
          const loc = nodeLocation.get(c);
          return loc?.layer === layer ? loc.col : -1;
        })
        .filter((c) => c >= 0)
        .toSorted((a, b) => a - b);

      if (childCols.length === 0) continue;

      const parentCols = fu.parentGroup.members
        .map((m) => {
          const loc = nodeLocation.get(m);
          return loc?.layer === layer - 1 ? loc.col : -1;
        })
        .filter((c) => c >= 0);

      if (parentCols.length === 0) continue;

      const parentPositions = parentCols.map((c) => pos[layer - 1]![c]!);
      const parentCenter =
        parentPositions.reduce((a, b) => a + b, 0) / parentPositions.length;

      // Current child group center
      const childPositions = childCols.map((c) => ideal[c]!);
      const childCenter =
        childPositions.reduce((a, b) => a + b, 0) / childPositions.length;

      const shift = parentCenter - childCenter;
      for (const col of childCols) {
        ideal[col] = ideal[col]! + shift;
      }
    }

    // Also handle nodes not in any family unit (center under individual parents)
    for (let col = 0; col < layerN; col++) {
      const node = nid[layer]![col]!;
      const inFamilyUnit = graph.familyUnits.some(
        (fu) =>
          fu.children.includes(node) &&
          fu.parentGroup.members.some((m) => {
            const loc = nodeLocation.get(m);
            return loc?.layer === layer - 1;
          }),
      );
      if (inFamilyUnit) continue;

      const primaryParents = graph.parents[node]!.filter((p) =>
        isPrimaryEdge(p.edgeType),
      ).map((p) => p.parentIndex);
      const parentsAbove = primaryParents.filter((p) => {
        const loc = nodeLocation.get(p);
        return loc?.layer === layer - 1;
      });
      if (parentsAbove.length > 0) {
        const parentPositions = parentsAbove.map(
          (p) => pos[layer - 1]![nodeLocation.get(p)!.col]!,
        );
        ideal[col] =
          parentPositions.reduce((a, b) => a + b, 0) / parentPositions.length;
      }
    }

    // Position married-in partners adjacent to their spouse. Founders
    // with no parents above keep their initial column index, which
    // drifts away from a spouse that was shifted under their family.
    for (let col = 0; col < layerN; col++) {
      const node = nid[layer]![col]!;
      if (graph.parents[node]!.length > 0) continue;

      for (const pg of graph.partnerGroups) {
        if (!pg.members.includes(node)) continue;
        const spouse = pg.members.find((m) => m !== node);
        if (spouse === undefined) continue;
        const spouseLoc = nodeLocation.get(spouse);
        if (spouseLoc?.layer !== layer) continue;
        const spouseCol = spouseLoc.col;
        if (spouseCol < 0) continue;

        if (col > spouseCol) {
          ideal[col] = ideal[spouseCol]! + 1;
        } else {
          ideal[col] = ideal[spouseCol]! - 1;
        }
        break;
      }
    }

    // Pull each two-person couple whose members already sit at consecutive
    // columns to be adjacent around their shared midpoint. Centering each
    // partner under its own parents (above) otherwise leaves a couple where BOTH
    // partners have parents — e.g. a consanguineous cousin union — spread apart
    // when those parents are far from each other. The midpoint is preserved so
    // the couple still sits over the descent to their children.
    for (const pg of graph.partnerGroups) {
      if (pg.members.length !== 2) continue;
      const cols = pg.members
        .map((m) => {
          const loc = nodeLocation.get(m);
          return loc?.layer === layer ? loc.col : -1;
        })
        .filter((c) => c >= 0)
        .toSorted((a, b) => a - b);
      if (cols.length !== 2 || cols[1]! - cols[0]! !== 1) continue;
      const mid = (ideal[cols[0]!]! + ideal[cols[1]!]!) / 2;
      ideal[cols[0]!] = mid - 0.5;
      ideal[cols[1]!] = mid + 0.5;
    }

    // Resolve overlaps: left-to-right sweep enforcing min gap of 1
    const resolved = [...ideal];
    for (let col = 1; col < layerN; col++) {
      if (resolved[col]! - resolved[col - 1]! < 1) {
        resolved[col] = resolved[col - 1]! + 1;
      }
    }

    // Re-center sibling groups around their ideal center after spread
    for (const fu of graph.familyUnits) {
      const childCols = fu.children
        .map((c) => {
          const loc = nodeLocation.get(c);
          return loc?.layer === layer ? loc.col : -1;
        })
        .filter((c) => c >= 0)
        .toSorted((a, b) => a - b);

      if (childCols.length < 2) continue;

      const idealCenter =
        childCols.reduce((sum, c) => sum + ideal[c]!, 0) / childCols.length;
      const resolvedCenter =
        childCols.reduce((sum, c) => sum + resolved[c]!, 0) / childCols.length;
      const drift = idealCenter - resolvedCenter;

      if (Math.abs(drift) > 0.01) {
        for (const col of childCols) {
          resolved[col] = resolved[col]! + drift;
        }
      }
    }

    // Final left-to-right to ensure strict ordering after re-centering
    for (let col = 1; col < layerN; col++) {
      if (resolved[col]! - resolved[col - 1]! < 1) {
        resolved[col] = resolved[col - 1]! + 1;
      }
    }

    pos[layer] = resolved;
  }

  // Upward centering: shift parent groups to center over their children.
  // Partner groups move as a unit; neighbouring nodes are pushed aside to
  // make room, maintaining a minimum gap of 1.
  //
  // When a parent appears in multiple family units (e.g. Margaret with two
  // ex-partners), merge all children from those units so the parent's
  // position accounts for all of them at once.
  for (let layer = maxLayer - 2; layer >= 0; layer--) {
    const layerN = n[layer]!;
    if (layerN === 0) continue;
    const childLayer = layer + 1;
    const childLayerCount = n[childLayer];
    if (
      childLayer >= maxLayer ||
      childLayerCount === undefined ||
      childLayerCount === 0
    )
      continue;

    const layerNodes = nid[layer]!.slice(0, layerN);

    // Merge family units that share parents on this layer into
    // combined centering groups: { parentCols, allChildrenBelow }.
    const processed = new Set<number>();
    type CenteringGroup = { parentCols: number[]; children: number[] };
    const centeringGroups: CenteringGroup[] = [];

    for (let fi = 0; fi < graph.familyUnits.length; fi++) {
      if (processed.has(fi)) continue;
      const fu = graph.familyUnits[fi]!;
      if (fu.parentGroup.members.length < 2) continue;

      const parentCols = fu.parentGroup.members
        .map((m) => {
          const idx = layerNodes.indexOf(m);
          return idx >= 0 ? idx : -1;
        })
        .filter((c) => c >= 0);
      if (parentCols.length === 0) continue;

      const parentNodeSet = new Set(parentCols.map((c) => nid[layer]![c]!));
      const allChildren = new Set(fu.children);
      processed.add(fi);

      // Find other family units sharing any parent on this layer
      for (let fj = fi + 1; fj < graph.familyUnits.length; fj++) {
        if (processed.has(fj)) continue;
        const otherFu = graph.familyUnits[fj]!;
        const sharesParent = otherFu.parentGroup.members.some((m) => {
          const idx = layerNodes.indexOf(m);
          return idx >= 0 && parentNodeSet.has(nid[layer]![idx]!);
        });
        if (!sharesParent) continue;

        processed.add(fj);
        for (const m of otherFu.parentGroup.members) {
          const idx = layerNodes.indexOf(m);
          if (idx >= 0) {
            parentCols.push(idx);
            parentNodeSet.add(nid[layer]![idx]!);
          }
        }
        for (const c of otherFu.children) {
          allChildren.add(c);
        }
      }

      const uniqueParentCols = [...new Set(parentCols)].toSorted(
        (a, b) => a - b,
      );
      centeringGroups.push({
        parentCols: uniqueParentCols,
        children: [...allChildren],
      });
    }

    // Sort centering groups left-to-right by leftmost parent col
    centeringGroups.sort(
      (a, b) => Math.min(...a.parentCols) - Math.min(...b.parentCols),
    );

    for (const cg of centeringGroups) {
      const childrenBelow = cg.children.filter((c) => {
        const loc = nodeLocation.get(c);
        return loc?.layer === childLayer;
      });
      if (childrenBelow.length === 0) continue;

      const childPositions = childrenBelow.map((c) => {
        const loc = nodeLocation.get(c)!;
        return pos[childLayer]![loc.col]!;
      });
      const childCenter =
        childPositions.reduce((a, b) => a + b, 0) / childPositions.length;

      const parentPositions = cg.parentCols.map((c) => pos[layer]![c]!);
      const parentCenter =
        parentPositions.reduce((a, b) => a + b, 0) / parentPositions.length;

      const shift = childCenter - parentCenter;

      if (Math.abs(shift) < 0.01) continue;

      const newPositions = [...pos[layer]!];
      for (const col of cg.parentCols) {
        newPositions[col] = newPositions[col]! + shift;
      }

      // Push neighbours aside to maintain minimum gap of 1
      const minCol = Math.min(...cg.parentCols);
      const maxCol = Math.max(...cg.parentCols);

      // Push left neighbours leftward
      for (let col = minCol - 1; col >= 0; col--) {
        if (newPositions[col + 1]! - newPositions[col]! < 1) {
          newPositions[col] = newPositions[col + 1]! - 1;
        }
      }
      // Push right neighbours rightward
      for (let col = maxCol + 1; col < layerN; col++) {
        if (newPositions[col]! - newPositions[col - 1]! < 1) {
          newPositions[col] = newPositions[col - 1]! + 1;
        }
      }

      // Verify strict ordering after push
      let valid = true;
      for (let col = 1; col < layerN; col++) {
        if (newPositions[col]! <= newPositions[col - 1]!) {
          valid = false;
          break;
        }
      }

      if (valid) {
        pos[layer] = newPositions;
      }
    }
  }
  // Enforce minimum gap of 1 on every layer after all centering passes
  for (let layer = 0; layer < maxLayer; layer++) {
    const layerN = n[layer]!;
    if (layerN <= 1) continue;
    for (let col = 1; col < layerN; col++) {
      if (pos[layer]![col]! - pos[layer]![col - 1]! < 1) {
        pos[layer]![col] = pos[layer]![col - 1]! + 1;
      }
    }
  }

  // Ensure all positions are non-negative after centering shifts.
  // Use a single global offset so parent–child alignment is preserved.
  {
    let globalMin = 0;
    for (let layer = 0; layer < maxLayer; layer++) {
      const layerPos = pos[layer]!;
      for (const val of layerPos) {
        if (val < globalMin) globalMin = val;
      }
    }
    if (globalMin < 0) {
      const offset = -globalMin;
      for (let layer = 0; layer < maxLayer; layer++) {
        const layerPos = pos[layer]!;
        for (let col = 0; col < layerPos.length; col++) {
          layerPos[col] = layerPos[col]! + offset;
        }
      }
    }
  }

  // Step 3: fam
  const fam: number[][] = [];
  for (let layer = 0; layer < maxLayer; layer++) {
    const layerFam: number[] = [];
    for (let col = 0; col < n[layer]!; col++) {
      const node = nid[layer]![col]!;
      const primaryParents = graph.parents[node]!.filter((p) =>
        isPrimaryEdge(p.edgeType),
      ).map((p) => p.parentIndex);

      if (primaryParents.length === 0 || layer === 0) {
        layerFam.push(0);
        continue;
      }

      // Check if parents are on the layer directly above
      const parentsAbove = primaryParents.filter((p) => {
        const loc = nodeLocation.get(p);
        return loc?.layer === layer - 1;
      });

      if (parentsAbove.length === 0) {
        layerFam.push(0);
        continue;
      }

      if (parentsAbove.length >= 2) {
        // Find partner group containing these parents
        const parentSet = new Set(parentsAbove);
        let famCol = 0;
        for (const pg of graph.partnerGroups) {
          if (pg.members.every((m) => parentSet.has(m))) {
            // Find leftmost member of this group in the layer above
            let leftCol = Number.POSITIVE_INFINITY;
            for (const m of pg.members) {
              const loc = nodeLocation.get(m);
              if (loc?.layer === layer - 1 && loc.col < leftCol) {
                leftCol = loc.col;
              }
            }
            if (leftCol < Number.POSITIVE_INFINITY) {
              famCol = leftCol + 1; // 1-based
            }
            break;
          }
        }
        layerFam.push(famCol);
      } else {
        // Single parent
        const parentIdx = parentsAbove[0]!;
        const parentLoc = nodeLocation.get(parentIdx);
        if (parentLoc) {
          layerFam.push(parentLoc.col + 1); // 1-based
        } else {
          layerFam.push(0);
        }
      }
    }
    fam.push(layerFam);
  }

  // Step 4: group (partner line markers)
  const group: number[][] = [];
  for (let layer = 0; layer < maxLayer; layer++) {
    const layerGroup: number[] = [];
    for (let col = 0; col < n[layer]!; col++) {
      if (col >= n[layer]! - 1) {
        layerGroup.push(0);
        continue;
      }

      const nodeA = nid[layer]![col]!;
      const nodeB = nid[layer]![col + 1]!;

      // Check if they belong to the same partner group
      const inPartnerGroup = graph.partnerGroups.some(
        (pg) => pg.members.includes(nodeA) && pg.members.includes(nodeB),
      );

      if (!inPartnerGroup) {
        layerGroup.push(0);
        continue;
      }

      // Check consanguinity: do they share common ancestors?
      const ancestorsA = ancestor(nodeA, ped.parents);
      const ancestorsB = ancestor(nodeB, ped.parents);
      const ancestorSetB = new Set(ancestorsB);
      const isConsanguineous = ancestorsA.some((a) => ancestorSetB.has(a));

      layerGroup.push(isConsanguineous ? 2 : 1);
    }
    group.push(layerGroup);
  }

  // Step 5: groupMember
  const founderSet = new Set<number>();
  for (let i = 0; i < graph.nodeCount; i++) {
    if (graph.parents[i]!.length === 0) {
      founderSet.add(i);
    }
  }

  const nonFoundersInPartnerGroup = new Set<number>();
  for (const pg of graph.partnerGroups) {
    for (const m of pg.members) {
      if (!founderSet.has(m)) {
        nonFoundersInPartnerGroup.add(m);
      }
    }
  }

  const marriedInSet = new Set<number>();
  for (const pg of graph.partnerGroups) {
    const hasNonFounder = pg.members.some((m) =>
      nonFoundersInPartnerGroup.has(m),
    );
    if (hasNonFounder) {
      for (const m of pg.members) {
        if (founderSet.has(m)) {
          marriedInSet.add(m);
        }
      }
    }
  }

  const groupMember: boolean[][] = [];
  for (let layer = 0; layer < maxLayer; layer++) {
    const layerGM: boolean[] = [];
    for (let col = 0; col < n[layer]!; col++) {
      layerGM.push(marriedInSet.has(nid[layer]![col]!));
    }
    groupMember.push(layerGM);
  }

  // Step 6: twins
  let twins: number[][] | null = null;
  const twinRelations = (ped.relation ?? []).filter(
    (r) => r.code === 1 || r.code === 2 || r.code === 3,
  );

  if (twinRelations.length > 0) {
    twins = [];
    for (let layer = 0; layer < maxLayer; layer++) {
      twins.push(Array.from({ length: n[layer]! }, () => 0));
    }

    for (const rel of twinRelations) {
      const loc1 = nodeLocation.get(rel.id1);
      const loc2 = nodeLocation.get(rel.id2);
      if (!loc1 || loc1.layer !== loc2?.layer) continue;

      const leftCol = Math.min(loc1.col, loc2.col);
      twins[loc1.layer]![leftCol] = rel.code;
    }
  }

  return { n, nid, pos, fam, group, twins, groupMember };
}

function sugiyamaLayout(ped: PedigreeInput): PedigreeLayout {
  const graph = buildPedigreeGraph(ped);
  const ordering = minimizeCrossings(graph);
  return encodePedigreeLayout(graph, ordering, ped);
}

export {
  buildPedigreeGraph,
  countCrossings,
  minimizeCrossings,
  sugiyamaLayout,
};
