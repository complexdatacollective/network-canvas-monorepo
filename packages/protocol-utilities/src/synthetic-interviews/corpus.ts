import {
  type CurrentProtocol,
  CurrentProtocolSchema,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import type { AssetData } from './simulators/types';

/**
 * A deterministic corpus of small, structurally varied protocols.
 *
 * Its job is to be a source of PROTOCOLS the engine has never seen, generated
 * from an index rather than written by hand, so the acceptance oracles are held
 * to shapes nobody chose to make them pass. Shape `n` is shape `n` forever: the
 * generator is a pure function of its index, so a corpus failure names a
 * reproducible protocol rather than a run.
 *
 * Two consumers, and they ask different things of it. The corpus test drives
 * `generateInterviews` over every shape and cross-checks the pre-seed gate
 * against a brute-force oracle; the replay-parity suite in `@codaco/interview`
 * replays the same shapes through the real session store (criterion C1). Both
 * read the SHAPE record beside the protocol, which says in plain numbers what
 * the protocol is supposed to contain — a test that re-derived that from the
 * protocol would be re-implementing the thing under test.
 *
 * Every shape is deliberately small. What is being varied is structure — which
 * variables are collected where, which rules they carry, which stage links whom
 * — and a corpus of large networks buys none of that while costing a suite that
 * has to stay fast enough to run on every commit.
 */

/** One codebook variable a shape declares, before it becomes JSON. */
export type CorpusVariable = {
  id: string;
  type: 'boolean' | 'number' | 'ordinal' | 'text';
  /** Ordinal option values, ascending. */
  options?: number[];
  /** Inclusive integer bounds, for numbers. */
  minValue?: number;
  maxValue?: number;
  unique: boolean;
};

/** One name-generating stage: how many people, and what it asks about them. */
export type CorpusGenerator = {
  id: string;
  count: number;
  /** Variable ids its form collects on the people it elicits. */
  collects: string[];
};

/** The roster stage a shape may carry, and the rows the run resolves for it. */
export type CorpusRoster = {
  count: number;
  poolSize: number;
  minNodes?: number;
};

export type CorpusShape = {
  index: number;
  nodeVariables: CorpusVariable[];
  generators: CorpusGenerator[];
  /** Variables an alter form fills over everybody elicited so far. */
  alterForm: string[];
  roster?: CorpusRoster;
  edgeVariables: CorpusVariable[];
  /** Which census — and so which edges, and whether an edge value is drawn. */
  census: 'none' | 'dyad' | 'tieStrength';
  /** The edge variable a tie-strength census draws onto every edge it makes. */
  tieStrengthVariable?: string;
};

export type CorpusProtocol = {
  shape: CorpusShape;
  protocol: CurrentProtocol;
  /** Roster rows, under the three-way key contract the engine reads. */
  assetData: AssetData;
};

// ---------------------------------------------------------------------------
// A seeded stream, so shape `n` is shape `n` on every machine and every run
// ---------------------------------------------------------------------------

type Rand = {
  next: () => number;
  int: (low: number, high: number) => number;
  pick: <T>(items: readonly T[]) => T;
  chance: (probability: number) => boolean;
};

const mulberry32 = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let drawn = Math.imul(state ^ (state >>> 15), 1 | state);
    drawn = (drawn + Math.imul(drawn ^ (drawn >>> 7), 61 | drawn)) ^ drawn;
    return ((drawn ^ (drawn >>> 14)) >>> 0) / 4294967296;
  };
};

const randFor = (seed: number): Rand => {
  const next = mulberry32(seed);
  const int = (low: number, high: number) =>
    low + Math.floor(next() * (high - low + 1));
  return {
    next,
    int,
    pick: <T>(items: readonly T[]): T => {
      const chosen = items[int(0, items.length - 1)];
      if (chosen === undefined) throw new Error('picked from an empty list');
      return chosen;
    },
    chance: (probability: number) => next() < probability,
  };
};

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

const VARIABLE_TYPES = ['boolean', 'number', 'ordinal', 'text'] as const;

/**
 * Shapes at this stride carry two large populations feeding one census, which
 * is the only way under the schema's per-stage population ceiling to demand
 * more pairs than a stage may enumerate. Every one of them is refused, so they
 * cost the corpus a verdict rather than a walk.
 */
const PAIR_CAP_STRIDE = 37;

const variableAt = (rand: Rand, id: string): CorpusVariable => {
  const type = rand.pick(VARIABLE_TYPES);
  // `unique` is what makes an entity COUNT part of satisfiability, so it is
  // offered often — a corpus where it is rare exercises the counting half of
  // the gate on a handful of shapes.
  const unique = rand.chance(0.5);

  switch (type) {
    case 'ordinal': {
      const size = rand.int(2, 5);
      return {
        id,
        type,
        options: Array.from({ length: size }, (_unused, at) => at + 1),
        unique,
      };
    }
    case 'number': {
      const minValue = rand.int(0, 5);
      return {
        id,
        type,
        minValue,
        maxValue: minValue + rand.int(0, 6),
        unique,
      };
    }
    case 'boolean':
    case 'text':
      return { id, type, unique };
  }
};

/** The shape of corpus entry `index`, as numbers rather than as JSON. */
const shapeAt = (index: number): CorpusShape => {
  const rand = randFor((index + 1) * 0x9e3779b1);

  const nodeVariables = Array.from({ length: rand.int(1, 3) }, (_unused, at) =>
    variableAt(rand, `v${at}`),
  );
  const ids = nodeVariables.map((variable) => variable.id);

  const overCap = index % PAIR_CAP_STRIDE === 0;
  const generatorCount = overCap ? 2 : rand.int(1, 2);
  const generators = Array.from(
    { length: generatorCount },
    (_unused, at): CorpusGenerator => ({
      id: `ng${at}`,
      // A pinned count, so the walk's floor and ceiling coincide and the
      // oracle's arithmetic is exact rather than an interval.
      count: overCap ? 60 : rand.int(1, 4),
      collects: ids.filter(() => rand.chance(0.7)),
    }),
  );

  const alterForm = rand.chance(0.3) ? ids.filter(() => rand.chance(0.6)) : [];

  const roster = rand.chance(0.25)
    ? ((): CorpusRoster => {
        const minNodes = rand.chance(0.5) ? rand.int(1, 3) : undefined;
        return {
          count: minNodes ?? rand.int(1, 3),
          poolSize: rand.int(0, 4),
          ...(minNodes === undefined ? {} : { minNodes }),
        };
      })()
    : undefined;

  const census = overCap
    ? ('dyad' as const)
    : rand.pick(['none', 'dyad', 'tieStrength'] as const);

  const edgeVariables =
    census === 'none'
      ? []
      : Array.from({ length: rand.int(1, 2) }, (_unused, at) =>
          variableAt(rand, `e${at}`),
        );

  // A tie-strength census needs an ordinal to grade its ties with, and grades
  // every edge it creates — so an ordinal that is also `unique` is measured
  // against the whole pair set, which is where the counting half of the gate
  // gets its edge-side work.
  const graded =
    census === 'tieStrength'
      ? (edgeVariables.find((variable) => variable.type === 'ordinal') ?? {
          id: 'grade',
          type: 'ordinal' as const,
          options: [1, 2, 3],
          unique: rand.chance(0.4),
        })
      : undefined;
  if (graded !== undefined && !edgeVariables.includes(graded)) {
    edgeVariables.push(graded);
  }

  return {
    index,
    nodeVariables,
    generators,
    alterForm,
    ...(roster === undefined ? {} : { roster }),
    edgeVariables,
    census,
    ...(graded === undefined ? {} : { tieStrengthVariable: graded.id }),
  };
};

// ---------------------------------------------------------------------------
// Shapes, as protocols
// ---------------------------------------------------------------------------

const codebookVariable = (
  variable: CorpusVariable,
): Record<string, unknown> => {
  const validation = variable.unique ? { unique: true } : undefined;

  switch (variable.type) {
    case 'boolean':
      return {
        name: variable.id,
        type: 'boolean',
        component: 'Toggle',
        ...(validation ? { validation } : {}),
      };
    case 'ordinal':
      return {
        name: variable.id,
        type: 'ordinal',
        component: 'LikertScale',
        options: (variable.options ?? []).map((value) => ({
          label: `Option ${value}`,
          value,
        })),
        ...(validation ? { validation } : {}),
      };
    case 'number':
      return {
        name: variable.id,
        type: 'number',
        component: 'Number',
        validation: {
          ...validation,
          minValue: variable.minValue,
          maxValue: variable.maxValue,
        },
      };
    case 'text':
      return {
        name: variable.id,
        type: 'text',
        component: 'Text',
        ...(validation ? { validation } : {}),
      };
  }
};

const ASSET_MANIFEST = {
  'corpus-roster': {
    id: 'corpus-roster',
    name: 'Corpus roster',
    type: 'network',
    source: 'corpus-roster.json',
  },
};

const ROSTER_STAGE_ID = 'roster';

const rosterRows = (shape: CorpusShape): NcNode[] =>
  Array.from(
    { length: shape.roster?.poolSize ?? 0 },
    (_unused, at): NcNode => ({
      [entityPrimaryKeyProperty]: `corpus-${shape.index}-row-${at}`,
      type: 'person',
      [entityAttributesProperty]: { label: `Row ${at}` },
    }),
  );

const stagesFor = (shape: CorpusShape): Record<string, unknown>[] => {
  const stages: Record<string, unknown>[] = shape.generators.map(
    (generator) => ({
      id: generator.id,
      type: 'NameGenerator',
      label: `Name generator ${generator.id}`,
      subject: { entity: 'node', type: 'person' },
      form: {
        title: 'About them',
        // A name generator's form must collect something, so a stage that
        // collects none of the shape's own variables asks for the plain label
        // instead — a person with a name and nothing else.
        fields: (generator.collects.length > 0
          ? generator.collects
          : ['label']
        ).map((variable) => ({
          variable,
          prompt: `Tell us about ${variable}`,
        })),
      },
      synthetic: {
        generatesData: true,
        count: { distribution: 'constant', value: generator.count },
      },
      prompts: [{ id: `${generator.id}-p1`, text: 'Who do you know?' }],
    }),
  );

  if (shape.roster) {
    stages.push({
      id: ROSTER_STAGE_ID,
      type: 'NameGeneratorRoster',
      label: 'Roster',
      subject: { entity: 'node', type: 'person' },
      dataSource: 'corpus-roster',
      synthetic: {
        generatesData: true,
        count: { distribution: 'constant', value: shape.roster.count },
      },
      prompts: [{ id: 'roster-p1', text: 'Who do you work with?' }],
      ...(shape.roster.minNodes === undefined
        ? {}
        : { behaviours: { minNodes: shape.roster.minNodes } }),
    });
  }

  if (shape.alterForm.length > 0) {
    stages.push({
      id: 'alter-form',
      type: 'AlterForm',
      label: 'About each person',
      subject: { entity: 'node', type: 'person' },
      introductionPanel: { title: 'About them', text: 'A few questions.' },
      form: {
        fields: shape.alterForm.map((variable) => ({
          variable,
          prompt: `And ${variable}?`,
        })),
      },
    });
  }

  if (shape.census === 'dyad') {
    stages.push({
      id: 'census',
      type: 'DyadCensus',
      label: 'Dyad census',
      subject: { entity: 'node', type: 'person' },
      introductionPanel: { title: 'Pairs', text: 'About each pair.' },
      prompts: [
        {
          id: 'census-p1',
          text: 'Do these two know each other?',
          createEdge: 'link',
        },
      ],
    });
  }

  if (shape.census === 'tieStrength') {
    stages.push({
      id: 'census',
      type: 'TieStrengthCensus',
      label: 'Tie strength',
      subject: { entity: 'node', type: 'person' },
      introductionPanel: { title: 'Pairs', text: 'About each pair.' },
      prompts: [
        {
          id: 'census-p1',
          text: 'How close are these two?',
          createEdge: 'link',
          edgeVariable: shape.tieStrengthVariable,
          negativeLabel: 'They do not know each other',
        },
      ],
    });
  }

  return stages;
};

/**
 * Corpus entry `index`: its shape, the protocol that shape describes, and the
 * roster rows a host would have resolved for it.
 *
 * The protocol comes back PARSED, because that is what a host hands the engine
 * and what carries the `synthetic` descriptors generation reads. A shape whose
 * JSON the schema rejects is a bug in this file rather than a corpus entry, so
 * the parse throws rather than being reported as a refusal.
 */
export const generateCorpusProtocol = (index: number): CorpusProtocol => {
  const shape = shapeAt(index);

  const protocol = CurrentProtocolSchema.parse({
    name: `Corpus shape ${index}`,
    description: 'A generated protocol shape for the acceptance corpus.',
    schemaVersion: 8,
    assetManifest: ASSET_MANIFEST,
    codebook: {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            label: { name: 'label', type: 'text', component: 'Text' },
            ...Object.fromEntries(
              shape.nodeVariables.map((variable) => [
                variable.id,
                codebookVariable(variable),
              ]),
            ),
          },
        },
      },
      edge: {
        link: {
          name: 'Link',
          color: 'edge-color-seq-1',
          variables: Object.fromEntries(
            shape.edgeVariables.map((variable) => [
              variable.id,
              codebookVariable(variable),
            ]),
          ),
        },
      },
    },
    stages: stagesFor(shape),
  });

  return {
    shape,
    protocol,
    ...(shape.roster
      ? { assetData: { rosterNodes: { [ROSTER_STAGE_ID]: rosterRows(shape) } } }
      : { assetData: {} }),
  };
};
