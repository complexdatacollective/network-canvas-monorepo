import { kindepth } from './kindepth';
import type {
  ParentConnection,
  PedigreeInput,
  PedigreeLayout,
  PedigreeEdgeType,
} from './types';
import { areConsanguineous, layerConstraints, relativeRaisers } from './utils';

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
  /** The family unit each child descends from. */
  familyOf: Map<number, FamilyUnit>;
  /** Each child's parents outside its family unit's parent group: its donors
   * and surrogates, and any social or further primary parent. Their lines run
   * on their own from the parent to the child's family. */
  extraParents: Map<number, number[]>;
  parentEdgeTypes: Map<string, PedigreeEdgeType>;
  /** Each person's twins. */
  twinsOf: Map<number, Set<number>>;
};

function isPrimaryEdge(edgeType: PedigreeEdgeType): boolean {
  return (
    edgeType === 'biological' ||
    edgeType === 'social' ||
    edgeType === 'adoptive'
  );
}

function isAuxiliaryEdge(edgeType: PedigreeEdgeType): boolean {
  return edgeType === 'donor' || edgeType === 'surrogate';
}

function partnerGroupKey(members: number[]): string {
  return [...members].toSorted((a, b) => a - b).join(',');
}

/**
 * Each person's parents as the layout places them. A child adopted or raised
 * by a relative (see `relativeRaisers`) stays in their birth family: the
 * relatives who raise them, and anyone raising them alongside, are drawn
 * beside the birth family with a line of their own, as extra parents, rather
 * than as the parents the child descends from. Their links are left out here.
 * Everyone else's parents are as given.
 */
function placementParents(ped: PedigreeInput): ParentConnection[][] {
  const raisers = relativeRaisers(ped.parents, ped.partners);
  return ped.parents.map((conns, child) =>
    raisers[child]!.size === 0
      ? conns
      : conns.filter(
          (p) =>
            !(
              (p.edgeType === 'adoptive' || p.edgeType === 'social') &&
              raisers[child]!.has(p.parentIndex)
            ),
        ),
  );
}

function buildPedigreeGraph(ped: PedigreeInput): PedigreeGraph {
  const n = ped.id.length;
  const placed = placementParents(ped);

  // 1. Assign layers (1-based). A child's generation comes from its primary
  // parents, and from all of its parents only when it has none, as in step
  // 3b: a donor may be a generation younger than the parents who raise the
  // child, or one of them may be the child's birth parent. Every donor and
  // surrogate is lined up with the child's primary parents, whether or not
  // their own parents are shown, so a donor shared by two families brings
  // both onto the donor's row.
  const generationParents = placed.map((pConns) => {
    const primary = pConns.filter((p) => isPrimaryEdge(p.edgeType));
    return primary.length > 0 ? primary : pConns;
  });
  const alignedAuxiliaryParents = placed.map((pConns, i) =>
    generationParents[i] === pConns
      ? []
      : pConns.filter((p) => isAuxiliaryEdge(p.edgeType)),
  );
  const depth = kindepth(generationParents, true, alignedAuxiliaryParents);
  const layers = depth.map((d) => d + 1);

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

  // Explicit partner edges are authoritative. Implicit co-parent inference is
  // only a fallback for parents whose partnership was not recorded.
  const explicitPartnerPairs = new Set(groupMap.keys());

  // From implicit co-parent detection
  for (let i = 0; i < n; i++) {
    const pConns = placed[i]!;
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

        const hasExplicitPartnerAmongOtherParents = (parent: number) =>
          primaryParents.some(
            (candidate) =>
              candidate !== parent &&
              candidate !== (parent === pa ? pb : pa) &&
              explicitPartnerPairs.has(partnerGroupKey([parent, candidate])),
          );

        // When either co-parent has an explicit partnership to another parent
        // of this child, do not invent a partnership between this pair. This is
        // common in multi-parent families: two social parents may each be an
        // ex-partner of the same biological parent without being partners of
        // one another.
        if (
          hasExplicitPartnerAmongOtherParents(pa) ||
          hasExplicitPartnerAmongOtherParents(pb)
        ) {
          continue;
        }

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

  // 3b. Settle layers. Each child sits below its primary parents and below
  // its donors and surrogates, never on their row; partners share a layer;
  // and a donor or surrogate shares the layer of the parents they contribute
  // alongside. Descent always holds. Some families cannot have every
  // alignment as well (someone partnered with their own grandchild, a
  // daughter who carried her mother's baby), so each alignment is kept only
  // if it leaves the constraints satisfiable — in order, partnerships first —
  // and one that would need a person above their own descendant is dropped:
  // its people then sit on different layers, and the child goes down a row
  // below them all.
  const { constrain, settle } = layerConstraints(n);
  for (let i = 0; i < n; i++) {
    for (const p of placed[i]!) {
      if (isPrimaryEdge(p.edgeType) || isAuxiliaryEdge(p.edgeType)) {
        constrain([[p.parentIndex, i]], 1);
      }
    }
  }
  for (const group of partnerGroups) {
    const [first, ...rest] = group.members;
    for (const m of rest) {
      constrain(
        [
          [first!, m],
          [m, first!],
        ],
        0,
      );
    }
  }
  for (let i = 0; i < n; i++) {
    const pConns = placed[i]!;
    for (const aux of pConns.filter((p) => isAuxiliaryEdge(p.edgeType))) {
      for (const p of pConns.filter((q) => isPrimaryEdge(q.edgeType))) {
        constrain(
          [
            [p.parentIndex, aux.parentIndex],
            [aux.parentIndex, p.parentIndex],
          ],
          0,
        );
      }
    }
  }
  settle(layers);

  // 4. Build family units. A child belongs to a partner group when every
  // member is one of its primary parents. A child with three or more primary
  // parents can match several groups (its biological parents' couple, and a
  // parent's partner who is a social parent); it descends from the group most
  // strongly its parents — a social parent weighs less than a biological or
  // adoptive one — and from the first such group on a tie.
  const parentWeight = (edgeType: PedigreeEdgeType) =>
    edgeType === 'social' ? 1 : 2;
  const familyGroupOf = new Map<number, PartnerGroup>();
  for (let i = 0; i < n; i++) {
    const primaryEdges = placed[i]!.filter((p) => isPrimaryEdge(p.edgeType));
    let bestWeight = 0;
    for (const group of partnerGroups) {
      let weight = 0;
      for (const member of group.members) {
        const edge = primaryEdges.find((p) => p.parentIndex === member);
        if (!edge) {
          weight = 0;
          break;
        }
        weight += parentWeight(edge.edgeType);
      }
      if (weight > bestWeight) {
        bestWeight = weight;
        familyGroupOf.set(i, group);
      }
    }
  }

  const familyUnits: FamilyUnit[] = [];
  for (const group of partnerGroups) {
    const children: number[] = [];
    for (let i = 0; i < n; i++) {
      if (familyGroupOf.get(i) === group) children.push(i);
    }

    if (children.length > 0) {
      familyUnits.push({ parentGroup: group, children });
    }
  }

  // Handle single-parent families: group children who share the same sole
  // primary parent and aren't already covered by a partner-group family unit.
  const singleParentChildren = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const pConns = placed[i]!;
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

  // 6b. Each family-unit child's parents outside its family's parent group.
  const familyOf = new Map<number, FamilyUnit>();
  for (const fu of familyUnits) {
    for (const child of fu.children) familyOf.set(child, fu);
  }
  const extraParents = new Map<number, number[]>();
  for (let child = 0; child < n; child++) {
    const fu = familyOf.get(child);
    if (!fu) continue;
    const extras = [
      ...new Set(
        ped.parents[child]!.map((p) => p.parentIndex).filter(
          (p) => !fu.parentGroup.members.includes(p),
        ),
      ),
    ];
    if (extras.length > 0) extraParents.set(child, extras);
  }

  // 7. Store edge types
  const parentEdgeTypes = new Map<string, PedigreeEdgeType>();
  for (let i = 0; i < n; i++) {
    for (const p of ped.parents[i]!) {
      parentEdgeTypes.set(`${p.parentIndex}-${i}`, p.edgeType);
    }
  }

  // 8. Twins, as the relation codes record them.
  const twinsOf = new Map<number, Set<number>>();
  for (const { id1, id2, code } of ped.relation ?? []) {
    if (code > 3) continue;
    twinsOf.set(id1, new Set([...(twinsOf.get(id1) ?? []), id2]));
    twinsOf.set(id2, new Set([...(twinsOf.get(id2) ?? []), id1]));
  }

  return {
    nodeCount: n,
    layers,
    parents: ped.parents,
    partnerGroups,
    familyUnits,
    siblingGroups,
    auxiliaryParents,
    familyOf,
    extraParents,
    parentEdgeTypes,
    twinsOf,
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

/**
 * The people of a set of partnerships in an order that puts every couple
 * side by side, when one exists: the partnerships must form a single chain,
 * each person partnered with at most two others and no partnership closing a
 * loop. The chain starts from its lower-indexed end. Returns null otherwise.
 */
function partnershipChain(
  nodes: number[],
  couples: number[][],
): number[] | null {
  const partnersOf = new Map<number, number[]>(nodes.map((n) => [n, []]));
  for (const couple of couples) {
    if (couple.length !== 2) return null;
    const [a, b] = couple as [number, number];
    if (!partnersOf.has(a) || !partnersOf.has(b)) continue;
    partnersOf.get(a)!.push(b);
    partnersOf.get(b)!.push(a);
  }

  const ends = nodes.filter((n) => partnersOf.get(n)!.length === 1);
  if (ends.length !== 2 || nodes.some((n) => partnersOf.get(n)!.length > 2)) {
    return null;
  }

  const chain = [Math.min(...ends)];
  while (chain.length < nodes.length) {
    const last = chain.at(-1)!;
    const next = partnersOf.get(last)!.find((p) => !chain.includes(p));
    if (next === undefined) return null;
    chain.push(next);
  }
  return chain;
}

type Partnership = {
  members: [number, number];
  isActive: boolean;
  /** When it was recorded, relative to the others. */
  order: number;
  /** How many children descend from the two as a couple. */
  sharedChildren: number;
  /** How many children have both as parents of any kind. */
  childrenInCommon: number;
};

/** The two-person partnerships joining `nodes` to one another. */
function partnershipsAmong(
  nodes: number[],
  graph: PedigreeGraph,
): Partnership[] {
  const nodeSet = new Set(nodes);
  const result: Partnership[] = [];
  graph.partnerGroups.forEach((pg, order) => {
    const [a, b] = pg.members;
    if (pg.members.length !== 2 || a === undefined || b === undefined) return;
    if (!nodeSet.has(a) || !nodeSet.has(b)) return;
    const childrenInCommon = graph.parents.filter(
      (conns) =>
        conns.some((p) => p.parentIndex === a) &&
        conns.some((p) => p.parentIndex === b),
    ).length;
    const sharedChildren = [...graph.familyOf.values()].filter(
      (fu) => fu.parentGroup === pg,
    ).length;
    result.push({
      members: [a, b],
      isActive: pg.isActive,
      order,
      sharedChildren,
      childrenInCommon,
    });
  });
  return result;
}

/**
 * Turns a row of partners to face a fixed way, so that recording another
 * partnership never mirrors the partners already seated: the earliest
 * recorded current partnership sitting side by side (the earliest of any
 * when none is current) keeps its lower-indexed partner on the left, as a
 * lone couple does.
 */
function orientPartners(
  order: number[],
  partnerships: Partnership[],
): number[] {
  const col = new Map(order.map((node, i) => [node, i]));
  const adjacent = partnerships
    .filter(({ members: [a, b] }) => Math.abs(col.get(a)! - col.get(b)!) === 1)
    .toSorted(
      (x, y) => Number(y.isActive) - Number(x.isActive) || x.order - y.order,
    );
  const reference = adjacent[0];
  if (!reference) return order;
  const [a, b] = reference.members;
  const lower = Math.min(a, b);
  const higher = Math.max(a, b);
  return col.get(lower)! < col.get(higher)! ? order : order.toReversed();
}

/**
 * The partners of one person, seated around them. Only two can sit beside
 * them; partners who share the most children with them take those seats
 * first. Former partners go on one side and current partners on the other,
 * each side in the order the partnerships were recorded: former partners
 * from the earliest, outermost, to the latest, beside the person; current
 * partners from the earliest, beside the person, outwards.
 */
function seatAroundAnchor(
  anchor: number,
  partners: number[],
  partnerships: Partnership[],
): number[] {
  const withAnchor = new Map(
    partners.map((p) => [
      p,
      partnerships.find(
        ({ members }) => members.includes(anchor) && members.includes(p),
      )!,
    ]),
  );
  const rel = (p: number) => withAnchor.get(p)!;
  // Nearest the person in time: the latest former partner, the earliest
  // current one.
  const recency = (p: number) =>
    rel(p).isActive ? -rel(p).order : rel(p).order;
  const byPriority = (x: number, y: number) =>
    rel(y).sharedChildren - rel(x).sharedChildren ||
    rel(y).childrenInCommon - rel(x).childrenInCommon ||
    Number(rel(y).isActive) - Number(rel(x).isActive) ||
    recency(y) - recency(x);

  const [first, ...rest] = partners.toSorted(byPriority);
  if (first === undefined) return [anchor];
  // The second seat beside the anchor: the next partner with the most
  // children, and on a tie one whose partnership is the other kind, so each
  // side keeps its own.
  const second = rest.toSorted(
    (x, y) =>
      rel(y).sharedChildren - rel(x).sharedChildren ||
      rel(y).childrenInCommon - rel(x).childrenInCommon ||
      Number(rel(y).isActive !== rel(first).isActive) -
        Number(rel(x).isActive !== rel(first).isActive) ||
      recency(y) - recency(x),
  )[0];
  if (second === undefined)
    return orientPartners([anchor, first], partnerships);

  let left = first;
  let right = second;
  if (rel(first).isActive !== rel(second).isActive) {
    left = rel(first).isActive ? second : first;
    right = left === first ? second : first;
  } else if (rel(second).order < rel(first).order) {
    left = second;
    right = first;
  }
  const others = partners.filter((p) => p !== first && p !== second);
  const formers = others
    .filter((p) => !rel(p).isActive)
    .toSorted((x, y) => rel(x).order - rel(y).order);
  const currents = others
    .filter((p) => rel(p).isActive)
    .toSorted((x, y) => rel(x).order - rel(y).order);
  return orientPartners(
    [...formers, left, anchor, right, ...currents],
    partnerships,
  );
}

/**
 * How well a set of partnerships drawn side by side keeps couples together:
 * first those with children, then as many as can be, then those with more
 * children, then current ones, then the earliest recorded.
 */
function seatingScore(edges: Partnership[]): number[] {
  return [
    edges.reduce((sum, e) => sum + Math.min(e.sharedChildren, 1), 0),
    edges.length,
    edges.reduce((sum, e) => sum + e.sharedChildren, 0),
    edges.reduce((sum, e) => sum + e.childrenInCommon, 0),
    edges.filter((e) => e.isActive).length,
    -edges.reduce((sum, e) => sum + e.order, 0),
  ];
}

/** Whether one seating score is strictly better than another. */
function betterScore(x: number[], y: number[]): boolean {
  for (let i = 0; i < x.length; i++) {
    if (x[i] !== y[i]) return x[i]! > y[i]!;
  }
  return false;
}

/** The partnerships a row seats side by side. */
function seatedSideBySide(
  order: number[],
  partnerships: Partnership[],
): Partnership[] {
  const col = new Map(order.map((node, i) => [node, i]));
  return partnerships.filter(
    ({ members: [a, b] }) => Math.abs(col.get(a)! - col.get(b)!) === 1,
  );
}

/**
 * A row seated around the person with the most partners, as
 * `seatAroundAnchor` seats them, with everyone else then seated on the end of
 * the row nearer a partner already in it. This is how the row was seated
 * before the others' partnerships were recorded, so it keeps those partners'
 * seats.
 */
function seatAroundMainAnchor(
  nodes: number[],
  partnerships: Partnership[],
): number[] {
  const partnersOf = (node: number) =>
    partnerships
      .filter(({ members }) => members.includes(node))
      .map(({ members: [a, b] }) => (a === node ? b : a));
  const anchor = nodes.toSorted(
    (a, b) => partnersOf(b).length - partnersOf(a).length || a - b,
  )[0]!;
  const row = seatAroundAnchor(anchor, partnersOf(anchor), partnerships);
  let remaining = nodes.filter((n) => !row.includes(n));
  while (remaining.length > 0) {
    const next = remaining.find((n) =>
      partnersOf(n).some((p) => row.includes(p)),
    );
    if (next === undefined) {
      row.push(...remaining);
      break;
    }
    const cols = partnersOf(next)
      .map((p) => row.indexOf(p))
      .filter((c) => c >= 0);
    const toLeft = Math.min(...cols);
    const toRight = row.length - 1 - Math.max(...cols);
    if (toLeft <= toRight) row.unshift(next);
    else row.push(next);
    remaining = remaining.filter((n) => n !== next);
  }
  return row;
}

/**
 * A row for partners whose partnerships do not form a single chain: a loop,
 * or several people with more than two partners. The longest chain of
 * partnerships is kept side by side (preferring partnerships with children,
 * then current ones), and everyone else sits on the end of the row nearer
 * their partners in it.
 */
function seatPartnershipTangle(
  nodes: number[],
  partnerships: Partnership[],
): number[] {
  const partnersOf = new Map<number, Partnership[]>(nodes.map((n) => [n, []]));
  for (const p of partnerships) {
    partnersOf.get(p.members[0])!.push(p);
    partnersOf.get(p.members[1])!.push(p);
  }
  let best: number[] = [Math.min(...nodes)];
  let bestScore = seatingScore([]);
  // Partner groups are small; every simple path is tried, within a budget.
  let budget = 20_000;
  const extend = (path: number[], edges: Partnership[]) => {
    if (budget-- <= 0) return;
    const pathScore = seatingScore(edges);
    if (betterScore(pathScore, bestScore)) {
      best = path;
      bestScore = pathScore;
    }
    const last = path.at(-1)!;
    for (const e of partnersOf.get(last)!) {
      const next = e.members[0] === last ? e.members[1] : e.members[0];
      if (path.includes(next)) continue;
      extend([...path, next], [...edges, e]);
    }
  };
  for (const start of nodes.toSorted((a, b) => a - b)) extend([start], []);

  const left: number[] = [];
  const right: number[] = [];
  const distanceToEnd = (node: number) => {
    const cols = partnersOf
      .get(node)!
      .map((e) => (e.members[0] === node ? e.members[1] : e.members[0]))
      .map((p) => best.indexOf(p))
      .filter((c) => c >= 0);
    if (cols.length === 0)
      return { side: 'right' as const, distance: Infinity };
    const toLeft = Math.min(...cols);
    const toRight = best.length - 1 - Math.max(...cols);
    return toLeft <= toRight
      ? { side: 'left' as const, distance: toLeft }
      : { side: 'right' as const, distance: toRight };
  };
  const leftovers = nodes
    .filter((n) => !best.includes(n))
    .map((n) => ({ n, ...distanceToEnd(n) }))
    .toSorted((x, y) => x.distance - y.distance || x.n - y.n);
  for (const { n, side } of leftovers) {
    if (side === 'left') left.push(n);
    else right.push(n);
  }
  return orientPartners(
    [...left.toReversed(), ...best, ...right],
    partnerships,
  );
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

  // A spouse can be attached to a sibling's sibship block directly only when
  // the spouse is not itself holding another sibship together (i.e. is not in a
  // real sibship on this layer). Cross-sibship partnerships are combined into a
  // compound block below so both sibships stay contiguous and the partners meet
  // at the boundary between them.
  const attachableSpouses = (sibling: number): number[] =>
    (spousesOf.get(sibling) ?? []).filter(
      (sp) => !inRealSibship.has(sp) && !assigned.has(sp),
    );

  // The partnerships joining `nodes` to one another.
  const couplesAmong = (nodes: number[]): number[][] =>
    graph.partnerGroups
      .filter((pg) => pg.members.every((m) => nodes.includes(m)))
      .map((pg) => pg.members);

  // People joined to `start` by partnerships, nearest first, among those
  // `canJoin` admits. Only partnerships are followed, so a sibling comes along
  // only when they are a partner on the way.
  const partnersBeyond = (
    start: number,
    canJoin: (node: number) => boolean,
  ): number[] => {
    const seen = new Set([start]);
    const found: number[] = [];
    let frontier = [start];
    while (frontier.length > 0) {
      const next: number[] = [];
      for (const node of frontier) {
        for (const partner of spousesOf.get(node) ?? []) {
          if (seen.has(partner) || !canJoin(partner)) continue;
          seen.add(partner);
          next.push(partner);
        }
      }
      found.push(...next);
      frontier = next;
    }
    return found;
  };

  // 1. One block per real sibship: siblings in index order, with each married
  //    sibling's attachable spouse(s) beside it so couples stay adjacent while
  //    the sibship stays contiguous. A sibling that anchors TWO OR MORE marriages
  //    must sit BETWEEN its spouses — pushing them all to one side would leave a
  //    spouse non-adjacent and silently drop that marriage line. A single spouse
  //    goes on the outer side (the leftmost sibling's to its left, later siblings'
  //    to their right) to keep the block compact.
  //
  //    When a spouse has partners of their own, the sibling's partnerships form
  //    a chain; the whole chain joins the block in chain order, so no couple in
  //    it is left outside to be split (a sibling at the end of the chain keeps
  //    the rest of it on the outer side).
  for (const members of realSibships) {
    const siblingSet = new Set(members);
    // Siblings in the order recorded, except that twins sit together, from
    // where the first of them was recorded.
    const siblings: number[] = [];
    for (const sib of members.toSorted((a, b) => a - b)) {
      if (siblings.includes(sib)) continue;
      const set = [sib];
      for (let k = 0; k < set.length; k++) {
        for (const twin of graph.twinsOf.get(set[k]!) ?? []) {
          if (siblingSet.has(twin) && !set.includes(twin)) set.push(twin);
        }
      }
      siblings.push(...set.toSorted((a, b) => a - b));
    }
    const isTwinPair = (a: number | undefined, b: number | undefined) =>
      a !== undefined &&
      b !== undefined &&
      (graph.twinsOf.get(a)?.has(b) ?? false);
    const ordered: number[] = [];
    siblings.forEach((sib, idx) => {
      // Placed already, as part of an earlier sibling's chain.
      if (assigned.has(sib)) return;

      // Everyone joined to this sibling by partnerships, through people
      // outside any sibship and through its own siblings: a chain can leave
      // the sibship and come back to it.
      const group = new Set([sib]);
      const toVisit = [sib];
      while (toVisit.length > 0) {
        for (const partner of spousesOf.get(toVisit.pop()!) ?? []) {
          if (group.has(partner) || assigned.has(partner)) continue;
          if (inRealSibship.has(partner) && !siblingSet.has(partner)) continue;
          group.add(partner);
          toVisit.push(partner);
        }
      }
      const groupNodes = [...group];
      const chain =
        groupNodes.length > 2
          ? partnershipChain(groupNodes, couplesAmong(groupNodes))
          : null;
      if (chain) {
        for (const node of chain) assigned.add(node);
        const atEnd = chain[0] === sib || chain.at(-1) === sib;
        const endingAtSibling = chain[0] === sib ? chain.toReversed() : chain;
        const holdsOtherSiblings = chain.some(
          (node) => node !== sib && siblingSet.has(node),
        );
        if (!atEnd || holdsOtherSiblings) {
          ordered.push(...chain);
        } else if (idx === 0) {
          ordered.push(...endingAtSibling);
        } else {
          ordered.push(...endingAtSibling.toReversed());
        }
        return;
      }

      const spouses = attachableSpouses(sib).toSorted((a, b) => a - b);
      assigned.add(sib);
      for (const sp of spouses) assigned.add(sp);
      if (spouses.length >= 2) {
        ordered.push(
          ...seatAroundAnchor(
            sib,
            spouses,
            partnershipsAmong([sib, ...spouses], graph),
          ),
        );
      } else {
        // A single spouse goes on the outer side, and never between twins.
        const twinBefore = isTwinPair(siblings[idx - 1], sib);
        const twinAfter = isTwinPair(sib, siblings[idx + 1]);
        const left =
          twinAfter && !twinBefore ? true : twinBefore ? false : idx === 0;
        if (left) ordered.push(...spouses, sib);
        else ordered.push(sib, ...spouses);
      }
    });
    blocks.push({ nodes: ordered, barycenter: 0 });
  }

  // 1b. Join sibship blocks connected by a partnership. Leaving these as two
  // independent blocks lets barycentric sorting put unrelated people between
  // the partners; group encoding only represents adjacent partners, so that
  // silently drops both the partnership line and its shared line of descent.
  //
  // Put the partnered member of the left block at its right boundary and the
  // partnered member of the right block at its left boundary. The combined
  // block can still move or reverse as one unit during crossing minimization.
  // If an anchor already has partners inside its block, carry them with it,
  // nearest first, so a chain of partnerships remains contiguous from the
  // anchor inward.
  const movePartnerAnchorToBoundary = (
    nodes: number[],
    anchor: number,
    boundary: 'left' | 'right',
  ): number[] => {
    // Each of the anchor's partners in the block leads one arm of its chain:
    // the partner, then everyone beyond them, nearest first. Arms are kept
    // whole and placed one after another, so the only partnership drawn apart
    // is between the anchor and a second arm, which it cannot sit beside once
    // it is on the boundary.
    const carried = new Set([anchor]);
    const arms: number[][] = [];
    for (const partner of spousesOf.get(anchor) ?? []) {
      if (!nodes.includes(partner) || carried.has(partner)) continue;
      carried.add(partner);
      const beyond = partnersBeyond(
        partner,
        (node) => nodes.includes(node) && !carried.has(node),
      );
      for (const node of beyond) carried.add(node);
      arms.push([partner, ...beyond]);
    }
    const remaining = nodes.filter((node) => !carried.has(node));

    if (boundary === 'left') {
      return [anchor, ...arms.flat(), ...remaining];
    }

    return [...remaining, ...arms.flat().toReversed(), anchor];
  };

  for (const pg of graph.partnerGroups) {
    if (pg.members.length !== 2) continue;
    const [partnerA, partnerB] = pg.members;
    const blockA = blocks.findIndex((block) => block.nodes.includes(partnerA!));
    const blockB = blocks.findIndex((block) => block.nodes.includes(partnerB!));
    if (blockA < 0 || blockB < 0 || blockA === blockB) continue;

    const leftBlockIndex = Math.min(blockA, blockB);
    const rightBlockIndex = Math.max(blockA, blockB);
    const leftBlock = blocks[leftBlockIndex]!;
    const rightBlock = blocks[rightBlockIndex]!;
    const leftPartner = leftBlock.nodes.includes(partnerA!)
      ? partnerA!
      : partnerB!;
    const rightPartner = leftPartner === partnerA ? partnerB! : partnerA!;

    leftBlock.nodes = [
      ...movePartnerAnchorToBoundary(leftBlock.nodes, leftPartner, 'right'),
      ...movePartnerAnchorToBoundary(rightBlock.nodes, rightPartner, 'left'),
    ];
    blocks.splice(rightBlockIndex, 1);
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
    // Seat the block by its partnerships, never by index: an anchor (a person
    // with several partners) between its partners, a chain of partnerships in
    // chain order (a participant between a former and a current partner, the
    // current partner beside their own former partner), and anything else by
    // its longest chain. Each is turned to face the way its couples already
    // did.
    const anchors = blockNodes.filter(
      (n) => (nodeToPartnerGroups.get(n)?.length ?? 0) > 1,
    );
    const partnerships = partnershipsAmong(blockNodes, graph).filter(
      ({ members: [a, b] }) =>
        (nodeToPartnerGroups.get(a) ?? []).some((gi) =>
          graph.partnerGroups[gi]!.members.includes(b),
        ),
    );
    let ordered: number[];
    if (anchors.length === 1) {
      const anchor = anchors[0]!;
      ordered = seatAroundAnchor(
        anchor,
        blockNodes.filter((n) => n !== anchor),
        partnerships,
      );
    } else if (anchors.length > 1) {
      const chain = partnershipChain(
        blockNodes,
        partnerships.map((p) => p.members),
      );
      if (chain) {
        ordered = orientPartners(chain, partnerships);
      } else {
        // Seated around the person with the most partners when that keeps
        // as many couples side by side as the longest chain does (whichever
        // were recorded first), so a partnership recorded between two others
        // does not reseat that person's partners.
        const tangle = seatPartnershipTangle(blockNodes, partnerships);
        const aroundAnchor = seatAroundMainAnchor(blockNodes, partnerships);
        const keptTogether = (order: number[]) =>
          seatingScore(seatedSideBySide(order, partnerships)).slice(0, -1);
        ordered = betterScore(keptTogether(tangle), keptTogether(aroundAnchor))
          ? tangle
          : aroundAnchor;
      }
    } else {
      ordered = blockNodes;
    }
    for (const n of ordered) assigned.add(n);
    blocks.push({ nodes: ordered, barycenter: 0 });
  }

  // 2b. Seat each child's extra parents — donors, surrogates, and social or
  //     further primary parents outside its family's couple — beside the
  //     parents they contribute alongside. Such a parent who is not part of
  //     any partnership or sibship would otherwise fall through to a
  //     singleton and drift away, drawing a very long line. Attach it to the
  //     OUTER edge of the block holding the child's family-unit parents so the
  //     couple stays contiguous and the line stays short. A single parent with
  //     no block of their own yet starts one here.
  //
  //     A donor or surrogate always sits beside the child's parents, even
  //     when partnered or in a sibship: their block joins the parents' block,
  //     with the donor on its boundary beside the parents and their partners
  //     on the inner side. A donor shared by two families joins the first.
  const blockHolding = (nodes: number[]) => {
    const set = new Set(nodes);
    let block = blocks.find((b) => b.nodes.some((node) => set.has(node)));
    if (!block) {
      block = { nodes, barycenter: 0 };
      for (const node of nodes) assigned.add(node);
      blocks.push(block);
    }
    return block;
  };
  const seatedDonors = new Set<number>();
  for (const [child, extras] of graph.extraParents) {
    const familyUnit = graph.familyOf.get(child)!;
    for (const aux of extras) {
      if (!nodeSet.has(aux)) continue;
      const coupleOnLayer = familyUnit.parentGroup.members.filter((m) =>
        nodeSet.has(m),
      );
      if (coupleOnLayer.length === 0) continue; // couple not on this layer
      const coupleSet = new Set(coupleOnLayer);
      const isDonor = isAuxiliaryEdge(
        graph.parentEdgeTypes.get(`${aux}-${child}`) ?? 'biological',
      );

      if (assigned.has(aux) || inRealSibship.has(aux) || spousesOf.has(aux)) {
        // Placed already by steps 1–2, or for another child. Only a donor
        // or surrogate seated by steps 1–2 is moved beside the parents.
        if (!isDonor || seatedDonors.has(aux)) continue;
        seatedDonors.add(aux);
        const donorBlock = blocks.find((b) => b.nodes.includes(aux));
        const coupleBlock = blockHolding(coupleOnLayer);
        if (!donorBlock || donorBlock === coupleBlock) continue;
        const couplePositions = coupleBlock.nodes
          .map((node, i) => (coupleSet.has(node) ? i : -1))
          .filter((i) => i >= 0);
        const toLeftEdge = Math.min(...couplePositions);
        const toRightEdge =
          coupleBlock.nodes.length - 1 - Math.max(...couplePositions);
        coupleBlock.nodes =
          toLeftEdge <= toRightEdge
            ? [
                ...movePartnerAnchorToBoundary(donorBlock.nodes, aux, 'right'),
                ...coupleBlock.nodes,
              ]
            : [
                ...coupleBlock.nodes,
                ...movePartnerAnchorToBoundary(donorBlock.nodes, aux, 'left'),
              ];
        blocks.splice(blocks.indexOf(donorBlock), 1);
        continue;
      }
      if (isDonor) seatedDonors.add(aux);

      const targetBlock = blockHolding(coupleOnLayer);

      // Seat the parent immediately adjacent to the couple, on the couple's
      // OUTER side (the side nearer the block boundary). When the couple is its
      // own block this lands on the block edge; when the couple is embedded in a
      // sibship block it lands beside the couple rather than at the far end, so
      // the line stays short either way. On a tie it takes the side of the
      // sibship the child sits on; for a child in the middle (an only child),
      // the side holding fewer of this child's other extra parents, so two
      // such lines reach them from opposite sides instead of one running
      // under the other.
      const couplePositions = targetBlock.nodes
        .map((node, i) => (coupleSet.has(node) ? i : -1))
        .filter((i) => i >= 0);
      const leftPos = Math.min(...couplePositions);
      const rightPos = Math.max(...couplePositions);
      // Never seat it between two partners: when the couple sits inside a
      // chain of partnerships, go out past the end of the chain.
      const nodes = targetBlock.nodes;
      const partnered = (a: number, b: number) =>
        (spousesOf.get(a) ?? []).includes(b);
      const others = new Set(extras.filter((x) => x !== aux));
      const othersLeft = nodes
        .slice(0, leftPos)
        .filter((node) => others.has(node)).length;
      const othersRight = nodes
        .slice(rightPos + 1)
        .filter((node) => others.has(node)).length;
      // The child's other extra parents seated already do not count towards
      // the distance to the block's edge.
      const distToLeftEdge = leftPos - othersLeft;
      const distToRightEdge =
        targetBlock.nodes.length - 1 - rightPos - othersRight;
      // On a tie, the side of the sibship the child sits on (siblings are
      // seated in the order recorded), so the line reaches the child without
      // passing over the family's line of descent. A parent of every child
      // in the sibship joins its bar instead, from either side.
      const siblings = familyUnit.children
        .filter((c) => graph.layers[c] === graph.layers[child])
        .toSorted((a, b) => a - b);
      const parentOfAll = siblings.every((c) =>
        graph.extraParents.get(c)?.includes(aux),
      );
      const childSide = parentOfAll
        ? 0
        : Math.sign(siblings.indexOf(child) - (siblings.length - 1) / 2);
      const seatRight =
        distToRightEdge === distToLeftEdge
          ? childSide !== 0
            ? childSide > 0
            : othersRight <= othersLeft
          : distToRightEdge < distToLeftEdge;
      if (seatRight) {
        let end = rightPos;
        while (
          end + 1 < nodes.length &&
          partnered(nodes[end]!, nodes[end + 1]!)
        ) {
          end++;
        }
        nodes.splice(end + 1, 0, aux);
      } else {
        let start = leftPos;
        while (start > 0 && partnered(nodes[start - 1]!, nodes[start]!)) {
          start--;
        }
        nodes.splice(start, 0, aux);
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
 * (descent-point, child) for family-unit children; for each of their extra
 * parents (donors, surrogates, social or further primary parents), one edge
 * to the near end of the sibship when they parent all of it, or one per child
 * otherwise; and direct edges for children not covered by any family unit.
 *
 * Each edge says whether it is a line of descent (a family's, or a primary
 * parent's direct line) or an extra parent's line: two lines of descent that
 * cross also pull a child out from under its parents, so that crossing
 * weighs more.
 *
 * It also counts the people an extra parent's line runs beneath: everyone on
 * the upper layer between that parent and the nearest of the family's
 * parents. Such a line reads as coming from whoever it passes under.
 */
/** An edge between two layers: upper position, lower position, and whether
 * it is a line of descent. */
type LayerEdge = [upper: number, lower: number, descent: boolean];

function collectLayerEdges(
  upperLayer: number[],
  lowerLayer: number[],
  graph: PedigreeGraph,
  pos: Map<number, number>,
): { edges: LayerEdge[]; linesUnderPeople: number } {
  const upperSet = new Set(upperLayer);
  const lowerSet = new Set(lowerLayer);
  const edges: LayerEdge[] = [];
  const coveredChildren = new Set<number>();
  let linesUnderPeople = 0;

  for (const fu of graph.familyUnits) {
    const parentsOnUpper = fu.parentGroup.members.filter((m) =>
      upperSet.has(m),
    );
    const childrenOnLower = fu.children.filter((c) => lowerSet.has(c));
    if (parentsOnUpper.length === 0 || childrenOnLower.length === 0) continue;

    // Descent point is the midpoint of the parent group positions
    const parentPositions = parentsOnUpper.map((p) => pos.get(p)!);
    const descentX =
      parentPositions.reduce((sum, p) => sum + p, 0) / parentPositions.length;

    for (const child of childrenOnLower) {
      edges.push([descentX, pos.get(child)!, true]);
      coveredChildren.add(child);
    }

    const childPositions = childrenOnLower.map((c) => pos.get(c)!);
    const extraChildren = new Map<number, number[]>();
    for (const child of childrenOnLower) {
      for (const extra of graph.extraParents.get(child) ?? []) {
        if (!upperSet.has(extra)) continue;
        extraChildren.set(extra, [...(extraChildren.get(extra) ?? []), child]);
      }
    }
    for (const [extra, children] of extraChildren) {
      const at = pos.get(extra)!;
      if (children.length === childrenOnLower.length && children.length > 1) {
        edges.push([
          at,
          at < descentX
            ? Math.min(...childPositions)
            : Math.max(...childPositions),
          false,
        ]);
      } else {
        for (const child of children) edges.push([at, pos.get(child)!, false]);
      }
      const nearest = parentPositions.reduce((best, p) =>
        Math.abs(p - at) < Math.abs(best - at) ? p : best,
      );
      linesUnderPeople += Math.max(0, Math.abs(nearest - at) - 1);
    }
  }

  // A child no family unit covers: its donors and surrogates, then each of
  // its parents, directly.
  for (const child of lowerLayer) {
    if (coveredChildren.has(child)) continue;
    const auxParents = graph.auxiliaryParents.get(child) ?? [];
    for (const auxParent of auxParents) {
      if (upperSet.has(auxParent)) {
        edges.push([pos.get(auxParent)!, pos.get(child)!, false]);
      }
    }
    const parents = getParentsOf(child, graph);
    for (const parent of parents) {
      if (upperSet.has(parent)) {
        edges.push([pos.get(parent)!, pos.get(child)!, true]);
      }
    }
  }

  return { edges, linesUnderPeople };
}

/**
 * What two crossed lines of descent cost, against 1 for any crossing with an
 * extra parent's line. Crossed lines of descent put each child under the
 * other family's parents, where the drawing reads as the wrong parentage, so
 * any number of extra parents' crossings short of this is preferred.
 */
const DESCENT_CROSSING_WEIGHT = 4;

function countCrossings(
  layerOrdering: number[][],
  graph: PedigreeGraph,
): number {
  const pos = positionMap(layerOrdering);
  let crossings = 0;

  for (let k = 0; k < layerOrdering.length - 1; k++) {
    const upperLayer = layerOrdering[k]!;
    const lowerLayer = layerOrdering[k + 1]!;

    const { edges, linesUnderPeople } = collectLayerEdges(
      upperLayer,
      lowerLayer,
      graph,
      pos,
    );
    crossings += linesUnderPeople;

    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const [u1, v1, descent1] = edges[i]!;
        const [u2, v2, descent2] = edges[j]!;
        if ((u1 < u2 && v1 > v2) || (u1 > u2 && v1 < v2)) {
          crossings += descent1 && descent2 ? DESCENT_CROSSING_WEIGHT : 1;
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

      // Compute barycenters. A child of a family unit is placed by its
      // family's descent point (its parent group's midpoint), the point its
      // line of descent comes from; anyone else by all their parents.
      for (const block of blocks) {
        let totalBarycenter = 0;
        let countWithParents = 0;
        for (const node of block.nodes) {
          const familyParents = (
            graph.familyOf.get(node)?.parentGroup.members ?? []
          ).filter((p) => fixedPos.has(p));
          const parents =
            familyParents.length > 0
              ? familyParents
              : getParentsOf(node, graph);
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
    // Whether a column's ideal comes from people on the row above (directly,
    // or through a partner placed that way).
    const anchored: boolean[] = ideal.map(() => false);

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
        anchored[col] = true;
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
        anchored[col] = true;
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
        anchored[col] = anchored[spouseCol]!;
        break;
      }
    }

    // Everyone else on the row (founders with no parents shown, and their
    // partners) sits right beside the nearest people placed by the row
    // above, rather than at their starting column, which leaves an empty
    // column wherever the people beside them were moved. A couple each of
    // whom has parents shown is not pulled together: each partner sits under
    // their own parents, with a longer partnership line between them.
    if (anchored.some(Boolean)) {
      for (let start = 0; start < layerN; start++) {
        if (anchored[start]) continue;
        let end = start;
        while (end + 1 < layerN && !anchored[end + 1]) end++;
        if (start > 0) {
          for (let col = start; col <= end; col++) {
            ideal[col] = ideal[start - 1]! + (col - start + 1);
          }
        } else {
          for (let col = end; col >= start; col--) {
            ideal[col] = ideal[end + 1]! - (end + 1 - col);
          }
        }
        start = end;
      }
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

      // The children's extra parents seated right beside the group (donors,
      // surrogates, a birth parent, a social parent) move with it rather
      // than being pushed aside and left behind, drawing a long line.
      const extraCols = new Set<number>();
      for (const child of childrenBelow) {
        for (const extra of graph.extraParents.get(child) ?? []) {
          const col = layerNodes.indexOf(extra);
          if (col >= 0 && !cg.parentCols.includes(col)) extraCols.add(col);
        }
      }
      let minCol = Math.min(...cg.parentCols);
      let maxCol = Math.max(...cg.parentCols);
      while (extraCols.has(minCol - 1)) minCol--;
      while (extraCols.has(maxCol + 1)) maxCol++;
      const movingCols = [
        ...cg.parentCols,
        ...[...extraCols].filter((col) => col >= minCol && col <= maxCol),
      ];

      const newPositions = [...pos[layer]!];
      for (const col of movingCols) {
        newPositions[col] = newPositions[col]! + shift;
      }

      // Push neighbours aside to maintain minimum gap of 1

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
  // Someone tied to no one on the rows above or below (a partner who is no
  // one's parent, and has no parents shown) is free to move: they sit right
  // beside their partner, or else their nearer neighbour, rather than where
  // centring the people around them left them, with an empty column between.
  for (let layer = 0; layer < maxLayer; layer++) {
    const layerN = n[layer]!;
    const row = nid[layer]!;
    const tiedAcrossRows = (node: number) =>
      graph.parents[node]!.some(
        (p) => nodeLocation.get(p.parentIndex)?.layer === layer - 1,
      ) ||
      getChildrenOf(node, graph).some(
        (c) => nodeLocation.get(c)?.layer === layer + 1,
      );
    const partners = (a: number, b: number | undefined) =>
      b !== undefined &&
      graph.partnerGroups.some(
        (pg) => pg.members.includes(a) && pg.members.includes(b),
      );
    for (let pass = 0; pass < layerN; pass++) {
      let moved = false;
      for (let col = 0; col < layerN; col++) {
        const node = row[col]!;
        if (tiedAcrossRows(node)) continue;
        const left = col > 0 ? pos[layer]![col - 1]! : -Infinity;
        const right = col + 1 < layerN ? pos[layer]![col + 1]! : Infinity;
        const at = pos[layer]![col]!;
        let target = at;
        if (partners(node, row[col + 1]) && right - at > 1) target = right - 1;
        else if (partners(node, row[col - 1]) && at - left > 1)
          target = left + 1;
        else if (at - left > 1 && right - at > 1)
          target = at - left <= right - at ? left + 1 : right - 1;
        if (!Number.isFinite(target)) continue;
        target = Math.max(left + 1, Math.min(right - 1, target));
        if (Math.abs(target - at) > 1e-9) {
          pos[layer]![col] = target;
          moved = true;
        }
      }
      if (!moved) break;
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
        // The partner group the child descends from (see buildPedigreeGraph)
        const parentSet = new Set(parentsAbove);
        const pg = graph.familyUnits.find(
          (fu) =>
            fu.children.includes(node) &&
            fu.parentGroup.members.length > 1 &&
            fu.parentGroup.members.every((m) => parentSet.has(m)),
        )?.parentGroup;
        // A family is its leftmost partner's column, and the connectors take
        // the person beside them as the other partner, so only a couple sitting
        // side by side can be named. A couple that could not be seated
        // together (one of three partnerships, say) gets no family: each
        // parent is then joined to the child directly, rather than the line of
        // descent coming from whichever partnership sits beside the left one.
        let famCol = 0;
        if (pg) {
          const cols = pg.members
            .map((m) => nodeLocation.get(m))
            .filter((loc) => loc?.layer === layer - 1)
            .map((loc) => loc!.col);
          const leftCol = Math.min(...cols);
          if (
            cols.length === pg.members.length &&
            Math.max(...cols) - leftCol === cols.length - 1
          ) {
            famCol = leftCol + 1; // 1-based
          }
        }
        layerFam.push(famCol);
      } else {
        // Single parent: the negated column, so the parent's own children
        // stay apart from any they have with a partner (keyed by the
        // couple's left column).
        const parentIdx = parentsAbove[0]!;
        const parentLoc = nodeLocation.get(parentIdx);
        if (parentLoc) {
          layerFam.push(-(parentLoc.col + 1)); // 1-based, negated
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

      layerGroup.push(areConsanguineous(nodeA, nodeB, ped.parents) ? 2 : 1);
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

      // Only twins seated side by side can be marked as twins.
      if (Math.abs(loc1.col - loc2.col) !== 1) continue;
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
