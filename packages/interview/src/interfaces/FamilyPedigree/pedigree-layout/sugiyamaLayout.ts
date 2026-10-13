import { kindepth } from './kindepth';
import {
  type ChildLines,
  isBirthTie,
  lineOwnersOf,
  ownerKey,
} from './lineOwners';
import type {
  ParentConnection,
  PedigreeInput,
  PedigreeLayout,
  PedigreeEdgeType,
} from './types';
import {
  areConsanguineous,
  inOrder,
  layerConstraints,
  relativeRaisers,
} from './utils';

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
  /** Who each child's lines come from (see `lineOwnersOf`). */
  owners: ChildLines[];
  /** The order the seating search has chosen for a sibship, by
   * `sibshipKey`, where it is not the default (see `sibshipOrders`). */
  sibshipChoice: Map<string, number[]>;
};

function isAuxiliaryEdge(edgeType: PedigreeEdgeType): boolean {
  return edgeType === 'donor' || edgeType === 'surrogate';
}

/** Whether a parent's tie to a child is a helper's: a birth tie drawn by a
 * line of the parent's own, not the line of descent. */
function isHelperOf(graph: PedigreeGraph, parent: number, child: number) {
  const tie = graph.parentEdgeTypes.get(`${parent}-${child}`);
  return (
    tie !== undefined &&
    isBirthTie(tie) &&
    !(graph.owners[child]?.descent?.parents.includes(parent) ?? false)
  );
}

/** A sibship's key, whatever order its members are in. */
const sibshipKey = (members: number[]) =>
  members.toSorted((a, b) => a - b).join(',');

function partnerGroupKey(members: number[]): string {
  return [...members].toSorted((a, b) => a - b).join(',');
}

/**
 * Each person's parents as the layout places them. A child adopted or raised
 * by a relative (see `relativeRaisers`) stays in their birth family: the
 * relatives who raise them, and anyone raising them alongside, are drawn
 * beside the birth family with a line of their own, as extra parents, rather
 * than as the parents the child descends from. Their links are left out here,
 * read by the kind each is drawn as: a relative who raises the child and
 * carried them holds a birth tie, and stays one of the parents placed.
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
  const owners = lineOwnersOf(ped.parents, ped.partners ?? []);
  const isPlaced = (child: number, parent: number) =>
    placed[child]!.some((p) => p.parentIndex === parent);
  const tiesOf = (child: number, parentIndexes: number[]) =>
    placed[child]!.filter((p) => parentIndexes.includes(p.parentIndex));
  const descentParentsOf = (child: number) =>
    owners[child]!.descent?.parents ?? [];

  // 1. Assign layers (1-based). A child's generation comes from the owners
  // of their line of descent, and from all of their parents only when they
  // have none. Everyone else who draws a line to the child is lined up with
  // the owners of the line of descent, whether or not their own parents are
  // shown, so a donor shared by two families brings both onto the donor's
  // row.
  const generationParents = placed.map((pConns, child) => {
    const descent = tiesOf(child, descentParentsOf(child));
    return descent.length > 0 ? descent : pConns;
  });
  const alignedParents = placed.map((pConns, child) =>
    generationParents[child] === pConns
      ? []
      : pConns.filter((p) => !descentParentsOf(child).includes(p.parentIndex)),
  );
  const depth = kindepth(generationParents, true, alignedParents);
  const layers = depth.map((d) => d + 1);

  // 3. Partner groups: every recorded partnership, and the two birth
  // parents with no partnership recorded who own a line together, who are
  // seated side by side as a pair (never drawn as partners: the connectors
  // draw a partnership line only for a recorded partnership).
  const groupMap = new Map<string, PartnerGroup>();
  for (const p of ped.partners ?? []) {
    const members = [p.partnerIndex1, p.partnerIndex2];
    const key = partnerGroupKey(members);
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        members: [...members].toSorted((a, b) => a - b),
        isActive: p.isActive,
      });
    }
  }
  for (let child = 0; child < n; child++) {
    const { descent, lines } = owners[child]!;
    for (const owner of [...(descent ? [descent] : []), ...lines]) {
      if (owner.parents.length !== 2) continue;
      if (!owner.parents.every((parent) => isPlaced(child, parent))) continue;
      const key = partnerGroupKey(owner.parents);
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          members: [...owner.parents].toSorted((a, b) => a - b),
          isActive: true,
        });
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
      constrain([[p.parentIndex, i]], 1);
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
    for (const other of alignedParents[i]!) {
      for (const owner of descentParentsOf(i)) {
        constrain(
          [
            [owner, other.parentIndex],
            [other.parentIndex, owner],
          ],
          0,
        );
      }
    }
  }
  settle(layers);

  // 4. Family units: one per sibship (see `lineOwnersOf`), with the group
  // of the owner of its line of descent (a couple, a pair, or one parent).
  // Two sibships whose lines of descent come from the same owner are two
  // units.
  const familyUnits: FamilyUnit[] = [];
  const unitBySibship = new Map<string, FamilyUnit>();
  for (let child = 0; child < n; child++) {
    const { descent, sibship } = owners[child]!;
    if (!descent || sibship === undefined) continue;
    if (!descent.parents.every((parent) => isPlaced(child, parent))) continue;
    let unit = unitBySibship.get(sibship);
    if (!unit) {
      const parentGroup =
        descent.parents.length === 2
          ? groupMap.get(partnerGroupKey(descent.parents))!
          : { members: [...descent.parents], isActive: true };
      unit = { parentGroup, children: [] };
      unitBySibship.set(sibship, unit);
      familyUnits.push(unit);
    }
    unit.children.push(child);
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
    owners,
    sibshipChoice: new Map(),
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
    recency(y) - recency(x) ||
    x - y;

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
      recency(y) - recency(x) ||
      x - y,
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

/** How many orders of one sibship the seating search weighs, at most. */
const SIBSHIP_ORDERS = 120;

/**
 * The orders a sibship's children may be seated in, the default first: the
 * children of each donor or surrogate side by side, so that their line
 * meets the line of descent of that run of children once. Where one donor
 * gave to some of another's children, the smaller run sits inside the
 * larger (Josh, 12 Oct 2026: siblings grouped by donor). By default the
 * groups, and the children outside any group, are in the order their first
 * children were recorded; children who share all their donors (none, say)
 * are together. Twins sit together, from where the first of them was
 * recorded, in the group of that twin.
 *
 * Two donors whose children overlap without one run holding the other
 * cannot both have one run: the larger (or first recorded) keeps its run
 * (Josh, 12 Oct 2026).
 */
function sibshipOrders(
  members: number[],
  graph: PedigreeGraph,
  limit = SIBSHIP_ORDERS,
): number[][] {
  const memberSet = new Set(members);
  const units: number[][] = [];
  const placed = new Set<number>();
  for (const sib of members.toSorted((a, b) => a - b)) {
    if (placed.has(sib)) continue;
    const set = [sib];
    for (let k = 0; k < set.length; k++) {
      for (const twin of graph.twinsOf.get(set[k]!) ?? []) {
        if (memberSet.has(twin) && !set.includes(twin)) set.push(twin);
      }
    }
    for (const member of set) placed.add(member);
    units.push(set.toSorted((a, b) => a - b));
  }
  const helpersOf = (unit: number[]) =>
    graph.parents[unit[0]!]!.filter((p) => isAuxiliaryEdge(p.edgeType)).map(
      (p) => `${p.parentIndex}:${p.edgeType}`,
    );
  const keyOf = (unit: number[]) => helpersOf(unit).toSorted().join(',');
  // Each helper's children, as places among the units; helpers with the
  // same children are one group.
  const byChildren = new Map<string, number[]>();
  for (const helper of new Set(units.flatMap(helpersOf))) {
    const theirs = units.flatMap((unit, k) =>
      helpersOf(unit).includes(helper) ? [k] : [],
    );
    byChildren.set(theirs.join(','), theirs);
  }
  // The groups kept as runs: each inside another or apart from it.
  const kept: Set<number>[] = [];
  for (const group of inOrder(
    byChildren.values(),
    (a, b) => b.length - a.length || a[0]! - b[0]!,
  )) {
    if (group.length < 2 || group.length === units.length) continue;
    const set = new Set(group);
    const nests = (other: Set<number>) => {
      const shared = group.filter((k) => other.has(k)).length;
      return shared === 0 || shared === set.size || shared === other.size;
    };
    if (kept.every(nests)) kept.push(set);
  }
  // The places in order: the largest groups among them (each in order, the
  // groups inside it seated within it), and the rest grouped by their
  // donors. By default every group and child is seated by their first
  // place (the order they were recorded); the other orders keep each group
  // together, its inner groups within it, in any order of the groups and
  // children at each level.
  // Every enumeration below is lazy: an order is built only when it is
  // taken, and no more than `SIBSHIP_ORDERS` are ever taken, so a large
  // sibship costs no more than a small one.
  const permutations = function* (item: number[]): Generator<number[]> {
    if (item.length < 2) {
      yield item;
      return;
    }
    for (let k = 0; k < item.length; k++) {
      const rest = [...item.slice(0, k), ...item.slice(k + 1)];
      for (const tail of permutations(rest)) yield [item[k]!, ...tail];
    }
  };
  // The orders of a list of items, each item in each of its own orders:
  // the first item's choice varies slowest.
  const product = function* (
    items: number[][],
    alternativesOf: (item: number[]) => number[][],
  ): Generator<number[]> {
    const [first, ...rest] = items;
    if (first === undefined) {
      yield [];
      return;
    }
    const heads = alternativesOf(first);
    for (const head of heads) {
      for (const tail of product(rest, alternativesOf)) {
        yield [...head, ...tail];
      }
    }
  };
  const orders = function* (places: number[]): Generator<number[]> {
    const inner = kept.filter(
      (group) =>
        group.size < places.length &&
        [...group].every((k) => places.includes(k)),
    );
    const outermost = inner.filter(
      (group) =>
        !inner.some(
          (other) =>
            other !== group &&
            other.size > group.size &&
            [...group].every((k) => other.has(k)),
        ),
    );
    const items: number[][] = outermost.map((group) =>
      places.filter((k) => group.has(k)),
    );
    const loose = new Map<string, number[]>();
    for (const k of places) {
      if (outermost.some((group) => group.has(k))) continue;
      const key = keyOf(units[k]!);
      loose.set(key, [...(loose.get(key) ?? []), k]);
    }
    items.push(...loose.values());
    const sorted = inOrder(items, (a, b) => a[0]! - b[0]!);
    // Each item's own orders, taken once and at most as many as are used.
    const alternatives = new Map<number[], number[][]>();
    const alternativesOf = (item: number[]) => {
      let found = alternatives.get(item);
      if (!found) {
        found = take(
          outermost.some(
            (group) => group.size === item.length && group.has(item[0]!),
          )
            ? orders(item)
            : permutations(item),
          SIBSHIP_ORDERS,
        );
        alternatives.set(item, found);
      }
      return found;
    };
    for (const itemOrder of permutations(sorted.map((_, k) => k))) {
      yield* product(
        itemOrder.map((k) => sorted[k]!),
        alternativesOf,
      );
    }
  };
  return take(orders(units.map((_, k) => k)), limit).map((order) =>
    order.flatMap((k) => units[k]!),
  );
}

/** The first `count` values a generator yields, built no further. */
function take<T>(values: Iterable<T>, count: number): T[] {
  const taken: T[] = [];
  if (count <= 0) return taken;
  for (const value of values) {
    taken.push(value);
    if (taken.length >= count) break;
  }
  return taken;
}

/** A sibship's default order (see `sibshipOrders`). */
function sibshipOrder(members: number[], graph: PedigreeGraph): number[] {
  return sibshipOrders(members, graph, 1)[0]!;
}

function buildConstraintBlocks(
  nodesOnLayer: number[],
  graph: PedigreeGraph,
  attach = true,
  canonical = false,
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
    const siblings =
      (!canonical && graph.sibshipChoice.get(sibshipKey(members))) ||
      sibshipOrder(members, graph);
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

  // 2b. Each child's extra parents on this row sit beside the owners of the
  //     child's line of descent (constraint 10). A helper (a parent whose
  //     birth tie is drawn by a line of their own) brings their block along;
  //     anyone else with no block of their own is seated there too. They go
  //     on the right of the owners' chain of partnerships, the helper
  //     nearest; the seating search (`refineSeating`) then moves each to
  //     whichever side and place beside the owners costs the drawing least.
  if (attach) {
    const partnered = (a: number, b: number) =>
      (spousesOf.get(a) ?? []).includes(b);
    for (const [child, extras] of graph.extraParents) {
      const unit = graph.familyOf.get(child)!;
      const owners = unit.parentGroup.members.filter((m) => nodeSet.has(m));
      if (owners.length === 0) continue;
      for (const extra of extras) {
        if (!nodeSet.has(extra)) continue;
        const free =
          !assigned.has(extra) &&
          !inRealSibship.has(extra) &&
          !spousesOf.has(extra);
        if (!free && !isHelperOf(graph, extra, child)) continue;
        let target = blocks.find((block) =>
          block.nodes.some((node) => owners.includes(node)),
        );
        if (!target) {
          target = { nodes: [...owners], barycenter: 0 };
          for (const node of owners) assigned.add(node);
          blocks.push(target);
        }
        const own = blocks.find((block) => block.nodes.includes(extra));
        if (own === target) continue;
        const nodes = target.nodes;
        let end = Math.max(...owners.map((owner) => nodes.indexOf(owner)));
        while (
          end + 1 < nodes.length &&
          partnered(nodes[end]!, nodes[end + 1]!)
        ) {
          end++;
        }
        const moving = !own
          ? [extra]
          : own.nodes.indexOf(extra) > (own.nodes.length - 1) / 2
            ? own.nodes.toReversed()
            : own.nodes;
        nodes.splice(end + 1, 0, ...moving);
        if (own) blocks.splice(blocks.indexOf(own), 1);
        for (const node of moving) assigned.add(node);
      }
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
 * What a seating costs the drawing, compared step by step: a later step
 * only breaks ties left by the ones before it (see `lessCost`).
 *
 * 0. Hard constraints broken: two lines of descent that cross (no hop can
 *    draw that), and a helper who does not sit beside the owners of their
 *    child's line of descent (constraint 10).
 * 1. Crossings. Every crossing counts the same: a line across a line of
 *    descent, a sibling bar or another owner's line.
 * 2. Passing people: the people a line from an owner passes on its way to
 *    the line of descent of its children.
 * 3. Length: how far each line's owner sits from that line of descent.
 * 4. Recorded order: how far each block is turned from the order the
 *    records seat it in.
 *
 * Each pair of rows is read as the drawing will draw it: each family's line
 * of descent comes down from its owners to the middle of its children, who
 * hang from a bar; a line that joins a line of descent ends on its bar
 * (for all the children) or above the run of children it is drawn for, and
 * any other line ends on each child, crossing their sibling bar unless the
 * child is at its end.
 */
type SeatingCost = [
  hard: number,
  crossings: number,
  passing: number,
  length: number,
  order: number,
];

/** Whether one cost, compared step by step, is less than another. */
function lessCost(x: readonly number[], y: readonly number[]): boolean {
  for (let i = 0; i < x.length; i++) {
    if (Math.abs(x[i]! - y[i]!) > 1e-9) return x[i]! < y[i]!;
  }
  return false;
}

/** What one pair of rows costs a seating (see `seatingCost`): its counts
 * of hard constraints broken, crossings and people passed, and each line's
 * length in the order the lines are read. */
type RowPairCost = { counts: [number, number, number]; spans: number[] };

/** What the seating search has already weighed, per graph: each pair of
 * rows, and each row's turns from its recorded order. A move reseats one
 * row or a few, so most of a seating's cost is read from here. */
const weighedRows = new WeakMap<
  PedigreeGraph,
  { pairs: Map<string, RowPairCost>; turns: Map<string, number> }
>();

function weighedRowsOf(graph: PedigreeGraph) {
  let weighed = weighedRows.get(graph);
  if (!weighed) {
    weighed = { pairs: new Map(), turns: new Map() };
    weighedRows.set(graph, weighed);
  }
  return weighed;
}

function rowPairCost(
  upper: number[],
  lower: number[],
  graph: PedigreeGraph,
): RowPairCost {
  const pos = positionMap([upper, lower]);
  const onRow = new Map<number, number>();
  for (const node of upper) onRow.set(node, 0);
  for (const node of lower) onRow.set(node, 1);
  const cost: [number, number, number] = [0, 0, 0];
  const spans: number[] = [];
  const onUpper = (node: number) => onRow.get(node) === 0;
  const onLower = (node: number) => onRow.get(node) === 1;
  type Edge = { from: number; to: number; drop: boolean; owner: string };
  const edges: Edge[] = [];
  const bars: [number, number][] = [];
  const descentPoint = new Map<FamilyUnit, number>();
  for (const unit of graph.familyUnits) {
    const owners = unit.parentGroup.members.filter(onUpper);
    const children = unit.children.filter(onLower).map((c) => pos.get(c)!);
    if (owners.length === 0 || children.length === 0) continue;
    const d =
      owners.reduce((sum, owner) => sum + pos.get(owner)!, 0) / owners.length;
    descentPoint.set(unit, d);
    const middle = children.reduce((sum, c) => sum + c, 0) / children.length;
    edges.push({ from: d, to: middle, drop: true, owner: `${d}` });
    if (children.length > 1) {
      bars.push([Math.min(...children), Math.max(...children)]);
    }
  }

  // The lines from owners on the upper row to children on the lower.
  type Line = {
    parents: number[];
    kind: PedigreeEdgeType;
    joins: boolean;
    unit?: FamilyUnit;
    children: number[];
  };
  const lines = new Map<string, Line>();
  for (const child of lower) {
    const unit = graph.familyOf.get(child);
    const drawn = unit !== undefined && descentPoint.has(unit);
    const descent = graph.owners[child]?.descent;
    for (const owner of graph.owners[child]?.lines ?? []) {
      if (!owner.parents.every(onUpper)) continue;
      const joins =
        drawn && isBirthTie(owner.kind) && isBirthTie(descent!.kind);
      const key = `${ownerKey(owner)}:${owner.kind}:${joins}`;
      const line = lines.get(key) ?? {
        parents: owner.parents,
        kind: owner.kind,
        joins,
        ...(drawn ? { unit } : {}),
        children: [],
      };
      line.children.push(child);
      lines.set(key, line);
    }
  }
  for (const [key, line] of lines) {
    const o =
      line.parents.reduce((sum, parent) => sum + pos.get(parent)!, 0) /
      line.parents.length;
    const d = line.unit ? descentPoint.get(line.unit) : undefined;
    const at = line.children.map((c) => pos.get(c)!).toSorted((a, b) => a - b);
    if (line.joins && line.unit && d !== undefined) {
      const siblings = line.unit.children
        .filter(onLower)
        .map((c) => pos.get(c)!)
        .toSorted((a, b) => a - b);
      if (at.length === siblings.length && siblings.length > 1) {
        edges.push({
          from: o,
          to: o < d ? siblings[0]! : siblings.at(-1)!,
          drop: false,
          owner: key,
        });
      } else {
        // One line to each run of the children side by side.
        let run: number[] = [];
        const close = () => {
          if (run.length === 0) return;
          edges.push({
            from: o,
            to: run.reduce((sum, c) => sum + c, 0) / run.length,
            drop: false,
            owner: key,
          });
          run = [];
        };
        for (const c of siblings) {
          if (at.includes(c)) run.push(c);
          else close();
        }
        close();
      }
    } else {
      for (const c of at) {
        edges.push({ from: o, to: c, drop: false, owner: key });
        cost[1] += bars.filter(([a, b]) => c > a + 1e-9 && c < b - 1e-9).length;
      }
    }
    if (d !== undefined) {
      const [lo, hi] = [Math.min(o, d), Math.max(o, d)];
      cost[2] += upper.filter(
        (node) =>
          !line.parents.includes(node) &&
          pos.get(node)! > lo + 1e-9 &&
          pos.get(node)! < hi - 1e-9,
      ).length;
      spans.push(hi - lo);
    }
  }

  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const [a, b] = [edges[i]!, edges[j]!];
      if (a.owner === b.owner) continue;
      if ((a.from - b.from) * (a.to - b.to) < -1e-9) {
        if (a.drop && b.drop) cost[0]++;
        else cost[1]++;
      }
    }
  }

  // Each helper beside the owners of their child's line of descent, or
  // beside another helper of the same family (Josh, 12 Oct 2026): between
  // them sit only parents of the family's children, and their partners.
  for (const child of lower) {
    const unit = graph.familyOf.get(child);
    if (!unit || !descentPoint.has(unit)) continue;
    const owners = unit.parentGroup.members.filter(onUpper);
    const parentsOfChild = new Set(
      unit.children.flatMap((sibling) =>
        graph.parents[sibling]!.map((p) => p.parentIndex),
      ),
    );
    for (const partner of upper) {
      if (!parentsOfChild.has(partner)) continue;
      for (const other of graph.partnerGroups) {
        if (other.members.includes(partner)) {
          for (const m of other.members) parentsOfChild.add(m);
        }
      }
    }
    for (const p of graph.parents[child]!) {
      if (!onUpper(p.parentIndex) || !isHelperOf(graph, p.parentIndex, child)) {
        continue;
      }
      const at = pos.get(p.parentIndex)!;
      const nearest = inOrder(
        owners.map((owner) => pos.get(owner)!),
        (a, b) => Math.abs(a - at) - Math.abs(b - at),
      )[0]!;
      const between = upper.filter(
        (node) =>
          pos.get(node)! > Math.min(at, nearest) &&
          pos.get(node)! < Math.max(at, nearest),
      );
      if (between.some((node) => !parentsOfChild.has(node))) cost[0]++;
    }
  }
  return { counts: cost, spans };
}

function seatingCost(
  layerOrdering: number[][],
  graph: PedigreeGraph,
): SeatingCost {
  const weighed = weighedRowsOf(graph);
  const cost: SeatingCost = [0, 0, 0, 0, 0];

  for (let k = 0; k + 1 < layerOrdering.length; k++) {
    const [upper, lower] = [layerOrdering[k]!, layerOrdering[k + 1]!];
    const key = `${upper.join(',')}|${lower.join(',')}`;
    let pair = weighed.pairs.get(key);
    if (!pair) {
      pair = rowPairCost(upper, lower, graph);
      weighed.pairs.set(key, pair);
    }
    cost[0] += pair.counts[0];
    cost[1] += pair.counts[1];
    cost[2] += pair.counts[2];
    for (const span of pair.spans) cost[3] += span;
  }

  // How far each block is turned from its recorded order.
  for (const row of layerOrdering) {
    const key = row.join(',');
    let turns = weighed.turns.get(key);
    if (turns === undefined) {
      turns = 0;
      const at = new Map(row.map((node, i) => [node, i]));
      for (const block of buildConstraintBlocks(row, graph, false, true)) {
        const seated = block.nodes.toSorted((a, b) => at.get(a)! - at.get(b)!);
        for (let i = 0; i < seated.length; i++) {
          for (let j = i + 1; j < seated.length; j++) {
            if (
              block.nodes.indexOf(seated[i]!) > block.nodes.indexOf(seated[j]!)
            ) {
              turns++;
            }
          }
        }
      }
      weighed.turns.set(key, turns);
    }
    cost[4] += turns;
  }
  return cost;
}

/** How many lines a seating crosses (see `seatingCost`). */
function countCrossings(
  layerOrdering: number[][],
  graph: PedigreeGraph,
): number {
  const [hard, crossings] = seatingCost(layerOrdering, graph);
  return hard + crossings;
}

function barycentricSweep(
  layerOrdering: number[][],
  graph: PedigreeGraph,
  direction: 'down' | 'up',
  /** The first row a sweep down reseats. */
  from = 1,
): number[][] {
  const result = layerOrdering.map((layer) => [...layer]);

  if (direction === 'down') {
    for (let k = from; k < result.length; k++) {
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

      result[k] = inOrder(
        blocks,
        (a, b) => a.barycenter - b.barycenter,
      ).flatMap((b) => b.nodes);
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

      result[k] = inOrder(
        blocks,
        (a, b) => a.barycenter - b.barycenter,
      ).flatMap((b) => b.nodes);
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
 * How much the seating search may do: seatings weighed, each counted as
 * many times as there are people to seat (about what weighing it takes).
 */
const SEATING_SEARCH_WORK = 60_000;

/**
 * The seating search. From the seating the sweeps settle on, it tries every
 * move that keeps the hard constraints of seating (partners and pairs side
 * by side, sibships together, blocks whole) and keeps any that costs the
 * drawing less (see `seatingCost`), until none does or its work is spent
 * (`SEATING_SEARCH_WORK`):
 * - turning a block, or a chain of partners within one, round;
 * - moving a child's extra parent, with their own block, to any other place
 *   in the row (to either side of the owners of the child's line of
 *   descent);
 * - seating a sibship in any other order its donors' runs allow.
 */
function refineSeating(
  ordering: number[][],
  graph: PedigreeGraph,
  iterationCap: number,
  /** Every seating the search weighs is offered here, with its cost. */
  weigh: (seating: number[][], cost: SeatingCost) => void = () => undefined,
): number[][] {
  let current = ordering.map((layer) => [...layer]);
  let currentCost = seatingCost(current, graph);
  weigh(current, currentCost);
  // The search's work: each seating weighed, and each order of a sibship
  // laid out, counts as many as there are people to seat. It stops once
  // `SEATING_SEARCH_WORK` is spent.
  let spent = 0;
  const spend = () => {
    spent += graph.nodeCount;
  };
  const workLeft = () => spent < SEATING_SEARCH_WORK;
  const partnered = (a: number | undefined, b: number | undefined) =>
    a !== undefined &&
    b !== undefined &&
    graph.partnerGroups.some(
      (group) => group.members.includes(a) && group.members.includes(b),
    );
  // A block's runs of partners side by side within it.
  const chainsWithin = (
    row: number[],
    [start, end]: [number, number],
  ): [number, number][] => {
    const chains: [number, number][] = [];
    let from = start;
    for (let k = start + 1; k <= end; k++) {
      if (k < end && partnered(row[k - 1], row[k])) continue;
      if (k - from >= 2 && (from > start || k < end)) chains.push([from, k]);
      from = k;
    }
    return chains;
  };
  const withRow = (layer: number, row: number[]) =>
    current.map((other, k) => (k === layer ? row : [...other]));

  // The moves on one row, as the rows they would make.
  function* movesOn(
    layer: number,
  ): Generator<{ row: number[]; choice?: [string, number[]] }> {
    const row = current[layer]!;
    if (row.length < 2) return;
    // Turning a block, or a chain within one, round.
    const blockRuns = currentBlockRuns(row, graph);
    for (const [start, end] of [
      ...blockRuns,
      ...blockRuns.flatMap((run) => chainsWithin(row, run)),
    ]) {
      if (end - start < 2) continue;
      yield {
        row: [
          ...row.slice(0, start),
          ...row.slice(start, end).toReversed(),
          ...row.slice(end),
        ],
      };
    }
    // Moving an extra parent's block to another place in the row.
    const base = buildConstraintBlocks(row, graph, false);
    const blockOf = new Map<number, number[]>();
    for (const block of base) {
      for (const node of block.nodes) blockOf.set(node, block.nodes);
    }
    const sibships = graph.siblingGroups
      .map((group) => group.members.filter((m) => row.includes(m)))
      .filter((members) => members.length > 1);
    const extras = new Set<number>();
    for (const [child, parents] of graph.extraParents) {
      const unit = graph.familyOf.get(child)!;
      for (const extra of parents) {
        if (!row.includes(extra)) continue;
        if (
          unit.parentGroup.members.some((m) => blockOf.get(extra)!.includes(m))
        ) {
          continue;
        }
        extras.add(extra);
      }
    }
    for (const extra of extras) {
      const unitNodes = blockOf.get(extra)!;
      const at = unitNodes
        .map((node) => row.indexOf(node))
        .toSorted((a, b) => a - b);
      if (at.at(-1)! - at[0]! !== at.length - 1) continue;
      const moving = row.slice(at[0]!, at.at(-1)! + 1);
      const rest = row.filter((node) => !unitNodes.includes(node));
      for (let gap = 0; gap <= rest.length; gap++) {
        if (gap === at[0]) continue;
        const [left, right] = [rest[gap - 1], rest[gap]];
        if (partnered(left, right)) continue;
        if (
          left !== undefined &&
          right !== undefined &&
          blockOf.get(left) === blockOf.get(right) &&
          sibships.some(
            (members) => members.includes(left) && members.includes(right),
          )
        ) {
          continue;
        }
        if (
          sibships.some((members) => {
            const places = members.map((m) => rest.indexOf(m));
            return Math.min(...places) < gap && Math.max(...places) >= gap;
          })
        ) {
          continue;
        }
        for (const turned of [moving, moving.toReversed()]) {
          yield {
            row: [...rest.slice(0, gap), ...turned, ...rest.slice(gap)],
          };
        }
      }
    }
    // Seating a sibship in another order: its block as the records would
    // seat it in that order, either way round.
    for (const members of sibships) {
      const orders = sibshipOrders(members, graph);
      if (orders.length < 2) continue;
      const key = sibshipKey(members);
      const chosen = graph.sibshipChoice.get(key);
      for (const order of orders) {
        if (!workLeft()) return;
        spend();
        graph.sibshipChoice.set(key, order);
        const block = buildConstraintBlocks(row, graph, false).find((b) =>
          b.nodes.includes(members[0]!),
        )!.nodes;
        if (chosen) graph.sibshipChoice.set(key, chosen);
        else graph.sibshipChoice.delete(key);
        const places = block.map((node) => row.indexOf(node));
        const [from, to] = [Math.min(...places), Math.max(...places)];
        if (to - from !== block.length - 1) continue;
        for (const turned of [block, block.toReversed()]) {
          yield {
            row: [...row.slice(0, from), ...turned, ...row.slice(to + 1)],
            choice: [key, order],
          };
        }
      }
    }
  }

  for (let iter = 0; iter < iterationCap && workLeft(); iter++) {
    let improved = false;
    for (let layer = 0; layer < current.length && !improved; layer++) {
      for (const { row, choice } of movesOn(layer)) {
        if (!workLeft()) break;
        const moved = withRow(layer, row);
        const previous = choice
          ? graph.sibshipChoice.get(choice[0])
          : undefined;
        if (choice) graph.sibshipChoice.set(choice[0], choice[1]);
        // Each move is weighed as it is, and with the rows below it
        // reseated under it by a sweep down.
        const followed = barycentricSweep(moved, graph, 'down', layer + 1);
        for (const candidate of [moved, followed]) {
          spend();
          const cost = seatingCost(candidate, graph);
          weigh(candidate, cost);
          if (lessCost(cost, currentCost)) {
            current = candidate;
            currentCost = cost;
            improved = true;
            break;
          }
        }
        if (improved) break;
        if (choice) {
          if (previous) graph.sibshipChoice.set(choice[0], previous);
          else graph.sibshipChoice.delete(choice[0]);
        }
      }
    }
    if (!improved) break;
  }
  return current;
}

/**
 * The seatings the search found, cheapest first by `seatingCost`, at most
 * `count` of them: the one it settled on first, then the cheapest others it
 * weighed on the way. Which is drawn is decided by what each costs once its
 * lines are routed (see `alignPedigree`).
 */
function seatingsOf(graph: PedigreeGraph, count: number): number[][][] {
  const maxLayer = Math.max(...graph.layers);

  // Step 1: Initial ordering
  const ordering: number[][] = [];
  for (let layer = 0; layer <= maxLayer; layer++) {
    const nodesOnLayer = getNodesAtLayer(graph, layer);
    const blocks = buildConstraintBlocks(nodesOnLayer, graph);
    ordering.push(blocks.flatMap((b) => b.nodes));
  }

  let bestOrdering = ordering.map((layer) => [...layer]);
  let bestCost = seatingCost(bestOrdering, graph);

  let noImprovementCount = 0;
  for (let iter = 0; iter < 24; iter++) {
    let improved = false;
    for (const direction of ['down', 'up'] as const) {
      const swept = barycentricSweep(bestOrdering, graph, direction);
      const cost = seatingCost(swept, graph);
      if (lessCost(cost, bestCost)) {
        bestCost = cost;
        bestOrdering = swept;
        improved = true;
      }
    }
    noImprovementCount = improved ? 0 : noImprovementCount + 2;
    if (noImprovementCount >= 3) break;
  }

  // The sweeps only reorder whole blocks; the search then turns blocks
  // round, moves extra parents and reorders sibships, keeping the cheapest
  // seatings it weighs.
  const kept: { seating: number[][]; cost: SeatingCost; key: string }[] = [];
  const keep = (seating: number[][], cost: SeatingCost) => {
    if (count < 2) return;
    const key = seating.map((row) => row.join(',')).join('|');
    if (kept.some((other) => other.key === key)) return;
    const at = kept.findIndex((other) => lessCost(cost, other.cost));
    kept.splice(at < 0 ? kept.length : at, 0, { seating, cost, key });
    kept.length = Math.min(kept.length, count);
  };
  const settled = refineSeating(bestOrdering, graph, 200, keep);
  const settledKey = settled.map((row) => row.join(',')).join('|');
  return [
    settled,
    ...kept
      .filter((other) => other.key !== settledKey)
      .map((other) => other.seating),
  ].slice(0, count);
}

/** The seating the search settles on (see `seatingsOf`). */
function minimizeCrossings(graph: PedigreeGraph): number[][] {
  return seatingsOf(graph, 1)[0]!;
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

      const descentParents = graph.owners[node]?.descent?.parents ?? [];
      const parentsAbove = descentParents.filter((p) => {
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

      // Find other family units of two or more parents sharing any parent
      // on this layer, whichever was recorded first: a unit of one parent
      // neither starts a group nor joins one.
      for (let fj = fi + 1; fj < graph.familyUnits.length; fj++) {
        if (processed.has(fj)) continue;
        const otherFu = graph.familyUnits[fj]!;
        if (otherFu.parentGroup.members.length < 2) continue;
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
    for (const cg of inOrder(
      centeringGroups,
      (a, b) => Math.min(...a.parentCols) - Math.min(...b.parentCols),
    )) {
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
      const descentParents = graph.owners[node]?.descent?.parents ?? [];

      if (descentParents.length === 0 || layer === 0) {
        layerFam.push(0);
        continue;
      }

      // Check if parents are on the layer directly above
      const parentsAbove = descentParents.filter((p) => {
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
    // A family names one sibship: where two sibships would take the same
    // family (two from one carrier, say), the first seated keeps it, and the
    // other is left to the connectors, which draw it as a sibship of its own
    // (see `routePedigree`).
    const claimedBy = new Map<number, FamilyUnit | undefined>();
    for (let col = 0; col < layerFam.length; col++) {
      const value = layerFam[col]!;
      if (value === 0) continue;
      const unit = graph.familyOf.get(nid[layer]![col]!);
      if (!claimedBy.has(value)) claimedBy.set(value, unit);
      else if (claimedBy.get(value) !== unit) layerFam[col] = 0;
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

/**
 * A family laid out, at most `count` ways: the seatings the search found,
 * cheapest first by `seatingCost`, each with that cost.
 */
function sugiyamaLayouts(
  ped: PedigreeInput,
  count: number,
): { layout: PedigreeLayout; cost: SeatingCost }[] {
  const graph = buildPedigreeGraph(ped);
  return seatingsOf(graph, count).map((ordering) => ({
    layout: encodePedigreeLayout(graph, ordering, ped),
    cost: seatingCost(ordering, graph),
  }));
}

function sugiyamaLayout(ped: PedigreeInput): PedigreeLayout {
  return sugiyamaLayouts(ped, 1)[0]!.layout;
}

export {
  buildPedigreeGraph,
  countCrossings,
  lessCost,
  minimizeCrossings,
  sugiyamaLayout,
  sugiyamaLayouts,
};
