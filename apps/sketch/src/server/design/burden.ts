// A rough count of what a compiled protocol asks of a participant, at an
// assumed network size. The design review reads it, and it makes two
// designs of the same study comparable. Per-person work is counted once per
// person, per-pair work once per pair, and filtered stages at half the
// people, since a filter usually keeps a subset.

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
  filter?: unknown;
  form?: Fields;
  nodeForm?: Fields;
  prompts?: { highlight?: unknown; edges?: { create?: string } }[];
  presets?: unknown[];
  edges?: { form?: Fields }[];
};

export const DEFAULT_PEOPLE = 12;

export const estimateBurden = (
  protocol: { stages: unknown[] },
  people = DEFAULT_PEOPLE,
): Burden => {
  const n = Math.max(1, Math.round(people));
  // ties drawn in a typical personal network: about 1.5 per person
  const ties = Math.round(n * 1.5);
  let screens = 0;
  let itemsPerPerson = 0;
  let answers = 0;
  const stages = protocol.stages as ProtocolStage[];
  for (const s of stages) {
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
        const edgeFields = Math.max(
          0,
          ...(s.edges ?? []).map((e) => e.form?.fields?.length ?? 0),
        );
        screens += 1;
        itemsPerPerson += s.nodeForm?.fields?.length ?? 0;
        // each drawn tie is one action plus its form's questions
        answers +=
          n * (1 + (s.nodeForm?.fields?.length ?? 0)) + ties * (1 + edgeFields);
        break;
      }
      case 'Narrative':
        screens += s.presets?.length ?? 1;
        break;
      default:
        screens += 1;
    }
  }
  return { people: n, stages: stages.length, screens, itemsPerPerson, answers };
};
