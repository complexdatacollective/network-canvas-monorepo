// Seeded networks for exploring the automatic layout in Storybook. Each
// scenario, seed and people count produces the same people and ties as the
// layout comparison page linked from PR #2451, so a network can be compared in
// both. As on that page, the people count sizes the no-ties, sparse and random
// scenarios; the others have a fixed size.

export const LAYOUT_SCENARIOS = [
  'ego',
  'isolates',
  'sparse',
  'clique',
  'tree',
  'pieces',
  'big',
  'random',
] as const;

export type LayoutScenario = (typeof LAYOUT_SCENARIOS)[number];

export const LAYOUT_SCENARIO_LABELS: Record<LayoutScenario, string> = {
  ego: 'Typical ego network (20)',
  isolates: 'No ties yet',
  sparse: 'Sparse: a tie for every four people',
  clique: 'Dense group plus loners (17)',
  tree: 'Chain of acquaintances (19)',
  pieces: 'Separate tied groups plus loners (21)',
  big: 'Large: 4 groups plus 8 loners (38)',
  random: 'Random people and ties',
};

type ScenarioNetwork = {
  nodeCount: number;
  edges: [number, number][];
};

const mulberry32 = (seed: number) => {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export function generateScenarioNetwork(
  scenario: LayoutScenario,
  seed: number,
  { people, tieChance }: { people: number; tieChance: number },
): ScenarioNetwork {
  const rng = mulberry32(seed * 9301 + 49297);
  let nodeCount = 0;
  const edges: [number, number][] = [];
  const tied = new Set<string>();

  const add = () => nodeCount++;
  const link = (a: number, b: number) => {
    if (a === b) return;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (tied.has(key)) return;
    tied.add(key);
    edges.push([a, b]);
  };
  const isolates = (count: number) => {
    for (let i = 0; i < count; i++) add();
  };
  const pick = (ids: number[]) => ids[Math.floor(rng() * ids.length)]!;
  // A group whose members are tied with chance p, then joined up so nobody
  // in it is left without a tie to an earlier member.
  const cluster = (size: number, p: number) => {
    const ids = Array.from({ length: size }, add);
    for (let i = 0; i < size; i++) {
      for (let j = i + 1; j < size; j++) {
        if (rng() < p) link(ids[i]!, ids[j]!);
      }
    }
    for (let i = 1; i < size; i++) {
      const earlier = new Set(ids.slice(0, i));
      const joined = edges.some(
        ([a, b]) =>
          (a === ids[i] && earlier.has(b)) || (b === ids[i] && earlier.has(a)),
      );
      if (!joined) link(ids[i]!, ids[Math.floor(rng() * i)]!);
    }
    return ids;
  };

  switch (scenario) {
    case 'ego': {
      const a = cluster(6, 0.55);
      const b = cluster(5, 0.5);
      const c = cluster(3, 0.4);
      link(pick(a), pick(b));
      link(pick(b), pick(c));
      cluster(2, 1);
      isolates(4);
      break;
    }
    case 'isolates':
      isolates(people);
      break;
    case 'sparse':
      isolates(people);
      for (let i = 0; i < Math.round(people / 4); i++) {
        link(Math.floor(rng() * nodeCount), Math.floor(rng() * nodeCount));
      }
      break;
    case 'clique':
      cluster(10, 0.8);
      isolates(7);
      break;
    case 'tree':
      add();
      for (let i = 1; i < 16; i++) link(add(), Math.floor(rng() * i));
      isolates(3);
      break;
    case 'pieces':
      for (const size of [2, 2, 2, 3, 3, 4]) cluster(size, 0.7);
      isolates(5);
      break;
    case 'big': {
      const groups = [
        cluster(9, 0.35),
        cluster(8, 0.4),
        cluster(7, 0.4),
        cluster(6, 0.5),
      ];
      link(pick(groups[0]!), pick(groups[1]!));
      link(pick(groups[1]!), pick(groups[2]!));
      link(pick(groups[0]!), pick(groups[3]!));
      link(pick(groups[2]!), pick(groups[3]!));
      isolates(8);
      break;
    }
    case 'random':
      isolates(people);
      for (let i = 0; i < people; i++) {
        for (let j = i + 1; j < people; j++) {
          if (rng() < tieChance) link(i, j);
        }
      }
      break;
  }

  return { nodeCount, edges };
}
