// A rough count of what a compiled protocol asks of a participant, at an
// assumed network size. The design review reads it, and it makes two
// designs of the same study comparable. Per-person work is counted once per
// person, per-pair work once per pair, and filtered stages at half the
// people, since a filter usually keeps a subset.

import { SKETCH_LOCALE } from './rules.ts';

export type Burden = {
  people: number;
  stages: number;
  screens: number;
  itemsPerPerson: number;
  answers: number;
};

type Fields = { fields?: unknown[] };
type ProtocolStage = {
  type: string;
  /** Localized, in Sketch's one language. */
  label?: Partial<Record<typeof SKETCH_LOCALE, string>>;
  filter?: unknown;
  form?: Fields;
  nodeForm?: Fields;
  convexHullVariable?: string;
  prompts?: { highlight?: unknown; edges?: { create?: string } }[];
  presets?: unknown[];
  behaviours?: { automaticLayout?: boolean };
  edges?: { form?: Fields }[];
};

// The stages come from compile(), which gives every one a type; the other
// fields are optional and read defensively.
const isProtocolStage = (s: unknown): s is ProtocolStage =>
  typeof s === 'object' &&
  s !== null &&
  'type' in s &&
  typeof s.type === 'string';

export const DEFAULT_PEOPLE = 12;

// What one stage asks, at the assumed network size: the review reads these
// to find the heaviest stages and whether a filter narrows them.
export type StageCost = {
  label: string;
  type: string;
  filtered: boolean;
  screens: number;
  itemsPerPerson: number;
  answers: number;
};

const costOf = (s: ProtocolStage, n: number): Omit<StageCost, 'label'> => {
  // ties drawn in a typical personal network: about 1.5 per person
  const ties = Math.round(n * 1.5);
  let screens = 0;
  let itemsPerPerson = 0;
  let answers = 0;
  const prompts = s.prompts?.length ?? 0;
  const fields = s.form?.fields?.length ?? 0;
  const shown = s.filter ? Math.ceil(n / 2) : n;
  const shownPairs = (shown * (shown - 1)) / 2;
  switch (s.type) {
    case 'EgoForm':
      screens += 1;
      answers += fields;
      break;
    case 'NameGenerator':
      // a form opens for each person added; its first field is the name
      screens += prompts + n;
      itemsPerPerson += Math.max(0, fields - 1);
      answers += n * Math.max(1, fields);
      break;
    case 'NameGeneratorQuickAdd':
    case 'NameGeneratorRoster':
      screens += prompts;
      answers += n;
      break;
    case 'AlterForm':
      screens += shown;
      itemsPerPerson += fields;
      answers += shown * fields;
      break;
    case 'AlterEdgeForm':
      screens += ties;
      answers += ties * fields;
      break;
    case 'OrdinalBin':
    case 'CategoricalBin':
      screens += prompts;
      itemsPerPerson += prompts;
      answers += prompts * shown;
      break;
    case 'Sociogram':
      screens += prompts;
      // without automatic layout the participant places each person once;
      // every prompt on the map shares that layout
      if (s.behaviours?.automaticLayout === false) {
        itemsPerPerson += 1;
        answers += shown;
      }
      for (const p of s.prompts ?? []) {
        if (p.highlight) {
          itemsPerPerson += 1;
          answers += shown;
        } else if (p.edges?.create) answers += ties;
      }
      break;
    case 'DyadCensus':
    case 'TieStrengthCensus':
      screens += prompts * shownPairs;
      answers += prompts * shownPairs;
      break;
    case 'OneToManyDyadCensus':
      screens += prompts * Math.max(0, shown - 1);
      answers += prompts * shownPairs;
      break;
    case 'Geospatial':
      screens += prompts * shown;
      itemsPerPerson += prompts;
      answers += prompts * shown;
      break;
    case 'NetworkComposer': {
      // each relationship tool draws its own ties: one action per tie plus
      // that tool's form questions
      const tieAnswers = (s.edges ?? []).reduce(
        (t, e) => t + ties * (1 + (e.form?.fields?.length ?? 0)),
        0,
      );
      // putting each person in a group is one more answer about them
      const perPerson =
        (s.nodeForm?.fields?.length ?? 0) + (s.convexHullVariable ? 1 : 0);
      screens += 1;
      itemsPerPerson += perPerson;
      answers += n * (1 + perPerson) + tieAnswers;
      break;
    }
    case 'Narrative':
      screens += s.presets?.length ?? 1;
      break;
    default:
      screens += 1;
  }
  return {
    type: s.type,
    filtered: Boolean(s.filter),
    screens,
    itemsPerPerson,
    answers,
  };
};

export const stageCosts = (
  protocol: { stages: unknown[] },
  people = DEFAULT_PEOPLE,
): StageCost[] => {
  const n = Math.max(1, Math.round(people));
  return protocol.stages.map((s, i) => {
    if (!isProtocolStage(s))
      throw new Error(`stages[${i}] is not a stage with a string type.`);
    return {
      label: s.label?.[SKETCH_LOCALE] ?? s.type,
      ...costOf(s, n),
    };
  });
};

export const estimateBurden = (
  protocol: { stages: unknown[] },
  people = DEFAULT_PEOPLE,
): Burden => {
  const costs = stageCosts(protocol, people);
  const sum = (k: 'screens' | 'itemsPerPerson' | 'answers') =>
    costs.reduce((t, c) => t + c[k], 0);
  return {
    people: Math.max(1, Math.round(people)),
    stages: costs.length,
    screens: sum('screens'),
    itemsPerPerson: sum('itemsPerPerson'),
    answers: sum('answers'),
  };
};
