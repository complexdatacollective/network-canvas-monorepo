import { describe, expect, it } from 'vitest';

import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { ValueGenerator } from '../../../ValueGenerator';
import { analyseStageEffects } from '../../analyse/stageEffects';
import { resolveGenerationConfig } from '../../config';
import { buildEntityConstraints } from '../../constraints/buildConstraints';
import { UniqueRegistry } from '../../constraints/uniqueRegistry';
import type { GenerationContext } from '../../context';
import { planNetwork } from '../networkPlan';

const TODAY = '2026-08-06';

const stage = (value: Record<string, unknown>): Stage =>
  value as unknown as Stage;

/** `count` is sugar for the stage's own `synthetic.count` declaration. */
const nameGenerator = (
  overrides: Record<string, unknown> = {},
  count?: number,
): Stage =>
  stage({
    id: 'ng-1',
    type: 'NameGeneratorQuickAdd',
    label: 'Names',
    subject: { entity: 'node', type: 'person' },
    quickAdd: 'name',
    prompts: [{ id: 'p1', text: 'Who?' }],
    ...(count === undefined
      ? {}
      : { synthetic: { count: { distribution: 'constant', value: count } } }),
    ...overrides,
  });

/**
 * A form pass over every person, writing the variables named.
 *
 * The plan draws only what some stage writes — a variable no interaction ever
 * asks about stays unanswered — so a test reading a drawn value has to give it
 * a writer.
 */
const alterForm = (...variables: string[]): Stage =>
  stage({
    id: 'form-1',
    type: 'AlterForm',
    label: 'About them',
    subject: { entity: 'node', type: 'person' },
    form: { fields: variables.map((variable) => ({ variable, prompt: '?' })) },
  });

const baseCodebook = (
  extras: Record<string, unknown> = {},
): StructuralCodebook =>
  ({
    node: {
      person: {
        name: 'Person',
        variables: {
          name: { name: 'Name', type: 'text' },
          age: {
            name: 'Age',
            type: 'number',
            synthetic: { distribution: 'normal', mean: 34, sd: 12 },
          },
          ...extras,
        },
      },
    },
    edge: {},
    ego: { variables: {} },
  }) as unknown as StructuralCodebook;

function makeCtx(
  codebook: StructuralCodebook,
  options: {
    seed?: number;
    externalData?: Record<string, NcNode[]>;
    respectSkipLogicAndFiltering?: boolean;
  } = {},
): GenerationContext {
  const config = resolveGenerationConfig({ today: TODAY });
  return {
    codebook,
    valueGen: new ValueGenerator(options.seed ?? 42, TODAY),
    config,
    usedRosterUids: new Set<string>(),
    externalData: options.externalData,
    respectSkipLogicAndFiltering: options.respectSkipLogicAndFiltering ?? false,
    uniqueRegistry: new UniqueRegistry(),
    entityConstraints: {
      ego: buildEntityConstraints(codebook.ego?.variables, TODAY),
      node: new Map(
        Object.entries(codebook.node ?? {}).map(([type, definition]) => [
          type,
          buildEntityConstraints(definition.variables, TODAY),
        ]),
      ),
      edge: new Map(
        Object.entries(codebook.edge ?? {}).map(([type, definition]) => [
          type,
          buildEntityConstraints(definition.variables, TODAY),
        ]),
      ),
    },
  };
}

const plan = (
  codebook: StructuralCodebook,
  stages: Stage[],
  options?: Parameters<typeof makeCtx>[1],
) => planNetwork(makeCtx(codebook, options), analyseStageEffects(stages));

const withPairEdgeType = (
  codebook: StructuralCodebook,
  type: string,
): StructuralCodebook =>
  ({
    ...codebook,
    edge: { [type]: { name: type, variables: {} } },
  }) as unknown as StructuralCodebook;

const pairCensus = (createEdge: string): Stage =>
  stage({
    id: `census-${createEdge}`,
    type: 'DyadCensus',
    label: 'Census',
    subject: { entity: 'node', type: 'person' },
    introductionPanel: { title: 't', text: 'x' },
    prompts: [{ id: 'p1', text: 'Know?', createEdge }],
  });

describe('planNetwork populations', () => {
  it('draws the declared constant population', () => {
    const result = plan(baseCodebook(), [
      nameGenerator({}, 5),
      alterForm('age'),
    ]);
    expect(result.nodes).toHaveLength(5);
    for (const node of result.nodes) {
      expect(node.creationStageIndex).toBe(0);
      expect(node.type).toBe('person');
      expect(typeof node.attributes.name).toBe('string');
      expect(typeof node.attributes.age).toBe('number');
    }
  });

  it('caps the population at stage capacity', () => {
    const result = plan(baseCodebook(), [
      nameGenerator({ behaviours: { maxNodes: 3 } }, 10),
    ]);
    expect(result.nodes).toHaveLength(3);
  });

  it('raises the population to a stage minimum', () => {
    const result = plan(baseCodebook(), [
      nameGenerator({ behaviours: { minNodes: 2 } }, 0),
    ]);
    expect(result.nodes).toHaveLength(2);
  });

  it('plans nobody for a type no stage creates', () => {
    const result = plan(baseCodebook(), []);
    expect(result.nodes).toHaveLength(0);
  });

  it('gives each creating stage the population it declares', () => {
    const result = plan(baseCodebook(), [
      nameGenerator({}, 3),
      nameGenerator({ id: 'ng-2' }, 3),
    ]);
    const byStage = new Map<number, number>();
    for (const node of result.nodes) {
      byStage.set(
        node.creationStageIndex,
        (byStage.get(node.creationStageIndex) ?? 0) + 1,
      );
    }
    expect(byStage.get(0)).toBe(3);
    expect(byStage.get(1)).toBe(3);
  });

  it('applies prompt additionalAttributes as fixed values', () => {
    const result = plan(
      baseCodebook({
        close: { name: 'Close', type: 'boolean' },
      }),
      [
        nameGenerator({
          synthetic: { count: { distribution: 'constant', value: 4 } },
          prompts: [
            {
              id: 'p1',
              text: 'Close?',
              additionalAttributes: [{ variable: 'close', value: true }],
            },
            { id: 'p2', text: 'Others?' },
          ],
        }),
      ],
    );
    const byPrompt = new Map<number, boolean[]>();
    for (const node of result.nodes) {
      const list = byPrompt.get(node.promptIndex) ?? [];
      list.push(node.attributes.close as boolean);
      byPrompt.set(node.promptIndex, list);
    }
    expect(byPrompt.get(0)).toEqual([true, true]);
  });
});

describe('planNetwork against the population ceiling', () => {
  // `behaviours.minNodes` is a floor the live interface holds the participant
  // to — its gate will not let anyone leave the stage below it — and the
  // stage schema puts no ceiling on it, so a schema-valid minimum walks
  // straight past the cap that keeps a synchronous preview from freezing the
  // renderer. Trimming it emitted a completed session no participant could
  // produce and said nothing; a minimum the run cannot satisfy is refused
  // like any other declaration the generator cannot honour.
  it('refuses a stage minimum that would exceed it', () => {
    expect(() =>
      plan(baseCodebook(), [
        nameGenerator({ behaviours: { minNodes: 9_000_000 } }, 1),
      ]),
    ).toThrow(/stage minimums alone exceed the population/);
  });

  it('refuses the SUM when several stages each sit inside it', () => {
    // Each is legal alone; together they are not.
    expect(() =>
      plan(baseCodebook(), [
        nameGenerator({ id: 'ng-a', behaviours: { minNodes: 9_000 } }, 1),
        nameGenerator({ id: 'ng-b', behaviours: { minNodes: 9_000 } }, 1),
      ]),
    ).toThrow(/stage minimums alone exceed the population/);
  });

  it('trims discretionary counts before touching a reachable minimum', () => {
    // Stage 1's 9,998 people are all discretionary; stage 2 declares a floor
    // of 5 and asks for exactly 5. A valid allocation inside the cap exists
    // (9,995 + 5), so the trim consumes the discretionary share and leaves
    // the declared minimum whole — never the other way round.
    const result = plan(baseCodebook(), [
      nameGenerator({ id: 'ng-a' }, 9_998),
      nameGenerator({ id: 'ng-b', behaviours: { minNodes: 5 } }, 5),
    ]);
    expect(result.nodes).toHaveLength(10_000);
    const second = result.nodes.filter(
      (node) => node.creationStageIndex === 1,
    ).length;
    expect(second).toBe(5);
  });

  it('leaves minimums inside the ceiling exactly as they were', () => {
    const result = plan(baseCodebook(), [
      nameGenerator({ id: 'ng-a', behaviours: { minNodes: 2 } }, 0),
      nameGenerator({ id: 'ng-b', behaviours: { minNodes: 3 } }, 0),
    ]);
    expect(result.nodes).toHaveLength(5);
  });
});

describe('planNetwork against the population ceiling across node types', () => {
  // A preview freezes on how many people it has to build, not on how many
  // types they are spread across. Applied per type, ten types with a
  // constant-10,000 creator each planned a hundred thousand people, every one
  // of them inside a ceiling that only ever looked at its own type.
  const manyTypes = (count: number): StructuralCodebook =>
    ({
      node: Object.fromEntries(
        Array.from({ length: count }, (_unused, index) => [
          `type-${index}`,
          {
            name: `Type ${index}`,
            variables: { name: { name: 'Name', type: 'text' } },
          },
        ]),
      ),
      edge: {},
      ego: { variables: {} },
    }) as unknown as StructuralCodebook;

  const creatorFor = (index: number): Stage =>
    stage({
      id: `ng-${index}`,
      type: 'NameGeneratorQuickAdd',
      label: `Names ${index}`,
      subject: { entity: 'node', type: `type-${index}` },
      quickAdd: 'name',
      synthetic: { count: { distribution: 'constant', value: 10_000 } },
      prompts: [{ id: `p-${index}`, text: 'Who?' }],
    });

  it('spends one budget across every type', () => {
    const result = plan(
      manyTypes(10),
      Array.from({ length: 10 }, (_unused, index) => creatorFor(index)),
    );
    expect(result.nodes).toHaveLength(10_000);
    // The codebook's first type keeps the people it asked for, as the first
    // stage does within a type.
    expect(result.nodes.every((node) => node.type === 'type-0')).toBe(true);
  });

  it('leaves modest populations across types untouched', () => {
    const modest = (index: number): Stage =>
      stage({
        ...(creatorFor(index) as unknown as Record<string, unknown>),
        synthetic: { count: { distribution: 'constant', value: 3 } },
      });
    const result = plan(
      manyTypes(4),
      Array.from({ length: 4 }, (_unused, index) => modest(index)),
    );
    expect(result.nodes).toHaveLength(12);
  });
});

describe('planNetwork against the pair-domain ceiling', () => {
  // A population bound alone is not enough: pairs grow quadratically, so a
  // count well inside the population cap still asks the planner to assemble
  // tens of millions of map entries on Architect's main thread.
  it('refuses a linkable set larger than a preview can pair', () => {
    const codebook = withPairEdgeType(baseCodebook(), 'knows');
    expect(() =>
      plan(codebook, [
        nameGenerator({ behaviours: { minNodes: 1_000, maxNodes: 1_000 } }, 1),
        pairCensus('knows'),
      ]),
    ).toThrow(/more pairs than a preview can build/);
  });

  it('names the count and the cap so the figure is actionable', () => {
    const codebook = withPairEdgeType(baseCodebook(), 'knows');
    expect(() =>
      plan(codebook, [
        nameGenerator({ behaviours: { minNodes: 1_000, maxNodes: 1_000 } }, 1),
        pairCensus('knows'),
      ]),
    ).toThrow(/1,000 people are eligible.*499,500 possible pairs.*250,000/s);
  });

  it('builds a linkable set that fits', () => {
    const codebook = withPairEdgeType(baseCodebook(), 'knows');
    const result = plan(codebook, [
      nameGenerator({ behaviours: { minNodes: 60, maxNodes: 60 } }, 1),
      pairCensus('knows'),
    ]);
    expect(result.nodes).toHaveLength(60);
  });

  // Each stage's own domain is bounded, but they are UNIONED per subject type,
  // and the union is what gets held in memory. Two filtered halves of 1,400
  // people are 244,650 pairs each — comfortably inside the cap — and 489,300
  // between them.
  it('refuses an accumulated domain no single stage exceeds', () => {
    const codebook = withPairEdgeType(
      baseCodebook({ close: { name: 'Close', type: 'boolean' } }),
      'knows',
    );
    const half = (id: string, value: boolean): Stage =>
      stage({
        id,
        type: 'DyadCensus',
        label: 'Census',
        subject: { entity: 'node', type: 'person' },
        introductionPanel: { title: 't', text: 'x' },
        prompts: [{ id: `${id}-p1`, text: 'Know?', createEdge: 'knows' }],
        filter: {
          join: 'AND',
          rules: [
            {
              id: `${id}-rule`,
              type: 'node',
              options: {
                type: 'person',
                attribute: 'close',
                operator: 'EXACTLY',
                value,
              },
            },
          ],
        },
      });
    // Two prompts split the declared population evenly and fix `close` on
    // each half, so the two censuses see exactly 700 people apiece.
    const generator = nameGenerator({
      synthetic: { count: { distribution: 'constant', value: 1_400 } },
      prompts: [
        {
          id: 'p1',
          text: 'Close?',
          additionalAttributes: [{ variable: 'close', value: true }],
        },
        {
          id: 'p2',
          text: 'Others?',
          additionalAttributes: [{ variable: 'close', value: false }],
        },
      ],
    });

    expect(() =>
      plan(
        codebook,
        [generator, half('census-a', true), half('census-b', false)],
        {
          respectSkipLogicAndFiltering: true,
        },
      ),
    ).toThrow(/reach 489,300 pairs between them.*250,000/s);
  });
});

describe('planNetwork rosters', () => {
  const rosterStage = (count: number) =>
    stage({
      id: 'roster-1',
      type: 'NameGeneratorRoster',
      label: 'Roster',
      subject: { entity: 'node', type: 'person' },
      synthetic: { count: { distribution: 'constant', value: count } },
      dataSource: 'people.csv',
      prompts: [{ id: 'p1', text: 'Pick' }],
    });

  const row = (uid: string, name: string): NcNode =>
    ({
      [entityPrimaryKeyProperty]: uid,
      type: 'person',
      [entityAttributesProperty]: { name },
    }) as unknown as NcNode;

  it('draws only roster rows, keeping their uids and values', () => {
    const result = plan(baseCodebook(), [rosterStage(2)], {
      externalData: { 'roster-1': [row('r1', 'Ada'), row('r2', 'Grace')] },
    });
    expect(result.nodes).toHaveLength(2);
    const uids = result.nodes.map((node) => node.uid).toSorted();
    expect(uids).toEqual(['r1', 'r2']);
    for (const node of result.nodes) {
      expect(['Ada', 'Grace']).toContain(node.attributes.name);
    }
  });

  it('refuses a known-empty roster its stage was told to draw from', () => {
    // The contract changed with the move of counts onto stages. A stage that
    // declares four people and a roster that resolved to none is a protocol
    // the researcher needs to hear about; building nobody and carrying on is
    // how an under-provisioned roster used to go unnoticed.
    expect(() =>
      plan(baseCodebook(), [rosterStage(4)], {
        externalData: { 'roster-1': [] },
      }),
    ).toThrow(
      /roster does not hold enough people for the stages drawing from it/,
    );
  });

  it('admits nobody from a known-empty roster asked for nobody', () => {
    const result = plan(baseCodebook(), [rosterStage(0)], {
      externalData: { 'roster-1': [] },
    });
    expect(result.nodes).toHaveLength(0);
  });

  it('leaves a contested row to the stage that alone can draw it', () => {
    // Both stages share a two-row pool and each asks for one person. Only one
    // row satisfies the second stage's prompt, so an assignment blind to that
    // hands the row to the first stage, leaves the second to reject what
    // remains, and quietly builds one person — though the other assignment
    // satisfies both.
    const codebook = {
      node: {
        person: {
          name: 'Person',
          variables: {
            kind: { name: 'Kind', type: 'number' },
            target: {
              name: 'Target',
              type: 'number',
              validation: { sameAs: 'kind' },
            },
          },
        },
      },
      edge: {},
      ego: { variables: {} },
    } as unknown as StructuralCodebook;

    const rosterRow = (uid: string, kind: number): NcNode =>
      ({
        [entityPrimaryKeyProperty]: uid,
        type: 'person',
        [entityAttributesProperty]: { kind },
      }) as unknown as NcNode;

    const unfussy = stage({
      id: 'roster-1',
      type: 'NameGeneratorRoster',
      label: 'Anyone',
      subject: { entity: 'node', type: 'person' },
      synthetic: { count: { distribution: 'constant', value: 1 } },
      dataSource: 'people.csv',
      prompts: [{ id: 'p1', text: 'Pick' }],
    });
    const particular = stage({
      id: 'roster-2',
      type: 'NameGeneratorRoster',
      label: 'Only kind zero',
      subject: { entity: 'node', type: 'person' },
      synthetic: { count: { distribution: 'constant', value: 1 } },
      dataSource: 'people.csv',
      prompts: [
        {
          id: 'p1',
          text: 'Pick',
          additionalAttributes: [{ variable: 'target', value: 0 }],
        },
      ],
    });

    const rows = [rosterRow('r-zero', 0), rosterRow('r-one', 1)];
    const result = plan(codebook, [unfussy, particular], {
      externalData: { 'roster-1': rows, 'roster-2': rows },
    });

    expect(result.nodes).toHaveLength(2);
    const byStage = new Map(
      result.nodes.map((node) => [node.creationStageIndex, node.uid]),
    );
    // The fussy stage gets the only row it can use; the other takes what is
    // left, which it was always able to.
    expect(byStage.get(1)).toBe('r-zero');
    expect(byStage.get(0)).toBe('r-one');
  });

  it('counts a roster against the prompt slots that must be filled', () => {
    // Slots go round the prompts in turn — slot `i` belongs to prompt
    // `i % promptCount` — so a row only the first prompt can use is no supply
    // at all for the second's slot. Counted stage-wide, two such rows reported
    // enough for a declared count of two and the stage built one person in
    // silence.
    const codebook = {
      node: {
        person: {
          name: 'Person',
          variables: {
            kind: { name: 'Kind', type: 'number' },
            target: {
              name: 'Target',
              type: 'number',
              validation: { sameAs: 'kind' },
            },
          },
        },
      },
      edge: {},
      ego: { variables: {} },
    } as unknown as StructuralCodebook;

    const rosterRow = (uid: string, kind: number): NcNode =>
      ({
        [entityPrimaryKeyProperty]: uid,
        type: 'person',
        [entityAttributesProperty]: { kind },
      }) as unknown as NcNode;

    const twoPrompts = stage({
      id: 'roster-1',
      type: 'NameGeneratorRoster',
      label: 'Roster',
      subject: { entity: 'node', type: 'person' },
      synthetic: { count: { distribution: 'constant', value: 2 } },
      dataSource: 'people.csv',
      prompts: [
        {
          id: 'p1',
          text: 'Kind zero',
          additionalAttributes: [{ variable: 'target', value: 0 }],
        },
        {
          id: 'p2',
          text: 'Kind one',
          additionalAttributes: [{ variable: 'target', value: 1 }],
        },
      ],
    });

    // Both rows suit the first prompt and neither suits the second.
    expect(() =>
      plan(codebook, [twoPrompts], {
        externalData: {
          'roster-1': [rosterRow('a', 0), rosterRow('b', 0)],
        },
      }),
    ).toThrow(
      /roster does not hold enough people for the stages drawing from it/,
    );
  });

  it('accepts a roster holding a row for each prompt slot', () => {
    const codebook = {
      node: {
        person: {
          name: 'Person',
          variables: {
            kind: { name: 'Kind', type: 'number' },
            target: {
              name: 'Target',
              type: 'number',
              validation: { sameAs: 'kind' },
            },
          },
        },
      },
      edge: {},
      ego: { variables: {} },
    } as unknown as StructuralCodebook;

    const rosterRow = (uid: string, kind: number): NcNode =>
      ({
        [entityPrimaryKeyProperty]: uid,
        type: 'person',
        [entityAttributesProperty]: { kind },
      }) as unknown as NcNode;

    const twoPrompts = stage({
      id: 'roster-1',
      type: 'NameGeneratorRoster',
      label: 'Roster',
      subject: { entity: 'node', type: 'person' },
      synthetic: { count: { distribution: 'constant', value: 2 } },
      dataSource: 'people.csv',
      prompts: [
        {
          id: 'p1',
          text: 'Kind zero',
          additionalAttributes: [{ variable: 'target', value: 0 }],
        },
        {
          id: 'p2',
          text: 'Kind one',
          additionalAttributes: [{ variable: 'target', value: 1 }],
        },
      ],
    });

    const result = plan(codebook, [twoPrompts], {
      externalData: { 'roster-1': [rosterRow('a', 0), rosterRow('b', 1)] },
    });
    expect(result.nodes).toHaveLength(2);
  });

  it('holds a row kept for a later prompt against the draws between', () => {
    // The stage saves a row its first prompt cannot use for the prompt that
    // can. Releasing the row's `unique` hold when it was passed over let the
    // node drawn in the meantime take the very value the saved row carries —
    // and the prompt that had saved it then rejected it as a collision, so the
    // stage came up short though a complete assignment existed.
    const codebook = {
      node: {
        person: {
          name: 'Person',
          variables: {
            kind: { name: 'Kind', type: 'number' },
            target: {
              name: 'Target',
              type: 'number',
              validation: { sameAs: 'kind' },
            },
            code: {
              name: 'Code',
              type: 'number',
              validation: { unique: true, minValue: 0, maxValue: 3 },
            },
          },
        },
      },
      edge: {},
      ego: { variables: {} },
    } as unknown as StructuralCodebook;

    const twoPrompts = stage({
      id: 'roster-1',
      type: 'NameGeneratorRoster',
      label: 'Roster',
      subject: { entity: 'node', type: 'person' },
      synthetic: { count: { distribution: 'constant', value: 4 } },
      dataSource: 'people.csv',
      prompts: [
        {
          id: 'p1',
          text: 'Kind zero',
          additionalAttributes: [{ variable: 'target', value: 0 }],
        },
        {
          id: 'p2',
          text: 'Kind one',
          additionalAttributes: [{ variable: 'target', value: 1 }],
        },
      ],
    });

    // The first prompt's row leaves `code` to the draw; the second's brings
    // one of the two values that draw can take.
    const rows = [
      {
        [entityPrimaryKeyProperty]: 'free-a',
        type: 'person',
        [entityAttributesProperty]: { kind: 0 },
      },
      {
        [entityPrimaryKeyProperty]: 'free-b',
        type: 'person',
        [entityAttributesProperty]: { kind: 0 },
      },
      // The two values a free draw hands out first, carried by the rows only
      // the second prompt can use.
      {
        [entityPrimaryKeyProperty]: 'coded-a',
        type: 'person',
        [entityAttributesProperty]: { kind: 1, code: 0 },
      },
      {
        [entityPrimaryKeyProperty]: 'coded-b',
        type: 'person',
        [entityAttributesProperty]: { kind: 1, code: 1 },
      },
    ] as unknown as NcNode[];

    // Several seeds, because the row order decides whether a saved row is
    // ever passed over at all.
    for (let seed = 1; seed <= 12; seed++) {
      const result = plan(codebook, [twoPrompts, alterForm('code')], {
        seed,
        externalData: { 'roster-1': rows },
      });
      expect(result.nodes, `seed ${seed}`).toHaveLength(4);
    }
  });

  it('gives each prompt first refusal on the rows matched to it', () => {
    // Prompt 0 can use either row and prompt 1 only `a`, so the matcher gives
    // `b` to 0 and `a` to 1. Flattened into one ordering for the stage, the
    // draw could still present `a` first and let prompt 0 consume it, leaving
    // prompt 1 to reject `b` — a satisfiable count coming up short on the
    // seeds where the shuffle happened to lead with `a`.
    const codebook = {
      node: {
        person: {
          name: 'Person',
          variables: {
            kind: { name: 'Kind', type: 'number' },
            target: {
              name: 'Target',
              type: 'number',
              validation: { sameAs: 'kind' },
            },
          },
        },
      },
      edge: {},
      ego: { variables: {} },
    } as unknown as StructuralCodebook;

    const asymmetric = stage({
      id: 'roster-1',
      type: 'NameGeneratorRoster',
      label: 'Roster',
      subject: { entity: 'node', type: 'person' },
      synthetic: { count: { distribution: 'constant', value: 2 } },
      dataSource: 'people.csv',
      prompts: [
        // Fixes nothing, so it can use either row.
        { id: 'p1', text: 'Anyone' },
        {
          id: 'p2',
          text: 'Kind one only',
          additionalAttributes: [{ variable: 'target', value: 1 }],
        },
      ],
    });

    const rows = [
      {
        [entityPrimaryKeyProperty]: 'a',
        type: 'person',
        [entityAttributesProperty]: { kind: 1 },
      },
      {
        [entityPrimaryKeyProperty]: 'b',
        type: 'person',
        [entityAttributesProperty]: { kind: 0 },
      },
    ] as unknown as NcNode[];

    // Several seeds, because the shuffle decides which row the open prompt
    // meets first.
    for (let seed = 1; seed <= 12; seed++) {
      const result = plan(codebook, [asymmetric], {
        seed,
        externalData: { 'roster-1': rows },
      });
      expect(result.nodes, `seed ${seed}`).toHaveLength(2);
    }
  });

  it('refuses a roster that cannot reach an undeclared stage minimum', () => {
    // No `synthetic.count`, so the generic 1-8 fallback is what was trimmed —
    // but `behaviours.minNodes` is something the author wrote and the
    // interface holds the participant to. Trimming past it generated two
    // people for a stage set to a minimum of five and said nothing.
    const rosterWithMinimum = stage({
      id: 'roster-1',
      type: 'NameGeneratorRoster',
      label: 'Roster',
      subject: { entity: 'node', type: 'person' },
      behaviours: { minNodes: 5 },
      dataSource: 'people.csv',
      prompts: [{ id: 'p1', text: 'Pick' }],
    });
    expect(() =>
      plan(baseCodebook(), [rosterWithMinimum], {
        externalData: { 'roster-1': [row('r1', 'Ada'), row('r2', 'Grace')] },
      }),
    ).toThrow(
      /roster does not hold enough people for the stages drawing from it/,
    );
  });

  it('still trims the fallback down to the minimum it can reach', () => {
    // Above the stage's own minimum the fallback gives way as before: the
    // roster is short of what the default asked for, not of what the author
    // wrote.
    const rosterWithMinimum = stage({
      id: 'roster-1',
      type: 'NameGeneratorRoster',
      label: 'Roster',
      subject: { entity: 'node', type: 'person' },
      behaviours: { minNodes: 2 },
      dataSource: 'people.csv',
      prompts: [{ id: 'p1', text: 'Pick' }],
    });
    const result = plan(baseCodebook(), [rosterWithMinimum], {
      externalData: { 'roster-1': [row('r1', 'Ada'), row('r2', 'Grace')] },
    });
    expect(result.nodes).toHaveLength(2);
  });

  it('fabricates when no roster is known', () => {
    const result = plan(baseCodebook(), [rosterStage(3)]);
    expect(result.nodes).toHaveLength(3);
  });

  // A roster is allowed to be as large as the population cap, and Architect
  // opens a preview on the main thread. Reasoning about the assignment a row
  // at a time is cubic in the roster: these two cases took 11.7s at two
  // thousand rows and are minutes at five, against single-figure milliseconds
  // for the stage-at-a-time assignment they now get. The timeout is the
  // assertion — it is an order of magnitude clear of the honest figure and
  // two orders inside the pathological one.
  const manyRows = (count: number) =>
    Array.from({ length: count }, (_unused, index) =>
      row(`r${index}`, `Person ${index}`),
    );

  it(
    'places a large uncontested roster without searching it',
    { timeout: 10_000 },
    () => {
      const result = plan(baseCodebook(), [rosterStage(5_000)], {
        externalData: { 'roster-1': manyRows(5_000) },
      });
      expect(result.nodes).toHaveLength(5_000);
      expect(new Set(result.nodes.map((node) => node.uid)).size).toBe(5_000);
    },
  );

  it(
    'shares a large contested roster between its stages',
    { timeout: 10_000 },
    () => {
      const shared = manyRows(5_000);
      const second = stage({
        id: 'roster-2',
        type: 'NameGeneratorRoster',
        label: 'Roster two',
        subject: { entity: 'node', type: 'person' },
        synthetic: { count: { distribution: 'constant', value: 2_500 } },
        dataSource: 'people.csv',
        prompts: [{ id: 'p1', text: 'Pick' }],
      });
      const result = plan(baseCodebook(), [rosterStage(2_500), second], {
        externalData: { 'roster-1': shared, 'roster-2': shared },
      });
      expect(result.nodes).toHaveLength(5_000);
      // Every row is spent once: the two stages never draw the same person.
      expect(new Set(result.nodes.map((node) => node.uid)).size).toBe(5_000);
    },
  );
});

describe('planNetwork settling a creator against ego', () => {
  // The guard reads an attribute a LATER form collects, so at the creator's
  // own point in the interview ego has not answered it. Settling the guard
  // against the ego this plan finally drew removed a creator the session then
  // reaches with nothing planned to introduce.
  const codebookWithConsent = (): StructuralCodebook =>
    ({
      node: {
        person: {
          name: 'Person',
          variables: { name: { name: 'N', type: 'text' } },
        },
      },
      edge: {},
      ego: {
        variables: {
          consent: {
            name: 'Consent',
            type: 'boolean',
            synthetic: { probabilityTrue: 1 },
          },
        },
      },
    }) as unknown as StructuralCodebook;

  const guardedGenerator = nameGenerator(
    {
      skipLogic: {
        action: 'SKIP',
        filter: {
          rules: [
            {
              id: 'consented',
              type: 'ego',
              options: {
                attribute: 'consent',
                operator: 'EXACTLY',
                value: true,
              },
            },
          ],
        },
      },
    },
    4,
  );

  const egoForm = stage({
    id: 'ego-form',
    type: 'EgoForm',
    label: 'About you',
    introductionPanel: { title: 't', text: 'x' },
    form: { fields: [{ variable: 'consent', prompt: 'Consent?' }] },
  });

  it('leaves a creator standing before the form that answers its guard', () => {
    const result = plan(codebookWithConsent(), [guardedGenerator, egoForm], {
      respectSkipLogicAndFiltering: true,
    });
    expect(result.ego.attributes.consent).toBe(true);
    expect(result.nodes).toHaveLength(4);
  });

  it("carries a settled guard's destination over the stages between", () => {
    // The guard does not only remove its own stage: its destination makes the
    // session jump, and the walk jumps with it. Judged stage by stage, the
    // creators in between stayed planned — their people spending values and
    // joining later filters — for a session that never reaches them.
    const guardWithDestination = stage({
      id: 'guarded',
      type: 'NameGeneratorQuickAdd',
      label: 'Guarded',
      subject: { entity: 'node', type: 'person' },
      quickAdd: 'name',
      synthetic: { count: { distribution: 'constant', value: 3 } },
      prompts: [{ id: 'g-p1', text: 'Who?' }],
      skipLogic: {
        action: 'SKIP',
        destination: { type: 'stage', stageId: 'after' },
        filter: {
          rules: [
            {
              id: 'consented',
              type: 'ego',
              options: {
                attribute: 'consent',
                operator: 'EXACTLY',
                value: true,
              },
            },
          ],
        },
      },
    });

    const jumpedOver = stage({
      id: 'jumped',
      type: 'NameGeneratorQuickAdd',
      label: 'Jumped over',
      subject: { entity: 'node', type: 'person' },
      quickAdd: 'name',
      synthetic: { count: { distribution: 'constant', value: 5 } },
      prompts: [{ id: 'j-p1', text: 'Who?' }],
    });

    const after = stage({
      id: 'after',
      type: 'NameGeneratorQuickAdd',
      label: 'After',
      subject: { entity: 'node', type: 'person' },
      quickAdd: 'name',
      synthetic: { count: { distribution: 'constant', value: 2 } },
      prompts: [{ id: 'a-p1', text: 'Who?' }],
    });

    const result = plan(
      codebookWithConsent(),
      [egoForm, guardWithDestination, jumpedOver, after],
      { respectSkipLogicAndFiltering: true },
    );

    expect(result.ego.attributes.consent).toBe(true);
    // Only the destination's own two people: the guarded stage is skipped and
    // the stage it jumps over is never reached.
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes.every((node) => node.creationStageIndex === 3)).toBe(
      true,
    );
  });

  it('still settles a creator that follows it', () => {
    // Same guard, same draw — only the order changes. Here the form HAS run,
    // so the guard is decidable and the creator really is skipped.
    const result = plan(codebookWithConsent(), [egoForm, guardedGenerator], {
      respectSkipLogicAndFiltering: true,
    });
    expect(result.ego.attributes.consent).toBe(true);
    expect(result.nodes).toHaveLength(0);
  });
});

describe('planNetwork settling an edge creator against ego', () => {
  // The node pass drops a creator an all-ego guard settles as skipped. The
  // edge pass read every creation regardless, so a skipped stage's topology
  // edges stayed planned — and where a later reachable stage creates the same
  // type, the walk retried them and emitted them.
  const codebookWithConsent = (): StructuralCodebook =>
    ({
      node: {
        person: {
          name: 'Person',
          variables: { name: { name: 'N', type: 'text' } },
        },
      },
      edge: { knows: { name: 'Knows', variables: {} } },
      ego: {
        variables: {
          consent: {
            name: 'Consent',
            type: 'boolean',
            synthetic: { probabilityTrue: 1 },
          },
        },
      },
    }) as unknown as StructuralCodebook;

  const guardedSociogram = stage({
    id: 'sociogram',
    type: 'Sociogram',
    label: 'Map',
    subject: { entity: 'node', type: 'person' },
    synthetic: {
      topology: {
        metric: 'density',
        distribution: { distribution: 'constant', value: 1 },
      },
    },
    behaviours: { freeDraw: true },
    background: { concentricCircles: 3, skewedTowardCenter: true },
    prompts: [{ id: 'sg-p1', text: 'Link', edges: { create: 'knows' } }],
    skipLogic: {
      action: 'SKIP',
      filter: {
        rules: [
          {
            id: 'consented',
            type: 'ego',
            options: { attribute: 'consent', operator: 'EXACTLY', value: true },
          },
        ],
      },
    },
  });

  const quietCensus = stage({
    id: 'census',
    type: 'DyadCensus',
    label: 'Census',
    subject: { entity: 'node', type: 'person' },
    introductionPanel: { title: 't', text: 'x' },
    synthetic: {
      topology: {
        metric: 'density',
        distribution: { distribution: 'constant', value: 0 },
      },
    },
    prompts: [{ id: 'c-p1', text: 'Know?', createEdge: 'knows' }],
  });

  const egoForm = stage({
    id: 'ego-form',
    type: 'EgoForm',
    label: 'About you',
    introductionPanel: { title: 't', text: 'x' },
    form: { fields: [{ variable: 'consent', prompt: 'Consent?' }] },
  });

  it('plans no edges for a creator its guard settles as skipped', () => {
    const result = plan(
      codebookWithConsent(),
      [egoForm, nameGenerator({}, 4), guardedSociogram, quietCensus],
      { respectSkipLogicAndFiltering: true },
    );
    expect(result.ego.attributes.consent).toBe(true);
    expect(result.nodes).toHaveLength(4);
    // The census asked for none, and the skipped sociogram is not there to
    // ask for any.
    expect(result.edges).toHaveLength(0);
  });

  it('still plans them for a creator the guard leaves standing', () => {
    const standing = stage({
      ...(guardedSociogram as unknown as Record<string, unknown>),
      skipLogic: undefined,
    });
    const result = plan(
      codebookWithConsent(),
      [egoForm, nameGenerator({}, 4), standing, quietCensus],
      { respectSkipLogicAndFiltering: true },
    );
    expect(result.edges.length).toBeGreaterThan(0);
  });
});

describe('planNetwork projecting a filtered write', () => {
  // A variable first written by a FILTERED stage does not reach the entities
  // that stage excluded. Projected from that stage's index for the whole
  // population, those entities appeared to hold the value to a following
  // filtered stage, which then planned same-stage edges for subjects the live
  // session excludes — and materialisation does not recheck them.
  it('shows it only once a writer that reaches everyone has run', () => {
    const codebook = {
      node: {
        person: {
          name: 'Person',
          variables: {
            name: { name: 'N', type: 'text' },
            flag: {
              name: 'Flag',
              type: 'boolean',
              synthetic: { probabilityTrue: 1 },
            },
          },
        },
      },
      edge: { knows: { name: 'Knows', variables: {} } },
      ego: { variables: {} },
    } as unknown as StructuralCodebook;

    const onlyFlagged = {
      join: 'AND',
      rules: [
        {
          id: 'flagged',
          type: 'node',
          options: {
            type: 'person',
            attribute: 'flag',
            operator: 'EXACTLY',
            value: true,
          },
        },
      ],
    };

    // Writes `flag`, but only onto the people it admits — and it admits none,
    // because nobody carries the flag when it runs.
    const filteredForm = stage({
      id: 'filtered-form',
      type: 'AlterForm',
      label: 'Filtered',
      subject: { entity: 'node', type: 'person' },
      form: { fields: [{ variable: 'flag', prompt: 'Flag?' }] },
      filter: onlyFlagged,
    });

    // Reads `flag` behind the same filter, at density 1.
    const filteredCensus = stage({
      id: 'filtered-census',
      type: 'DyadCensus',
      label: 'Census',
      subject: { entity: 'node', type: 'person' },
      introductionPanel: { title: 't', text: 'x' },
      synthetic: {
        topology: {
          metric: 'density',
          distribution: { distribution: 'constant', value: 1 },
        },
      },
      prompts: [{ id: 'c-p1', text: 'Know?', createEdge: 'knows' }],
      filter: onlyFlagged,
    });

    // Written unconditionally LATER, which is what makes the plan draw it at
    // all — and what makes the projection question live.
    const laterForm = stage({
      id: 'later-form',
      type: 'AlterForm',
      label: 'Everyone',
      subject: { entity: 'node', type: 'person' },
      form: { fields: [{ variable: 'flag', prompt: 'Flag?' }] },
    });

    const result = plan(
      codebook,
      [nameGenerator({}, 4), filteredForm, filteredCensus, laterForm],
      { respectSkipLogicAndFiltering: true },
    );

    expect(result.nodes).toHaveLength(4);
    // Nobody is flagged when the census runs, so it has no subjects and plans
    // no edges. Reading the filtered write as population-wide gave it all four
    // and planned every pair.
    expect(result.edges).toHaveLength(0);
  });
});

describe('planNetwork masking a jumped-over stage', () => {
  // A settled guard's destination removes the stages between, and removing
  // them from the CREATIONS is only half of it: their writes stayed in the
  // indexes, so a jumped-over form still made its variable part of every
  // entity's plan and visible to a later filtered stage.
  it('hides the writes of a stage its guard jumps over', () => {
    const codebook = {
      node: {
        person: {
          name: 'Person',
          variables: {
            name: { name: 'N', type: 'text' },
            flag: {
              name: 'Flag',
              type: 'boolean',
              synthetic: { probabilityTrue: 1 },
            },
          },
        },
      },
      edge: { knows: { name: 'Knows', variables: {} } },
      ego: {
        variables: {
          consent: {
            name: 'Consent',
            type: 'boolean',
            synthetic: { probabilityTrue: 1 },
          },
        },
      },
    } as unknown as StructuralCodebook;

    const egoForm = stage({
      id: 'ego-form',
      type: 'EgoForm',
      label: 'About you',
      introductionPanel: { title: 't', text: 'x' },
      form: { fields: [{ variable: 'consent', prompt: 'Consent?' }] },
    });

    const people = nameGenerator({}, 4);

    // Skipped, jumping over the form that would have written `flag`.
    const guarded = stage({
      id: 'guarded',
      type: 'Information',
      label: 'Guarded',
      title: 'Guarded',
      items: [],
      skipLogic: {
        action: 'SKIP',
        destination: { type: 'stage', stageId: 'census' },
        filter: {
          rules: [
            {
              id: 'consented',
              type: 'ego',
              options: {
                attribute: 'consent',
                operator: 'EXACTLY',
                value: true,
              },
            },
          ],
        },
      },
    });

    const jumpedForm = stage({
      id: 'jumped-form',
      type: 'AlterForm',
      label: 'Never reached',
      subject: { entity: 'node', type: 'person' },
      form: { fields: [{ variable: 'flag', prompt: 'Flag?' }] },
    });

    const flaggedCensus = stage({
      id: 'census',
      type: 'DyadCensus',
      label: 'Census',
      subject: { entity: 'node', type: 'person' },
      introductionPanel: { title: 't', text: 'x' },
      synthetic: {
        topology: {
          metric: 'density',
          distribution: { distribution: 'constant', value: 1 },
        },
      },
      prompts: [{ id: 'c-p1', text: 'Know?', createEdge: 'knows' }],
      filter: {
        join: 'AND',
        rules: [
          {
            id: 'flagged',
            type: 'node',
            options: {
              type: 'person',
              attribute: 'flag',
              operator: 'EXACTLY',
              value: true,
            },
          },
        ],
      },
    });

    const result = plan(
      codebook,
      [egoForm, people, guarded, jumpedForm, flaggedCensus],
      { respectSkipLogicAndFiltering: true },
    );

    expect(result.nodes).toHaveLength(4);
    // The form that would have answered `flag` is never reached, so nobody
    // carries it and the census has no subjects.
    expect(result.edges).toHaveLength(0);
  });
});

describe('planNetwork topology targets', () => {
  // A stage declares one topology, so a census whose prompts all create the
  // same edge type has one target between them however many prompts it has.
  const census = (promptCount: number): Stage =>
    stage({
      id: 'census',
      type: 'DyadCensus',
      label: 'Census',
      subject: { entity: 'node', type: 'person' },
      introductionPanel: { title: 't', text: 'x' },
      synthetic: {
        topology: {
          metric: 'density',
          // Wide enough that a second draw from the same stream is a visibly
          // different density.
          distribution: { distribution: 'uniform', min: 0, max: 1 },
        },
      },
      prompts: Array.from({ length: promptCount }, (_unused, index) => ({
        id: `p${index + 1}`,
        text: 'Know?',
        createEdge: 'knows',
      })),
    });

  const targetOf = (promptCount: number) => {
    const codebook = withPairEdgeType(baseCodebook(), 'knows');
    const result = plan(codebook, [nameGenerator({}, 6), census(promptCount)]);
    expect(result.topologyTargets.size).toBe(1);
    return [...result.topologyTargets.values()][0]!.value;
  };

  it('draws one target per stage and edge type, not per prompt', () => {
    // Duplicating a prompt moves neither the declared topology nor the
    // eligible domain, so it must not move the density either.
    expect(targetOf(3)).toBe(targetOf(1));
  });
});

describe('planNetwork missingness', () => {
  it('nulls variables with certain missingness and records them', () => {
    const result = plan(
      baseCodebook({
        hobby: {
          name: 'Hobby',
          type: 'text',
          synthetic: { generator: 'occupation', missingProbability: 1 },
        },
      }),
      [nameGenerator({}, 3), alterForm('hobby')],
    );
    for (const node of result.nodes) {
      expect(node.attributes.hobby).toBeUndefined();
      expect(node.missing.has('hobby')).toBe(true);
      expect(node.attributes.name).toBeDefined();
    }
  });
});

describe('planNetwork edges', () => {
  // Topology is declared by the stage that creates the edges, so the census
  // carries it rather than the edge type.
  const censusStage = (
    createEdge: string,
    topology?: Record<string, unknown>,
  ) =>
    stage({
      id: `census-${createEdge}`,
      type: 'DyadCensus',
      label: 'Census',
      subject: { entity: 'node', type: 'person' },
      introductionPanel: { title: 't', text: 'x' },
      ...(topology ? { synthetic: { topology } } : {}),
      prompts: [{ id: 'p1', text: 'Know?', createEdge }],
    });

  const withEdgeType = (
    codebook: StructuralCodebook,
    type: string,
  ): StructuralCodebook =>
    ({
      ...codebook,
      edge: { [type]: { name: type, variables: {} } },
    }) as unknown as StructuralCodebook;

  it('links every eligible pair at density 1 and none at density 0', () => {
    const codebook = withEdgeType(baseCodebook(), 'knows');
    const census = (value: number) =>
      censusStage('knows', {
        metric: 'density',
        distribution: { distribution: 'constant', value },
      });
    const full = plan(codebook, [nameGenerator({}, 5), census(1)]);
    expect(full.edges).toHaveLength(10); // C(5,2)
    const empty = plan(codebook, [nameGenerator({}, 5), census(0)]);
    expect(empty.edges).toHaveLength(0);
  });

  it('targets round(meanDegree × nodes / 2) edges', () => {
    const codebook = withEdgeType(baseCodebook(), 'knows');
    const result = plan(codebook, [
      nameGenerator({}, 6),
      censusStage('knows', {
        metric: 'meanDegree',
        distribution: { distribution: 'constant', value: 3 },
      }),
    ]);
    expect(result.edges).toHaveLength(9); // 3 × 6 / 2
    for (const edge of result.edges) {
      expect(edge.from).not.toBe(edge.to);
      expect(edge.creationStageIndex).toBe(1);
    }
  });

  it('stamps an edge with the stage that selected it', () => {
    // Two censuses over one edge type: the first wants none, the second wants
    // every pair. The pairs enter the domain at the FIRST census, so stamping
    // where a pair entered would materialise these edges a stage early —
    // changing what later filters, skip logic and census answers see.
    const codebook = withEdgeType(baseCodebook(), 'knows');
    const result = plan(codebook, [
      nameGenerator({}, 3),
      censusStage('knows', {
        metric: 'density',
        distribution: { distribution: 'constant', value: 0 },
      }),
      stage({
        ...censusStage('knows', {
          metric: 'density',
          distribution: { distribution: 'constant', value: 1 },
        }),
        id: 'census-late',
      }),
    ]);

    expect(result.edges).toHaveLength(3); // C(3, 2)
    for (const edge of result.edges) {
      expect(edge.creationStageIndex).toBe(2);
    }
  });

  it("measures each stage topology over that stage's eligible domain", () => {
    const codebook = withEdgeType(
      baseCodebook({ group: { name: 'Group', type: 'boolean' } }),
      'knows',
    );
    const groupCreator = (id: string, value: boolean) =>
      nameGenerator(
        {
          id,
          prompts: [
            {
              id: `${id}-p`,
              text: 'Who?',
              additionalAttributes: [{ variable: 'group', value }],
            },
          ],
        },
        3,
      );
    const groupCensus = (id: string, value: boolean, density: number) =>
      stage({
        id,
        type: 'DyadCensus',
        label: id,
        subject: { entity: 'node', type: 'person' },
        introductionPanel: { title: 't', text: 'x' },
        synthetic: {
          topology: {
            metric: 'density',
            distribution: { distribution: 'constant', value: density },
          },
        },
        filter: {
          join: 'AND',
          rules: [
            {
              id: `${id}-filter`,
              type: 'node',
              options: {
                type: 'person',
                attribute: 'group',
                operator: 'EXACTLY',
                value,
              },
            },
          ],
        },
        prompts: [{ id: `${id}-p`, text: 'Know?', createEdge: 'knows' }],
      });

    const result = plan(
      codebook,
      [
        groupCreator('group-a', true),
        groupCreator('group-b', false),
        groupCensus('census-a', true, 1),
        groupCensus('census-b', false, 0.5),
      ],
      { respectSkipLogicAndFiltering: true },
    );

    const byGroup = new Map(
      result.nodes.map((node) => [node.uid, node.attributes.group]),
    );
    const edgesFor = (value: boolean) =>
      result.edges.filter(
        (edge) =>
          byGroup.get(edge.from) === value && byGroup.get(edge.to) === value,
      );

    expect(edgesFor(true)).toHaveLength(3);
    expect(edgesFor(false)).toHaveLength(2);
  });

  it('defaults an edge type with no creating stage to no edges', () => {
    const codebook = withEdgeType(baseCodebook(), 'knows');
    const result = plan(codebook, [nameGenerator({}, 5)]);
    expect(result.edges).toHaveLength(0);
  });
});

describe('planNetwork pedigree structure', () => {
  const pedigreeStage = stage({
    id: 'ped',
    type: 'FamilyPedigree',
    label: 'Family',
    nodeConfig: {
      type: 'family_member',
      nodeLabelVariable: 'label',
      egoVariable: 'is_ego',
      relationshipVariable: 'relationship',
      biologicalSexVariable: 'sex',
    },
    edgeConfig: {
      type: 'family_link',
      relationshipTypeVariable: 'link_type',
      isActiveVariable: 'active',
      isGestationalCarrierVariable: 'carrier',
      gameteRoleVariable: 'gamete',
    },
    framing: { mode: 'fixed', value: 'inclusive' },
    boundaries: {
      requireGrandparents: 'off',
      requireChildrenContributors: 'off',
    },
    censusPrompt: 'Add your family.',
  });

  const pedigreeCodebook = {
    node: {
      family_member: {
        name: 'Family member',
        synthetic: { count: { distribution: 'constant', value: 5 } },
        variables: {
          label: { name: 'Label', type: 'text' },
          is_ego: { name: 'Is_Ego', type: 'boolean' },
          relationship: { name: 'Relationship', type: 'text' },
          sex: { name: 'Sex', type: 'text' },
        },
      },
    },
    edge: {
      family_link: {
        name: 'Family link',
        variables: {
          link_type: {
            name: 'Link_Type',
            type: 'categorical',
            options: [
              { label: 'Biological', value: 'biological' },
              { label: 'Adoptive', value: 'adoptive' },
            ],
          },
          active: { name: 'Active', type: 'boolean' },
        },
      },
    },
    ego: { variables: {} },
  } as unknown as StructuralCodebook;

  it('leaves a pedigree entirely to its own generator', () => {
    // A family is a structure, not a population: its people have to satisfy
    // each other — two genetic parents each, consistent sexes, an inheritance
    // pattern the diseases follow — which the specialist generator settles as
    // a whole at materialisation. Planning people for it here would produce a
    // second, contradictory family.
    const result = plan(pedigreeCodebook, [pedigreeStage]);

    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });
});

describe('planNetwork determinism', () => {
  const snapshot = (result: ReturnType<typeof plan>) =>
    JSON.stringify({
      ego: result.ego.attributes,
      nodes: result.nodes.map((node) => ({
        uid: node.uid,
        attributes: node.attributes,
        stage: node.creationStageIndex,
      })),
      edges: result.edges.map((edge) => ({
        uid: edge.uid,
        from: edge.from,
        to: edge.to,
      })),
    });

  it('replays the identical plan for the same seed', () => {
    const build = () =>
      plan(baseCodebook(), [nameGenerator({}, 5)], { seed: 7 });
    expect(snapshot(build())).toEqual(snapshot(build()));
  });

  it('differs across seeds', () => {
    const build = (seed: number) =>
      plan(baseCodebook(), [nameGenerator({}, 5)], { seed });
    expect(snapshot(build(1))).not.toEqual(snapshot(build(2)));
  });

  it('keeps a variable unperturbed when an unrelated variable is added', () => {
    const withoutExtra = plan(baseCodebook(), [nameGenerator({}, 4)], {
      seed: 11,
    });
    const withExtra = plan(
      baseCodebook({
        unrelated: {
          name: 'Unrelated',
          type: 'number',
          synthetic: { distribution: 'uniform', min: 0, max: 100 },
        },
      }),
      [nameGenerator({}, 4)],
      { seed: 11 },
    );
    expect(withExtra.nodes.map((node) => node.attributes.age)).toEqual(
      withoutExtra.nodes.map((node) => node.attributes.age),
    );
    expect(withExtra.nodes.map((node) => node.attributes.name)).toEqual(
      withoutExtra.nodes.map((node) => node.attributes.name),
    );
  });
});
