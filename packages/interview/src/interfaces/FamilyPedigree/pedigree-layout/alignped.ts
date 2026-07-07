import { buildPedigreeGraph } from './sugiyamaLayout';
import type { PedigreeInput } from './types';

// A faithful, sex-free port of kinship2's `align.pedigree` recursion
// (`alignped1`/`alignped2`/`alignped3` + the founder driver). It produces a
// per-generation left-to-right ORDERING of person indices — the piece the
// barycentric layout could not get right for married-in families — which the
// existing `encodePedigreeLayout` then turns into coordinates.
//
// A subtree is built with its left margin at column 0. During the recursion a
// person is stored as `id + 0.5` when they are the LEFT member of an adjacent
// marriage pair (kinship2's `.5` hash); `Math.floor` recovers the person.
// `fam[level][col] = k (>0)` means this person's parents are the pair at columns
// `k-1` and `k` on `level-1` (1-based, 0 = no link). A person may appear on more
// than one column (a bridge between two founder branches); the merge collapses
// the copies when they meet at a seam, otherwise both survive as a duplicate.

type Subtree = {
  nid: number[][]; // per level: ids (may carry +0.5), left-justified
  fam: number[][]; // per level: parent-pair column pointer (1-based, 0 = none)
};

function personOf(taggedId: number): number {
  return Math.floor(taggedId);
}

function emptySubtree(nlevel: number): Subtree {
  return {
    nid: Array.from({ length: nlevel }, () => []),
    fam: Array.from({ length: nlevel }, () => []),
  };
}

export function recursiveOrdering(ped: PedigreeInput): number[][] {
  const graph = buildPedigreeGraph(ped);
  const nlevel = Math.max(...graph.layers) + 1;

  // childrenOf / parentsOf from the graph's parent lists.
  const childMap = new Map<number, number[]>();
  for (let i = 0; i < graph.nodeCount; i++) childMap.set(i, []);
  for (let i = 0; i < graph.nodeCount; i++) {
    for (const p of graph.parents[i]!) {
      childMap.get(p.parentIndex)!.push(i);
    }
  }
  const childrenOf = (x: number) => childMap.get(x) ?? [];
  const parentsOf = (x: number) => graph.parents[x]!.map((p) => p.parentIndex);

  // Spouse worklist: every couple, keyed so each is consumed once. `spousesOf`
  // maps a person to their partners; `remaining` holds couples not yet plotted.
  const coupleKey = (a: number, b: number) =>
    `${Math.min(a, b)},${Math.max(a, b)}`;
  const remaining = new Set<string>();
  const spousesOf = new Map<number, number[]>();
  for (const pg of graph.partnerGroups) {
    for (let i = 0; i < pg.members.length; i++) {
      for (let j = i + 1; j < pg.members.length; j++) {
        const a = pg.members[i]!;
        const b = pg.members[j]!;
        remaining.add(coupleKey(a, b));
        spousesOf.set(a, [...(spousesOf.get(a) ?? []), b]);
        spousesOf.set(b, [...(spousesOf.get(b) ?? []), a]);
      }
    }
  }

  const childrenOfCouple = (x: number, s: number): number[] => {
    const sChildren = new Set(childrenOf(s));
    return childrenOf(x).filter((c) => {
      if (!sChildren.has(c)) return false;
      const ps = parentsOf(c);
      return ps.includes(x) && ps.includes(s);
    });
  };

  // Which side each spouse sits: for a bridge person (a spouse who is also a
  // child in the tree, i.e. has parents) place them on the side toward their own
  // family so the couple ends up at the seam and collapses on merge. With no
  // family they simply attach adjacent. Default: spouse to the right of x.
  const orderCoupleRow = (x: number, spouses: number[]): number[] => {
    const left: number[] = [];
    const right: number[] = [];
    for (const s of spouses) {
      // A spouse with parents descends elsewhere; bias them left so x's own
      // descent stays on the right, matching the merge seam. Otherwise right.
      if (parentsOf(s).length > 0 && spouses.length === 1) left.push(s);
      else right.push(s);
    }
    return [...left, x, ...right];
  };

  function alignped1(x: number): Subtree {
    const lev = graph.layers[x]!;
    const spouses = (spousesOf.get(x) ?? []).filter((s) =>
      remaining.has(coupleKey(x, s)),
    );
    for (const s of spouses) remaining.delete(coupleKey(x, s));

    const st = emptySubtree(nlevel);
    const row = orderCoupleRow(x, spouses);
    // Tag every left member of an adjacent pair with +0.5.
    const tagged = row.map((id, i) => (i < row.length - 1 ? id + 0.5 : id));
    st.nid[lev] = tagged;
    st.fam[lev] = row.map(() => 0);

    // Recurse into each marriage's children.
    let kids: Subtree | null = null;
    const xCol = row.indexOf(x);
    for (const s of spouses) {
      const children = childrenOfCouple(x, s).toSorted((a, b) => a - b);
      if (children.length === 0) continue;
      const sub = alignped2(children);
      // Parent-pair column: the left of the (x,s) pair on this row (1-based).
      const sCol = row.indexOf(s);
      const leftCol = Math.min(xCol, sCol);
      const childLev = lev + 1;
      sub.fam[childLev] = sub.nid[childLev]!.map((id) =>
        children.includes(personOf(id)) ? leftCol + 1 : 0,
      );
      kids = kids === null ? sub : alignped3(kids, sub);
    }

    if (kids === null) return st;
    // Splice this parent row on top of the children subtree.
    kids.nid[lev] = st.nid[lev]!;
    kids.fam[lev] = st.fam[lev]!;
    return kids;
  }

  function alignped2(sibs: number[]): Subtree {
    let rval = alignped1(sibs[0]!);
    for (let i = 1; i < sibs.length; i++) {
      const s = sibs[i]!;
      const rval2 = alignped1(s);
      const lev = graph.layers[s]!;
      const already = rval.nid[lev]!.some((id) => personOf(id) === s);
      // Skip the lone re-appearance when two sibs marry each other.
      if (rval2.nid[lev]!.length > 1 || !already) {
        rval = alignped3(rval, rval2);
      }
    }
    return rval;
  }

  function alignped3(x1: Subtree, x2: Subtree): Subtree {
    const out = emptySubtree(nlevel);
    for (let lev = 0; lev < nlevel; lev++) {
      const a = x1.nid[lev]!;
      const af = x1.fam[lev]!;
      const b = x2.nid[lev]!;
      const bf = x2.fam[lev]!;
      const n1 = a.length;

      out.nid[lev] = [...a];
      out.fam[lev] = [...af];

      if (b.length === 0) continue;

      let overlap = 0;
      if (n1 > 0 && personOf(a[n1 - 1]!) === personOf(b[0]!)) {
        overlap = 1;
        // Keep the parent-linked copy's fam pointer and the .5 marriage tag.
        out.fam[lev]![n1 - 1] = Math.max(af[n1 - 1]!, bf[0]!);
        out.nid[lev]![n1 - 1] = Math.max(a[n1 - 1]!, b[0]!);
      }

      for (let k = overlap; k < b.length; k++) {
        out.nid[lev]!.push(b[k]!);
        out.fam[lev]!.push(bf[k]!);
      }

      // Re-base the child rows' parent-pair pointers shifted in from x2.
      if (lev + 1 < nlevel) {
        const shift = n1 - overlap;
        x2.fam[lev + 1] = x2.fam[lev + 1]!.map((f) => (f > 0 ? f + shift : 0));
      }
    }
    return out;
  }

  // Driver: seed from founder couples / lone founders, sorted by index, merged.
  const isFounder = (i: number) => graph.parents[i]!.length === 0;
  // Seeds = one member of each founder COUPLE (both partners parentless), plus
  // any lone founder with no on-tree spouse. A founder who married a non-founder
  // (a married-in founder) is NOT seeded: they are pulled in as a spouse when
  // their partner is reached. This mirrors kinship2's founder driver.
  const seeds: number[] = [];
  const seededCouples = new Set<string>();
  for (const pg of graph.partnerGroups) {
    if (!pg.members.every(isFounder)) continue;
    const key = pg.members.join(',');
    if (seededCouples.has(key)) continue;
    seededCouples.add(key);
    seeds.push(Math.min(...pg.members));
  }
  for (let i = 0; i < graph.nodeCount; i++) {
    if (isFounder(i) && (spousesOf.get(i)?.length ?? 0) === 0) seeds.push(i);
  }
  seeds.sort((a, b) => a - b);

  let result: Subtree | null = null;
  for (const seed of seeds) {
    // Skip a seed already placed (as a spouse or via a merged branch).
    if (
      result &&
      result.nid.some((rowIds) => rowIds.some((id) => personOf(id) === seed))
    ) {
      continue;
    }
    const sub = alignped1(seed);
    result = result === null ? sub : alignped3(result, sub);
  }

  const finalTree = result ?? emptySubtree(nlevel);

  // Extract the per-level integer ordering, keeping each person's first
  // appearance (the encoder positions each person once).
  const ordering: number[][] = [];
  for (let lev = 0; lev < nlevel; lev++) {
    const seen = new Set<number>();
    const row: number[] = [];
    for (const tagged of finalTree.nid[lev]!) {
      const person = personOf(tagged);
      if (seen.has(person)) continue;
      seen.add(person);
      row.push(person);
    }
    ordering.push(row);
  }
  return ordering;
}
