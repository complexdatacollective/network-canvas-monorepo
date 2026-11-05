// Seeded personal networks for exploring the automatic layout in Storybook.
// Personal networks typically have 8 to 15 people, so each scenario is a
// pattern of connection that takes the number of people as an input.

export const LAYOUT_SCENARIOS = [
  'bridgedGroups',
  'separateGroups',
  'groupAndLoners',
  'closeKnit',
  'hub',
  'chain',
  'fewTies',
  'noTies',
  'random',
] as const;

export type LayoutScenario = (typeof LAYOUT_SCENARIOS)[number];

export const LAYOUT_SCENARIO_LABELS: Record<LayoutScenario, string> = {
  bridgedGroups: 'Two or three groups joined by a few ties',
  separateGroups: 'Small separate groups, not joined',
  groupAndLoners: 'One close group plus loners',
  closeKnit: 'Almost everyone knows each other',
  hub: 'One person knows almost everyone',
  chain: 'A chain of acquaintances',
  fewTies: 'A few scattered ties',
  noTies: 'No ties yet',
  random: 'Random ties',
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

// Splits a number of people into groups whose sizes differ by at most one.
const groupSizes = (total: number, groups: number) =>
  Array.from(
    { length: groups },
    (_, index) => Math.floor(total / groups) + (index < total % groups ? 1 : 0),
  );

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
  const loners = (count: number) => {
    for (let i = 0; i < count; i++) add();
  };
  const pick = (ids: number[]) => ids[Math.floor(rng() * ids.length)]!;
  // A group whose members are tied with chance p, then joined up so nobody
  // in it is left without a tie to an earlier member.
  const group = (size: number, p: number) => {
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
  // Ties between people picked at random from everyone added so far.
  const scatteredTies = (count: number) => {
    for (let i = 0; i < count; i++) {
      link(Math.floor(rng() * nodeCount), Math.floor(rng() * nodeCount));
    }
  };

  switch (scenario) {
    case 'bridgedGroups': {
      // Family, work and friends, say: each fairly close, joined through one
      // or two people, with a few people who know nobody else.
      const outside = Math.round(people * 0.2);
      const inside = people - outside;
      const groups = groupSizes(inside, inside >= 9 ? 3 : 2)
        .filter((size) => size > 0)
        .map((size) => group(size, 0.6));
      for (let i = 1; i < groups.length; i++) {
        link(pick(groups[i - 1]!), pick(groups[i]!));
      }
      loners(outside);
      break;
    }
    case 'separateGroups': {
      // Pairs and small groups that do not know each other, plus loners.
      let remaining = people - Math.round(people * 0.25);
      for (let size = 2; remaining >= 2; size = size === 4 ? 2 : size + 1) {
        const taken = Math.min(size, remaining);
        group(taken, 0.7);
        remaining -= taken;
      }
      loners(people - nodeCount);
      break;
    }
    case 'groupAndLoners': {
      const core = Math.round(people * 0.6);
      group(core, 0.8);
      loners(people - core);
      break;
    }
    case 'closeKnit':
      group(people, 0.85);
      break;
    case 'hub': {
      // A partner or parent who knows most of the others.
      const hub = add();
      loners(people - 1);
      for (let other = 1; other < people; other++) {
        if (rng() < 0.75) link(hub, other);
      }
      scatteredTies(Math.round(people / 5));
      break;
    }
    case 'chain': {
      const outside = Math.round(people * 0.15);
      if (people - outside > 0) add();
      for (let i = 1; i < people - outside; i++) {
        link(add(), Math.floor(rng() * i));
      }
      loners(outside);
      break;
    }
    case 'fewTies':
      loners(people);
      scatteredTies(Math.round(people / 4));
      break;
    case 'noTies':
      loners(people);
      break;
    case 'random':
      loners(people);
      for (let i = 0; i < people; i++) {
        for (let j = i + 1; j < people; j++) {
          if (rng() < tieChance) link(i, j);
        }
      }
      break;
  }

  return { nodeCount, edges };
}
