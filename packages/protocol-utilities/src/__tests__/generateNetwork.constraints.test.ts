import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { generateNetwork } from '../generateNetwork';
import { SyntheticDataConstraintError } from '../generateNetwork/constraints/error';

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

const nameGeneratorStage = {
  id: 'stage-1',
  type: 'NameGenerator',
  label: 'Name generator',
  subject: { entity: 'node', type: 'person' },
  prompts: [{ id: 'p1', text: 'Name people' }],
  behaviours: { minNodes: 5, maxNodes: 5 },
} as unknown as Stage;

const egoFormStage = {
  id: 'stage-ego',
  type: 'EgoForm',
  label: 'About you',
  form: {
    fields: [
      { variable: 'a', prompt: 'A' },
      { variable: 'b', prompt: 'B' },
    ],
  },
} as unknown as Stage;

/** A person node type carrying the given variables, as `person`. */
function personCodebook(variables: Record<string, unknown>): Codebook {
  return {
    node: {
      person: {
        color: 'node-color-seq-1',
        variables,
      },
    },
  } as unknown as Codebook;
}

/** An ego codebook, with a form listing every one of its variables. */
function egoProtocol(variables: Record<string, unknown>): {
  codebook: Codebook;
  stages: Stage[];
} {
  return {
    codebook: { ego: { variables } } as unknown as Codebook,
    stages: [
      {
        id: 'stage-ego',
        type: 'EgoForm',
        label: 'About you',
        form: {
          fields: Object.keys(variables).map((variable) => ({ variable })),
        },
      } as unknown as Stage,
    ],
  };
}

/** Two ordinals held equal, each offering only the values it is given. */
function heldEqualOrdinals(a: number[], b: number[]): Record<string, unknown> {
  const options = (values: number[]) =>
    values.map((value) => ({ label: `Option ${value}`, value }));

  return {
    a: { name: 'Rating A', type: 'ordinal', options: options(a) },
    b: {
      name: 'Rating B',
      type: 'ordinal',
      options: options(b),
      validation: { sameAs: 'a' },
    },
  };
}

describe('generateNetwork constraint conformance', () => {
  it('holds two ego variables equal when one declares sameAs the other', () => {
    const { network } = generateNetwork({
      seed: 3,
      codebook: {
        ego: {
          variables: {
            a: {
              name: 'A',
              type: 'text',
              validation: { required: true, minLength: 24, maxLength: 24 },
            },
            b: {
              name: 'B',
              type: 'text',
              validation: {
                required: true,
                minLength: 24,
                maxLength: 24,
                sameAs: 'a',
              },
            },
          },
        },
      } as unknown as Codebook,
      stages: [egoFormStage],
    });

    const ego = network.ego?.[entityAttributesProperty] ?? {};
    expect(String(ego.a)).toHaveLength(24);
    expect(ego.b).toBe(ego.a);
  });

  it('issues a distinct value to every node of a unique variable', () => {
    const { network } = generateNetwork({
      seed: 3,
      codebook: personCodebook({
        code: {
          name: 'Code',
          type: 'text',
          validation: { unique: true, minLength: 4, maxLength: 4 },
        },
      }),
      stages: [nameGeneratorStage],
    });

    const codes = network.nodes.map(
      (node) => node[entityAttributesProperty].code,
    );
    expect(codes).toHaveLength(5);
    expect(codes.every((code) => String(code).length === 4)).toBe(true);
    expect(new Set(codes).size).toBe(5);
  });

  it('throws before generating when a protocol is unsatisfiable', () => {
    expect(() =>
      generateNetwork({
        seed: 3,
        codebook: personCodebook({
          code: {
            name: 'Code',
            type: 'text',
            validation: { minLength: 24, maxLength: 10 },
          },
        }),
        stages: [nameGeneratorStage],
      }),
    ).toThrow(SyntheticDataConstraintError);
  });

  it('throws when a sameAs pair shares no option value, naming what each offers', () => {
    const build = () =>
      generateNetwork({
        seed: 3,
        ...egoProtocol(heldEqualOrdinals([1, 2], [3, 4])),
      });

    expect(build).toThrow(SyntheticDataConstraintError);
    expect(build).toThrow(
      'the options offered by "Rating A" (1, 2) and by "Rating B" (3, 4) have no value in common',
    );
  });

  it('throws identically regardless of seed', () => {
    const build = (seed: number) => () =>
      generateNetwork({
        seed,
        codebook: personCodebook({
          band: {
            name: 'Band',
            type: 'ordinal',
            options: [
              { label: 'A', value: 1 },
              { label: 'B', value: 2 },
            ],
            validation: { unique: true },
          },
        }),
        stages: [nameGeneratorStage],
      });

    for (const seed of [1, 2, 3, 4, 5]) {
      expect(build(seed)).toThrow(SyntheticDataConstraintError);
    }
  });

  it('keeps AlterForm regeneration consistent with untouched attributes', () => {
    const { network } = generateNetwork({
      seed: 3,
      codebook: personCodebook({
        low: {
          name: 'Low',
          type: 'number',
          validation: { minValue: 0, maxValue: 50 },
        },
        high: {
          name: 'High',
          type: 'number',
          validation: {
            minValue: 0,
            maxValue: 100,
            greaterThanVariable: 'low',
          },
        },
      }),
      stages: [
        nameGeneratorStage,
        {
          id: 'stage-alter',
          type: 'AlterForm',
          label: 'Alter form',
          subject: { entity: 'node', type: 'person' },
          form: { fields: [{ variable: 'high', prompt: 'High' }] },
        } as unknown as Stage,
      ],
    });

    expect(network.nodes).toHaveLength(5);
    for (const node of network.nodes) {
      const attrs = node[entityAttributesProperty];
      expect(Number(attrs.high)).toBeGreaterThan(Number(attrs.low));
    }
  });

  it('regenerates a unique variable whose value space exactly fits the node count', () => {
    // Five distinct values for five nodes is exactly satisfiable, so
    // feasibility accepts it. The AlterForm then rewrites a value each node
    // already holds: unless the slot that value took is given back, the
    // registry believes all five are spoken for and the first regeneration
    // runs out of values.
    const values = [1, 2, 3, 4, 5];
    const { network } = generateNetwork({
      seed: 3,
      codebook: personCodebook({
        band: {
          name: 'Band',
          type: 'ordinal',
          options: values.map((value) => ({ label: `Band ${value}`, value })),
          validation: { unique: true },
        },
      }),
      stages: [
        nameGeneratorStage,
        {
          id: 'stage-alter',
          type: 'AlterForm',
          label: 'Alter form',
          subject: { entity: 'node', type: 'person' },
          form: { fields: [{ variable: 'band', prompt: 'Band' }] },
        } as unknown as Stage,
      ],
    });

    const bands = network.nodes.map(
      (node) => node[entityAttributesProperty].band,
    );
    expect(bands).toHaveLength(5);
    expect(new Set(bands).size).toBe(5);
    expect(bands.every((band) => values.includes(Number(band)))).toBe(true);
  });

  // The schema requires an ordinal to offer two options but not two values, so
  // an imported protocol can write one value under many labels. Feasibility
  // counts the values and calls each of these satisfiable; a draw that walked
  // the entries instead would meet a repeated value once per entry, exhaust the
  // redraw budget before the sequence reached the next value, and refuse a
  // protocol the same analysis had just accepted.
  it.each([
    {
      shape: 'writes one value twenty times before another',
      values: [...Array.from({ length: 20 }, () => 1), 2],
      distinct: [1, 2],
    },
    {
      shape: 'buries each of three values behind ten repeats',
      values: [
        ...Array.from({ length: 10 }, () => 1),
        ...Array.from({ length: 10 }, () => 2),
        3,
      ],
      distinct: [1, 2, 3],
    },
  ])(
    'issues every value of an option list that $shape',
    ({ values, distinct }) => {
      const options = values.map((value, at) => ({
        label: `Band ${at + 1}`,
        value,
      }));

      for (const seed of [1, 2, 3, 4, 5]) {
        const { network } = generateNetwork({
          seed,
          codebook: personCodebook({
            band: {
              name: 'Band',
              type: 'ordinal',
              options,
              validation: { unique: true },
            },
          }),
          stages: [
            {
              ...nameGeneratorStage,
              behaviours: {
                minNodes: distinct.length,
                maxNodes: distinct.length,
              },
            } as unknown as Stage,
          ],
        });

        const bands = network.nodes.map(
          (node) => node[entityAttributesProperty].band,
        );
        expect(bands).toHaveLength(distinct.length);
        expect(new Set(bands)).toEqual(new Set(distinct));
      }
    },
  );

  // The DatePicker writes `YYYY` from its year select, `YYYY-MM` from its
  // year/month pair and `YYYY-MM-DD` from its `type="date"` input; the
  // RelativeDatePicker writes `YYYY-MM-DD`. A value at any other resolution
  // fails the min/max validators, which compare these strings lexically.
  it.each([
    { type: undefined, pattern: /^\d{4}-\d{2}-\d{2}$/, label: 'full' },
    { type: 'month', pattern: /^\d{4}-\d{2}$/, label: 'month' },
    { type: 'year', pattern: /^\d{4}$/, label: 'year' },
  ])(
    'emits a $label date at the resolution its picker writes',
    ({ type, pattern }) => {
      const { network } = generateNetwork({
        seed: 3,
        codebook: personCodebook({
          born: {
            name: 'Born',
            type: 'datetime',
            component: 'DatePicker',
            ...(type !== undefined ? { parameters: { type } } : {}),
          },
        }),
        stages: [nameGeneratorStage],
      });

      expect(network.nodes).toHaveLength(5);
      for (const node of network.nodes) {
        expect(node[entityAttributesProperty].born).toMatch(pattern);
      }
    },
  );

  it('keeps a RelativeDatePicker value inside its default window', () => {
    const today = new Date().toISOString().slice(0, 10);
    const { network } = generateNetwork({
      seed: 3,
      config: { today },
      codebook: personCodebook({
        seen: {
          name: 'Seen',
          type: 'datetime',
          component: 'RelativeDatePicker',
        },
      }),
      stages: [nameGeneratorStage],
    });

    // RelativeDatePicker defaults to 180 days before the anchor and none after,
    // which useProtocolForm turns into hard min/max validators.
    const earliest = new Date(Date.parse(`${today}T00:00:00Z`));
    earliest.setUTCDate(earliest.getUTCDate() - 180);
    const min = earliest.toISOString().slice(0, 10);

    for (const node of network.nodes) {
      const seen = String(node[entityAttributesProperty].seen);
      expect(seen >= min && seen <= today).toBe(true);
    }
  });

  it('issues no unique value a roster row also carries, over 200 seeds', () => {
    // Five options for five nodes is exactly satisfiable, so feasibility
    // accepts it. One roster row carries the first option, and a name generator
    // with a roster panel draws that row at whichever node the seed lands it
    // on: a generated node issued the same option, or the value the drawn node
    // gave up left claimed behind it, shows up as a duplicate here.
    const values = [1, 2, 3, 4, 5];
    const codebook = personCodebook({
      band: {
        name: 'Band',
        type: 'ordinal',
        options: values.map((value) => ({ label: `Band ${value}`, value })),
        validation: { unique: true },
      },
    });
    const row = {
      [entityPrimaryKeyProperty]: 'roster-1',
      type: 'person',
      [entityAttributesProperty]: { band: 1 },
    } as unknown as NcNode;

    const failures: string[] = [];
    let drewTheRow = 0;

    for (let seed = 1; seed <= 200; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook,
        stages: [nameGeneratorStage],
        externalData: { 'stage-1': [row] },
      });
      const bands = network.nodes.map(
        (node) => node[entityAttributesProperty].band,
      );

      if (
        network.nodes.some(
          (node) => node[entityPrimaryKeyProperty] === 'roster-1',
        )
      ) {
        drewTheRow += 1;
      }

      complain(
        failures,
        bands.length === 5,
        () => `seed ${seed}: ${bands.length} nodes, not 5`,
      );
      complain(
        failures,
        new Set(bands).size === bands.length,
        () => `seed ${seed}: bands ${bands.join(', ')} repeat a unique value`,
      );
      complain(
        failures,
        bands.every((band) => values.includes(Number(band))),
        () => `seed ${seed}: bands ${bands.join(', ')} leave the option list`,
      );
    }

    expect(failures).toEqual([]);
    // The row is drawn on nearly every seed; a fixture where it never was would
    // assert nothing about the overwrite.
    expect(drewTheRow).toBeGreaterThan(150);
  });

  it('keeps a roster row’s unique value away from a later stage, over 200 seeds', () => {
    // A row's values are held back from draws only while the row is still
    // drawable. Once a roster stage has taken it the hold is given up, so the
    // value the row arrived carrying survives into the next stage only if it
    // was recorded as claimed. Two rows and three fabricated people fill the
    // five options exactly, which leaves a repeat nowhere to hide.
    const values = [1, 2, 3, 4, 5];
    const codebook = personCodebook({
      band: {
        name: 'Band',
        type: 'ordinal',
        options: values.map((value) => ({ label: `Band ${value}`, value })),
        validation: { unique: true },
      },
    });
    const rows = [1, 2].map(
      (band, index) =>
        ({
          [entityPrimaryKeyProperty]: `roster-${index}`,
          type: 'person',
          [entityAttributesProperty]: { band },
        }) as unknown as NcNode,
    );
    const stages = [
      {
        id: 'stage-roster',
        type: 'NameGeneratorRoster',
        label: 'Roster',
        subject: { entity: 'node', type: 'person' },
        prompts: [{ id: 'p1', text: 'Pick people' }],
        behaviours: { minNodes: 2, maxNodes: 2 },
      } as unknown as Stage,
      {
        id: 'stage-fabricate',
        type: 'NameGenerator',
        label: 'Name generator',
        subject: { entity: 'node', type: 'person' },
        prompts: [{ id: 'p2', text: 'Name more people' }],
        behaviours: { minNodes: 3, maxNodes: 3 },
      } as unknown as Stage,
    ];

    const failures: string[] = [];

    for (let seed = 1; seed <= 200; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook,
        stages,
        externalData: { 'stage-roster': rows.map((row) => ({ ...row })) },
      });
      const bands = network.nodes.map((node) =>
        Number(node[entityAttributesProperty].band),
      );

      complain(
        failures,
        bands.length === 5,
        () => `seed ${seed}: ${bands.length} nodes, not 5`,
      );
      complain(
        failures,
        new Set(bands).size === bands.length,
        () => `seed ${seed}: bands ${bands.join(', ')} repeat a unique value`,
      );
      complain(
        failures,
        bands.includes(1) && bands.includes(2),
        () => `seed ${seed}: bands ${bands.join(', ')} lost a roster value`,
      );
    }

    expect(failures).toEqual([]);
  });

  it('satisfies an edge comparison rule regenerated by AlterEdgeForm', () => {
    const { network } = generateNetwork({
      seed: 5,
      codebook: {
        node: {
          person: { color: 'node-color-seq-1', variables: {} },
        },
        edge: {
          knows: {
            color: 'edge-color-seq-1',
            variables: {
              since: {
                name: 'Since',
                type: 'number',
                validation: { minValue: 1980, maxValue: 2000 },
              },
              until: {
                name: 'Until',
                type: 'number',
                validation: {
                  minValue: 1980,
                  maxValue: 2020,
                  greaterThanVariable: 'since',
                },
              },
            },
          },
        },
      } as unknown as Codebook,
      stages: [
        nameGeneratorStage,
        {
          id: 'stage-dyad',
          type: 'DyadCensus',
          label: 'Dyad census',
          subject: { entity: 'node', type: 'person' },
          prompts: [{ id: 'p-dyad', text: 'Know?', createEdge: 'knows' }],
        } as unknown as Stage,
        {
          id: 'stage-alter-edge',
          type: 'AlterEdgeForm',
          label: 'Alter edge form',
          subject: { entity: 'edge', type: 'knows' },
          form: { fields: [{ variable: 'until', prompt: 'Until' }] },
        } as unknown as Stage,
      ],
    });

    expect(network.edges.length).toBeGreaterThan(0);
    for (const edge of network.edges) {
      const attrs = edge[entityAttributesProperty];
      expect(Number(attrs.until)).toBeGreaterThan(Number(attrs.since));
    }
  });
});

/** How many seeds each sweep below draws. */
const SEEDS = 500;

/**
 * Records a complaint when something a draw should satisfy does not hold.
 * Collecting them rather than asserting per draw makes one run report every
 * seed that breaks, instead of only the first.
 */
function complain(
  failures: string[],
  holds: boolean,
  complaint: () => string,
): void {
  if (!holds) failures.push(complaint());
}

/**
 * A scalar response is recorded on a normalised 0-1 scale the type never
 * declares: the schema accepts no `minValue`/`maxValue` on it. Every scalar
 * carrying a comparison rule therefore reaches generation with no rule-declared
 * bound, and the scale itself is the only thing keeping a chain of comparisons
 * inside a range the VisualAnalogScale slider can render.
 */
describe('scalar comparisons inside the normalised scale', () => {
  /** `s0 < s1 < ... < s(length - 1)`, as scalars declaring nothing else. */
  function ascendingScalars(length: number): Record<string, unknown> {
    const variables: Record<string, unknown> = {};

    for (let index = 0; index < length; index++) {
      variables[`s${index}`] = {
        name: `S${index}`,
        type: 'scalar',
        component: 'VisualAnalogScale',
        ...(index < length - 1
          ? { validation: { lessThanVariable: `s${index + 1}` } }
          : {}),
      };
    }

    return variables;
  }

  /** One seed's draw of the chain, in declaration order. */
  function drawChain(length: number, seed: number): number[] {
    const variables = ascendingScalars(length);
    const { network } = generateNetwork({ seed, ...egoProtocol(variables) });
    const ego = network.ego?.[entityAttributesProperty] ?? {};
    return Object.keys(variables).map((id) => Number(ego[id]));
  }

  /** Everything wrong with one draw: a value off the scale, or out of order. */
  function complaints(values: number[], seed: number): string[] {
    const failures: string[] = [];

    for (const [index, value] of values.entries()) {
      complain(
        failures,
        value >= 0 && value <= 1,
        () => `seed ${seed}: s${index} is ${value}, outside the 0-1 scale`,
      );
      complain(
        failures,
        index === 0 || value > Number(values[index - 1]),
        () =>
          `seed ${seed}: s${index} (${value}) is not above s${index - 1} (${values[index - 1]})`,
      );
    }

    return failures;
  }

  it.each([
    { length: 2, label: 'a pair' },
    { length: 3, label: 'a chain of three' },
  ])(`orders $label across ${SEEDS} seeds`, ({ length }) => {
    const failures: string[] = [];

    for (let seed = 1; seed <= SEEDS; seed++) {
      failures.push(...complaints(drawChain(length, seed), seed));
    }

    expect(failures).toEqual([]);
  });

  // Every strict step is one place of the two-decimal grid a scalar draw is
  // rounded to, so the scale holds 101 values and a chain of 101 fills it end
  // to end. There is nowhere for a longer chain to put its ends.
  it('fills the scale exactly with a chain of 101', () => {
    const values = drawChain(101, 7);

    expect(values).toHaveLength(101);
    expect(values[0]).toBe(0);
    expect(values[100]).toBe(1);
    expect(complaints(values, 7)).toEqual([]);
  });

  it('refuses a chain of 102 rather than stepping outside the scale', () => {
    expect(() =>
      generateNetwork({ seed: 7, ...egoProtocol(ascendingScalars(102)) }),
    ).toThrow(SyntheticDataConstraintError);
  });
});

/**
 * A `unique` number whose bounds hold no whole value at all. The draw falls
 * back to the two-decimal grid inside the range and to the bounds themselves
 * wherever rounding leaves it, and `valueSpaceSize` counts exactly that set —
 * so what feasibility accepts here is precisely what the draw can fill.
 *
 * Both halves of that agreement are load-bearing, and each used to be broken on
 * its own side. The count left the clamped ends out, which refused two entities
 * on a range holding two values; the draw ignored the distinct sequence number
 * and re-rolled at random, which spent the redraw budget recolliding and threw
 * on a protocol the count had just passed. Fixing either alone makes the other
 * worse, so both are swept here.
 */
describe('a unique number in a range that holds no integer', () => {
  /** A stage creating exactly `nodes` people, each holding a distinct value. */
  function narrowRangeProtocol(min: number, max: number, nodes: number) {
    return {
      codebook: personCodebook({
        score: {
          name: 'Score',
          type: 'number',
          validation: {
            required: true,
            unique: true,
            minValue: min,
            maxValue: max,
          },
        },
      }),
      stages: [
        {
          id: 'stage-1',
          type: 'NameGenerator',
          label: 'Name generator',
          subject: { entity: 'node', type: 'person' },
          prompts: [{ id: 'p1', text: 'Name people' }],
          behaviours: { minNodes: nodes, maxNodes: nodes },
        } as unknown as Stage,
      ],
    };
  }

  /** Everything wrong with one seed's run: a refusal, a repeat, a stray value. */
  function complaintsFor(
    seed: number,
    min: number,
    max: number,
    nodes: number,
  ): string[] {
    const failures: string[] = [];

    let values: number[];
    try {
      const { network } = generateNetwork({
        seed,
        ...narrowRangeProtocol(min, max, nodes),
      });
      values = network.nodes.map((node) =>
        Number(node[entityAttributesProperty].score),
      );
    } catch (error) {
      return [
        `seed ${seed}: [${min}, ${max}] over ${nodes} nodes threw ${
          error instanceof SyntheticDataConstraintError
            ? 'SyntheticDataConstraintError'
            : String(error)
        }`,
      ];
    }

    complain(
      failures,
      values.length === nodes,
      () => `seed ${seed}: ${values.length} nodes, not ${nodes}`,
    );
    complain(
      failures,
      new Set(values).size === values.length,
      () =>
        `seed ${seed}: repeated a unique value in ${JSON.stringify(values)}`,
    );
    for (const value of values) {
      complain(
        failures,
        value >= min && value <= max,
        () => `seed ${seed}: ${value} is outside [${min}, ${max}]`,
      );
    }

    return failures;
  }

  // The shapes a review reported, plus the two that most nearly exhaust their
  // space: nine values for nine nodes leaves the draw no slack at all, and
  // eleven nodes on [0.001, 0.099] is only satisfiable because the two clamped
  // ends are values — which is the count the other half of this fix restored.
  it.each([
    { min: 0.001, max: 0.099, nodes: 9 },
    { min: 0.001, max: 0.099, nodes: 11 },
    { min: 0.01, max: 0.09, nodes: 9 },
    { min: 0.1, max: 0.9, nodes: 81 },
    { min: 0.001, max: 0.009, nodes: 2 },
    { min: 10.501, max: 10.509, nodes: 2 },
  ])(
    `fills [$min, $max] with $nodes distinct values, over ${SEEDS} seeds`,
    ({ min, max, nodes }) => {
      const failures: string[] = [];
      for (let seed = 1; seed <= SEEDS; seed++) {
        failures.push(...complaintsFor(seed, min, max, nodes));
      }

      expect(failures).toEqual([]);
    },
  );

  // Named in the review that reported the redraw defect. They pass on the
  // current draw for a reason worth pinning: the space is eleven values rather
  // than the nine the report assumed, so the random re-roll had slack here.
  it.each([305, 711, 3332])(
    'generates nine nodes on [0.001, 0.099] at seed %i',
    (seed) => {
      expect(complaintsFor(seed, 0.001, 0.099, 9)).toEqual([]);
    },
  );
});

/**
 * A strict comparison between two `number` variables whose ranges hold no whole
 * value. The draw fills such a range from the two-decimal grid — plus the two
 * ends themselves where rounding leaves it — so the step a strict comparison
 * puts between the two variables has to be read from that grid rather than
 * assumed to be a whole unit. A whole unit lifts the upper end's floor a
 * hundredfold past its own ceiling and refuses protocols whose every pair of
 * values satisfies the rule.
 *
 * Swept from both sides. Reading the step too finely would buy those protocols
 * back by giving up the refusals underneath, so the pairs a run must still
 * refuse are swept alongside the pairs it must generate.
 */
describe('a strict comparison between numbers in fractional ranges', () => {
  type Range = { minValue: number; maxValue: number };

  /** `b > a`, on five people, each variable declaring the range it is given. */
  function comparedPair(a: Range, b: Range) {
    return {
      codebook: personCodebook({
        a: { name: 'A', type: 'number', validation: { required: true, ...a } },
        b: {
          name: 'B',
          type: 'number',
          validation: { required: true, ...b, greaterThanVariable: 'a' },
        },
      }),
      stages: [nameGeneratorStage],
    };
  }

  it.each([
    {
      a: { minValue: 0.1, maxValue: 0.2 },
      b: { minValue: 0.3, maxValue: 0.4 },
    },
    {
      a: { minValue: 0.1, maxValue: 0.9 },
      b: { minValue: 0.1, maxValue: 0.9 },
    },
    // A range whose two ends are every value it holds.
    {
      a: { minValue: 0.001, maxValue: 0.009 },
      b: { minValue: 0.001, maxValue: 0.009 },
    },
    // One end fractional and the other whole-valued, each way round.
    {
      a: { minValue: 0.1, maxValue: 0.2 },
      b: { minValue: 0, maxValue: 10 },
    },
    {
      a: { minValue: 0, maxValue: 10 },
      b: { minValue: 0.1, maxValue: 0.2 },
    },
    // A range that does hold whole values, where a whole unit is the step.
    {
      a: { minValue: 0.5, maxValue: 2.5 },
      b: { minValue: 0.5, maxValue: 2.5 },
    },
  ])(
    `orders [$a.minValue, $a.maxValue] below [$b.minValue, $b.maxValue], over ${SEEDS} seeds`,
    ({ a, b }) => {
      const protocol = comparedPair(a, b);
      const failures: string[] = [];

      for (let seed = 1; seed <= SEEDS; seed++) {
        const { network } = generateNetwork({ seed, ...protocol });

        for (const node of network.nodes) {
          const attrs = node[entityAttributesProperty];
          const drawn = { a: Number(attrs.a), b: Number(attrs.b) };
          complain(
            failures,
            drawn.b > drawn.a &&
              drawn.a >= a.minValue &&
              drawn.a <= a.maxValue &&
              drawn.b >= b.minValue &&
              drawn.b <= b.maxValue,
            () => `seed ${seed}: ${JSON.stringify(drawn)}`,
          );
        }
      }

      expect(failures).toEqual([]);
    },
  );

  it.each([
    // Nothing in `b` reaches anything in `a`.
    {
      why: 'the upper end sits entirely below the lower one',
      a: { minValue: 0.3, maxValue: 0.4 },
      b: { minValue: 0.1, maxValue: 0.2 },
    },
    // One value each, and a rule that needs two.
    {
      why: 'both ends hold the one same value',
      a: { minValue: 0.5, maxValue: 0.5 },
      b: { minValue: 0.5, maxValue: 0.5 },
    },
  ])('refuses a pair where $why', ({ a, b }) => {
    expect(() => generateNetwork({ seed: 7, ...comparedPair(a, b) })).toThrow(
      SyntheticDataConstraintError,
    );
  });

  it('refuses a chain longer than its fractional range can separate', () => {
    // `[0.1, 0.11]` holds two values of the grid, and three variables strictly
    // ordered inside it need three.
    const codebook = personCodebook({
      a: {
        name: 'A',
        type: 'number',
        validation: { minValue: 0.1, maxValue: 0.11 },
      },
      b: {
        name: 'B',
        type: 'number',
        validation: {
          minValue: 0.1,
          maxValue: 0.11,
          greaterThanVariable: 'a',
        },
      },
      c: {
        name: 'C',
        type: 'number',
        validation: {
          minValue: 0.1,
          maxValue: 0.11,
          greaterThanVariable: 'b',
        },
      },
    });

    expect(() =>
      generateNetwork({ seed: 7, codebook, stages: [nameGeneratorStage] }),
    ).toThrow(SyntheticDataConstraintError);
  });
});

/**
 * A strict date comparison against the last date the calendar holds. The floor
 * it puts on the other end is the day after 9999-12-31, which is not a date at
 * all: written out it is `10000-01-01`, whose leading digit sorts it below every
 * four-digit year, so a bound derived there is read as the looser one and
 * dropped. Both readers have to refuse instead — the propagation that narrows
 * a declared window, and the fold the draw makes against a value a prompt
 * fixes, which is the only one a wide window ever reaches.
 */
describe('a strict date comparison at the end of the calendar', () => {
  const window = { type: 'full', min: '1920-01-01', max: '9999-12-31' };

  /** `until` after `since`, strictly or not, over the whole calendar. */
  function datedPair(strict: boolean, since = window) {
    return personCodebook({
      since: { name: 'Since', type: 'datetime', parameters: since },
      until: {
        name: 'Until',
        type: 'datetime',
        parameters: window,
        validation: {
          [strict ? 'greaterThanVariable' : 'greaterThanOrEqualToVariable']:
            'since',
        },
      },
    });
  }

  /** A stage pinning `since` to the last date the picker offers. */
  const pinningStage = {
    id: 'stage-1',
    type: 'NameGenerator',
    label: 'Name generator',
    subject: { entity: 'node', type: 'person' },
    prompts: [
      {
        id: 'p1',
        text: 'Name people',
        additionalAttributes: [{ variable: 'since', value: '9999-12-31' }],
      },
    ],
    behaviours: { minNodes: 3, maxNodes: 3 },
  } as unknown as Stage;

  it('refuses a window pinned at the last date the picker offers', () => {
    expect(() =>
      generateNetwork({
        seed: 7,
        codebook: datedPair(true, {
          type: 'full',
          min: '9999-12-31',
          max: '9999-12-31',
        }),
        stages: [nameGeneratorStage],
      }),
    ).toThrow(SyntheticDataConstraintError);
  });

  it('refuses a prompt fixing the lower end of the comparison to that date', () => {
    expect(() =>
      generateNetwork({
        seed: 7,
        codebook: datedPair(true),
        stages: [pinningStage],
      }),
    ).toThrow(SyntheticDataConstraintError);
  });

  it(`draws that same pinned pair under a non-strict rule, over ${SEEDS} seeds`, () => {
    // The boundary the refusal must not cross: `>=` is satisfied by the last
    // date itself, so the fixed value and the drawn one are both that date.
    const failures: string[] = [];

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook: datedPair(false),
        stages: [pinningStage],
      });

      for (const node of network.nodes) {
        const { since, until } = node[entityAttributesProperty];
        complain(
          failures,
          since === '9999-12-31' && until === '9999-12-31',
          () => `seed ${seed}: ${String(since)} then ${String(until)}`,
        );
      }
    }

    expect(failures).toEqual([]);
  });
});

/**
 * The rules whose satisfaction can only be read off two values at once, swept
 * wide because a comparison that holds for one draw fails for the next: a rule
 * leaves a range, and only part of it breaks.
 */
describe('cross-variable rules across a seed sweep', () => {
  it(`holds a sameAs pair equal at the length both declare, over ${SEEDS} seeds`, () => {
    const failures: string[] = [];
    const variables = {
      a: {
        name: 'A',
        type: 'text',
        validation: { required: true, minLength: 24, maxLength: 24 },
      },
      b: {
        name: 'B',
        type: 'text',
        validation: {
          required: true,
          minLength: 24,
          maxLength: 24,
          sameAs: 'a',
        },
      },
    };

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({ seed, ...egoProtocol(variables) });
      const ego = network.ego?.[entityAttributesProperty] ?? {};
      const a = String(ego.a);

      complain(
        failures,
        a.length === 24,
        () => `seed ${seed}: a is ${a.length} characters, not 24`,
      );
      complain(
        failures,
        ego.b === ego.a,
        () => `seed ${seed}: b "${String(ego.b)}" is not a "${a}"`,
      );
    }

    expect(failures).toEqual([]);
  });

  it(`draws a sameAs pair from the options both of them offer, over ${SEEDS} seeds`, () => {
    const failures: string[] = [];
    const offered = { a: [1, 2, 3], b: [2, 3, 4] };
    const variables = heldEqualOrdinals(offered.a, offered.b);

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({ seed, ...egoProtocol(variables) });
      const ego = network.ego?.[entityAttributesProperty] ?? {};

      complain(
        failures,
        ego.b === ego.a,
        () => `seed ${seed}: b ${String(ego.b)} is not a ${String(ego.a)}`,
      );
      for (const [id, values] of Object.entries(offered)) {
        complain(
          failures,
          values.includes(Number(ego[id])),
          () =>
            `seed ${seed}: ${id} holds ${String(ego[id])}, which it does not offer`,
        );
      }
    }

    expect(failures).toEqual([]);
  });

  it(`holds unique, differentFrom and greaterThanVariable on every node, over ${SEEDS} seeds`, () => {
    const failures: string[] = [];
    const codebook = personCodebook({
      code: {
        name: 'Code',
        type: 'text',
        validation: {
          required: true,
          unique: true,
          minLength: 6,
          maxLength: 6,
        },
      },
      alias: {
        name: 'Alias',
        type: 'text',
        validation: { required: true, minLength: 2, maxLength: 12 },
      },
      nickname: {
        name: 'Nickname',
        type: 'text',
        validation: {
          required: true,
          minLength: 2,
          maxLength: 12,
          differentFrom: 'alias',
        },
      },
      low: {
        name: 'Low',
        type: 'number',
        validation: { required: true, minValue: 0, maxValue: 50 },
      },
      high: {
        name: 'High',
        type: 'number',
        validation: {
          required: true,
          minValue: 0,
          maxValue: 100,
          greaterThanVariable: 'low',
        },
      },
    });

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook,
        stages: [nameGeneratorStage],
      });
      const issued = new Set<string>();

      for (const node of network.nodes) {
        const attrs = node[entityAttributesProperty];
        const code = String(attrs.code);
        const alias = String(attrs.alias);
        const nickname = String(attrs.nickname);
        const low = Number(attrs.low);
        const high = Number(attrs.high);

        complain(
          failures,
          !issued.has(code),
          () => `seed ${seed}: code "${code}" was issued twice`,
        );
        issued.add(code);

        complain(
          failures,
          code.length === 6,
          () => `seed ${seed}: code "${code}" is not 6 characters`,
        );
        for (const [label, value] of [
          ['alias', alias],
          ['nickname', nickname],
        ]) {
          complain(
            failures,
            String(value).length >= 2 && String(value).length <= 12,
            () =>
              `seed ${seed}: ${String(label)} "${String(value)}" is outside 2-12 characters`,
          );
        }
        complain(
          failures,
          nickname !== alias,
          () => `seed ${seed}: nickname "${nickname}" equals alias`,
        );
        complain(
          failures,
          low >= 0 && low <= 50,
          () => `seed ${seed}: low ${low} is outside 0-50`,
        );
        complain(
          failures,
          high >= 0 && high <= 100,
          () => `seed ${seed}: high ${high} is outside 0-100`,
        );
        complain(
          failures,
          high > low,
          () => `seed ${seed}: high ${high} is not above low ${low}`,
        );
      }
    }

    expect(failures).toEqual([]);
  });

  it(`orders a datetime chain inside its declared window, over ${SEEDS} seeds`, () => {
    const failures: string[] = [];
    // The month picker writes `YYYY-MM`, which compares correctly as a string
    // against the window truncated to the same resolution.
    const picker = {
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'month', min: '2000-01-01', max: '2005-12-31' },
    };
    const codebook = personCodebook({
      start: { ...picker, name: 'Start', validation: { required: true } },
      middle: {
        ...picker,
        name: 'Middle',
        validation: { required: true, greaterThanVariable: 'start' },
      },
      end: {
        ...picker,
        name: 'End',
        validation: { required: true, greaterThanVariable: 'middle' },
      },
    });

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook,
        stages: [nameGeneratorStage],
      });

      for (const node of network.nodes) {
        const attrs = node[entityAttributesProperty];
        const dates = ['start', 'middle', 'end'].map((id) => String(attrs[id]));

        for (const [index, date] of dates.entries()) {
          complain(
            failures,
            date >= '2000-01' && date <= '2005-12',
            () => `seed ${seed}: ${date} is outside 2000-01 to 2005-12`,
          );
          complain(
            failures,
            index === 0 || date > String(dates[index - 1]),
            () =>
              `seed ${seed}: ${date} is not after ${String(dates[index - 1])}`,
          );
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it('solves the rest of a component around a prompt-fixed attribute', () => {
    // additionalAttributes fixes `flag` before anything is drawn, so the
    // solve must treat it as assigned — `twin differentFrom flag` leaves
    // exactly one boolean for every node.
    const codebook = personCodebook({
      flag: { name: 'Flag', type: 'boolean' },
      twin: {
        name: 'Twin',
        type: 'boolean',
        validation: { differentFrom: 'flag' },
      },
    });
    const stage = {
      id: 'stage-1',
      type: 'NameGenerator',
      label: 'Name generator',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'p1',
          text: 'Name people',
          additionalAttributes: [{ variable: 'flag', value: true }],
        },
      ],
      behaviours: { minNodes: 4, maxNodes: 4 },
    } as unknown as Stage;

    const failures: string[] = [];
    for (let seed = 1; seed <= 40; seed++) {
      const { network } = generateNetwork({ seed, codebook, stages: [stage] });
      for (const node of network.nodes) {
        const attrs = node[entityAttributesProperty];
        complain(
          failures,
          attrs.flag === true && attrs.twin === false,
          () => `seed ${seed}: ${JSON.stringify(attrs)}`,
        );
      }
    }

    expect(failures).toEqual([]);
  });

  it('generates a chain that forces a number into a fractional range', () => {
    // `v1 < v0` against a scalar leaves `v1` the propagated range
    // [0.01, 0.99], which holds no integer; the number draw falls back to
    // two-decimal floats there. The complete solver deliberately declines
    // such components — their reachable set is not crisply enumerable — so
    // feasibility must keep accepting this and the greedy path must keep
    // generating values that satisfy every comparison.
    const codebook = personCodebook({
      v0: { name: 'V0', type: 'scalar', component: 'VisualAnalogScale' },
      v1: {
        name: 'V1',
        type: 'number',
        validation: { minValue: 0, maxValue: 3, lessThanVariable: 'v0' },
      },
      v2: {
        name: 'V2',
        type: 'scalar',
        component: 'VisualAnalogScale',
        validation: { lessThanVariable: 'v1' },
      },
      v3: {
        name: 'V3',
        type: 'number',
        validation: {
          minValue: 0,
          maxValue: 3,
          lessThanOrEqualToVariable: 'v2',
        },
      },
    });

    const failures: string[] = [];
    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook,
        stages: [nameGeneratorStage],
      });

      for (const node of network.nodes) {
        const attrs = node[entityAttributesProperty];
        const [v0, v1, v2, v3] = ['v0', 'v1', 'v2', 'v3'].map((id) =>
          Number(attrs[id]),
        );
        complain(
          failures,
          v1! < v0! &&
            v2! < v1! &&
            v3! <= v2! &&
            v1! >= 0 &&
            v1! <= 3 &&
            v3! >= 0,
          () => `seed ${seed}: ${JSON.stringify({ v0, v1, v2, v3 })}`,
        );
      }
    }

    expect(failures).toEqual([]);
  });
});

/**
 * Two things put a value on a node without drawing it: a prompt's
 * `additionalAttributes` and a roster row. A rule spanning one of those and a
 * drawn variable is only satisfied if the fixed value is settled before the
 * draw — generating the whole node and overwriting after leaves the rule
 * broken on exactly the seeds where the draw disagreed with what arrives.
 */
describe('rules spanning a fixed and a drawn attribute', () => {
  /** A name generator whose prompt pins `a` to false on every node it makes. */
  function pinningStage(fabricates: boolean): Stage {
    return {
      id: 'stage-1',
      type: fabricates ? 'NameGenerator' : 'NameGeneratorRoster',
      label: 'Name generator',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'p1',
          text: 'Name people',
          additionalAttributes: [{ variable: 'a', value: false }],
        },
      ],
      behaviours: { minNodes: 3, maxNodes: 3 },
    } as unknown as Stage;
  }

  it(`holds a sameAs pair equal when a prompt pins one of them, over ${SEEDS} seeds`, () => {
    const failures: string[] = [];
    const codebook = personCodebook({
      a: { name: 'A', type: 'boolean' },
      b: { name: 'B', type: 'boolean', validation: { sameAs: 'a' } },
    });

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook,
        stages: [pinningStage(true)],
      });

      for (const node of network.nodes) {
        const { a, b } = node[entityAttributesProperty];
        complain(
          failures,
          a === false,
          () => `seed ${seed}: a is ${String(a)}, not the pinned false`,
        );
        complain(
          failures,
          b === a,
          () => `seed ${seed}: b ${String(b)} is not a ${String(a)}`,
        );
      }
    }

    expect(failures).toEqual([]);
  });

  it(`holds a differentFrom pair apart when a prompt pins one of them, over ${SEEDS} seeds`, () => {
    const failures: string[] = [];
    const codebook = personCodebook({
      a: { name: 'A', type: 'boolean' },
      b: { name: 'B', type: 'boolean', validation: { differentFrom: 'a' } },
    });

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook,
        stages: [pinningStage(true)],
      });

      for (const node of network.nodes) {
        const { a, b } = node[entityAttributesProperty];
        complain(
          failures,
          a === false,
          () => `seed ${seed}: a is ${String(a)}, not the pinned false`,
        );
        complain(
          failures,
          b !== a,
          () => `seed ${seed}: b ${String(b)} equals a ${String(a)}`,
        );
      }
    }

    expect(failures).toEqual([]);
  });

  it(`orders a comparator against a value the roster supplies, over ${SEEDS} seeds`, () => {
    const failures: string[] = [];
    // A roster of ages spread across the range, so the drawn `retired` has to
    // clear a different floor on every row rather than one the bounds could
    // have been narrowed to once.
    const codebook = personCodebook({
      age: {
        name: 'Age',
        type: 'number',
        validation: { minValue: 0, maxValue: 100 },
      },
      retired: {
        name: 'Retired at',
        type: 'number',
        validation: { minValue: 0, maxValue: 100, greaterThanVariable: 'age' },
      },
    });
    const rows = Array.from(
      { length: 12 },
      (_, index) =>
        ({
          [entityPrimaryKeyProperty]: `roster-${index}`,
          type: 'person',
          [entityAttributesProperty]: { age: 20 + index },
        }) as unknown as NcNode,
    );

    let drewARow = 0;

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook,
        stages: [pinningStage(false)],
        externalData: { 'stage-1': rows.map((row) => ({ ...row })) },
      });

      for (const node of network.nodes) {
        const { age, retired } = node[entityAttributesProperty];
        if (node[entityPrimaryKeyProperty].startsWith('roster-')) {
          drewARow += 1;
        }
        complain(
          failures,
          Number(retired) > Number(age),
          () =>
            `seed ${seed}: retired ${String(retired)} is not above age ${String(age)}`,
        );
      }
    }

    expect(failures).toEqual([]);
    // A roster stage cannot fabricate, so every node it makes is a row; a
    // fixture where none were would assert nothing about the roster value.
    expect(drewARow).toBe(SEEDS * 3);
  });
});

/**
 * A rule whose two ends are both fixed leaves the draw nothing to choose: the
 * assignment either satisfies the rule as it arrives or no generation can make
 * it. Where the protocol states both values — one prompt's `additionalAttributes`
 * naming both variables — that is a refusal, decidable before any drawing.
 * Where the data supplies them, a roster row is a candidate the run may simply
 * pass over.
 */
describe('a rule between two fixed attributes', () => {
  /** A name generator whose prompt pins both `a` and `b` on every node. */
  function pinningBoth(a: boolean, b: boolean): Stage {
    return {
      id: 'stage-1',
      type: 'NameGenerator',
      label: 'Name generator',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'p1',
          text: 'Name people',
          additionalAttributes: [
            { variable: 'a', value: a },
            { variable: 'b', value: b },
          ],
        },
      ],
      behaviours: { minNodes: 3, maxNodes: 3 },
    } as unknown as Stage;
  }

  const sameAsPair = personCodebook({
    a: { name: 'A', type: 'boolean' },
    b: { name: 'B', type: 'boolean', validation: { sameAs: 'a' } },
  });
  const differentFromPair = personCodebook({
    a: { name: 'A', type: 'boolean' },
    b: { name: 'B', type: 'boolean', validation: { differentFrom: 'a' } },
  });

  it('refuses a prompt fixing a sameAs pair to values that disagree', () => {
    const build = () =>
      generateNetwork({
        seed: 3,
        codebook: sameAsPair,
        stages: [pinningBoth(false, true)],
      });

    expect(build).toThrow(SyntheticDataConstraintError);
    expect(build).toThrow(
      'a prompt fixes these variables to false and true, which sameAs cannot hold',
    );
  });

  it('refuses a prompt fixing a differentFrom pair to one value', () => {
    const build = () =>
      generateNetwork({
        seed: 3,
        codebook: differentFromPair,
        stages: [pinningBoth(true, true)],
      });

    expect(build).toThrow(SyntheticDataConstraintError);
    expect(build).toThrow(
      'a prompt fixes these variables to true and true, which differentFrom cannot hold',
    );
  });

  it('refuses identically regardless of seed', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(() =>
        generateNetwork({
          seed,
          codebook: sameAsPair,
          stages: [pinningBoth(false, true)],
        }),
      ).toThrow(SyntheticDataConstraintError);
    }
  });

  it(`generates a prompt fixing a sameAs pair to one value, over ${SEEDS} seeds`, () => {
    const failures: string[] = [];

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook: sameAsPair,
        stages: [pinningBoth(false, false)],
      });

      complain(
        failures,
        network.nodes.length === 3,
        () => `seed ${seed}: ${network.nodes.length} nodes, not 3`,
      );
      for (const node of network.nodes) {
        const { a, b } = node[entityAttributesProperty];
        complain(
          failures,
          a === false && b === false,
          () =>
            `seed ${seed}: a ${String(a)} and b ${String(b)}, not both false`,
        );
      }
    }

    expect(failures).toEqual([]);
  });

  /** A roster stage drawing `count` people from the rows it is given. */
  function rosterStage(count: number, additional?: [string, boolean]): Stage {
    return {
      id: 'stage-1',
      type: 'NameGeneratorRoster',
      label: 'Roster',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'p1',
          text: 'Pick people',
          ...(additional
            ? {
                additionalAttributes: [
                  { variable: additional[0], value: additional[1] },
                ],
              }
            : {}),
        },
      ],
      behaviours: { minNodes: count, maxNodes: count },
    } as unknown as Stage;
  }

  function rowsOf(attributes: Record<string, unknown>[]): NcNode[] {
    return attributes.map(
      (values, index) =>
        ({
          [entityPrimaryKeyProperty]: `roster-${index}`,
          type: 'person',
          [entityAttributesProperty]: values,
        }) as unknown as NcNode,
    );
  }

  it(`passes over a row breaking a comparator between two of its own values, over ${SEEDS} seeds`, () => {
    const failures: string[] = [];
    const codebook = personCodebook({
      age: {
        name: 'Age',
        type: 'number',
        validation: { minValue: 0, maxValue: 100 },
      },
      retired: {
        name: 'Retired at',
        type: 'number',
        validation: { minValue: 0, maxValue: 100, greaterThanVariable: 'age' },
      },
    });
    // Three rows the rule accepts and three it does not, so the stage can fill
    // its three people only by passing every broken row over.
    const rows = rowsOf([
      { age: 60, retired: 30 },
      { age: 30, retired: 60 },
      { age: 70, retired: 20 },
      { age: 31, retired: 61 },
      { age: 80, retired: 10 },
      { age: 32, retired: 62 },
    ]);

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook,
        stages: [rosterStage(3)],
        externalData: { 'stage-1': rows.map((row) => ({ ...row })) },
      });

      complain(
        failures,
        network.nodes.length === 3,
        () => `seed ${seed}: ${network.nodes.length} nodes, not 3`,
      );
      for (const node of network.nodes) {
        const { age, retired } = node[entityAttributesProperty];
        complain(
          failures,
          Number(retired) > Number(age),
          () =>
            `seed ${seed}: retired ${String(retired)} is not above age ${String(age)}`,
        );
      }
    }

    expect(failures).toEqual([]);
  });

  it(`passes over a row whose value leaves the draw no value to satisfy a comparator with, over ${SEEDS} seeds`, () => {
    const failures: string[] = [];
    // `age` at the top of the range breaks nothing on its own — it is inside
    // its own bounds, and the rule spanning the pair names a variable the row
    // leaves for the draw. What it does is leave that draw nowhere to go:
    // `retired` has to be above 1 and cannot leave [0, 1].
    const codebook = personCodebook({
      age: {
        name: 'Age',
        type: 'number',
        validation: { minValue: 0, maxValue: 1 },
      },
      retired: {
        name: 'Retired at',
        type: 'number',
        validation: { minValue: 0, maxValue: 1, greaterThanVariable: 'age' },
      },
    });
    // Two rows the draw can complete and two it cannot, so the stage can fill
    // its two people only by passing the uncompletable rows over.
    const rows = rowsOf([{ age: 1 }, { age: 0 }, { age: 1 }, { age: 0 }]);

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook,
        stages: [rosterStage(2)],
        externalData: { 'stage-1': rows.map((row) => ({ ...row })) },
      });

      complain(
        failures,
        network.nodes.length === 2,
        () => `seed ${seed}: ${network.nodes.length} nodes, not 2`,
      );
      for (const node of network.nodes) {
        const { age, retired } = node[entityAttributesProperty];
        complain(
          failures,
          Number(retired) > Number(age),
          () =>
            `seed ${seed}: retired ${String(retired)} is not above age ${String(age)}`,
        );
      }
    }

    expect(failures).toEqual([]);
  });

  it('draws nothing from a roster whose every row leaves the draw no completion', () => {
    // The same outcome a roster whose every row breaks a rule of its own
    // already has, reached the same way: a roster stage builds nodes only from
    // rows, so a pool holding none the network can take ends the stage rather
    // than failing the run. An empty stage is the honest result — every person
    // this roster offers is one the protocol's own rules cannot describe.
    const codebook = personCodebook({
      age: {
        name: 'Age',
        type: 'number',
        validation: { minValue: 0, maxValue: 1 },
      },
      retired: {
        name: 'Retired at',
        type: 'number',
        validation: { minValue: 0, maxValue: 1, greaterThanVariable: 'age' },
      },
    });
    const rows = rowsOf([{ age: 1 }, { age: 1 }, { age: 1 }]);

    const { network } = generateNetwork({
      seed: 3,
      codebook,
      stages: [rosterStage(2)],
      externalData: { 'stage-1': rows.map((row) => ({ ...row })) },
    });

    expect(network.nodes).toEqual([]);
  });

  it(`passes over a row breaking sameAs between two of its own values, over ${SEEDS} seeds`, () => {
    const failures: string[] = [];
    const rows = rowsOf([
      { a: true, b: false },
      { a: true, b: true },
      { a: false, b: true },
      { a: false, b: false },
    ]);

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook: sameAsPair,
        stages: [rosterStage(2)],
        externalData: { 'stage-1': rows.map((row) => ({ ...row })) },
      });

      complain(
        failures,
        network.nodes.length === 2,
        () => `seed ${seed}: ${network.nodes.length} nodes, not 2`,
      );
      for (const node of network.nodes) {
        const { a, b } = node[entityAttributesProperty];
        complain(
          failures,
          a === b,
          () => `seed ${seed}: b ${String(b)} is not a ${String(a)}`,
        );
      }
    }

    expect(failures).toEqual([]);
  });

  it(`passes over a row breaking differentFrom between two of its own values, over ${SEEDS} seeds`, () => {
    const failures: string[] = [];
    const rows = rowsOf([
      { a: true, b: true },
      { a: true, b: false },
      { a: false, b: false },
      { a: false, b: true },
    ]);

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook: differentFromPair,
        stages: [rosterStage(2)],
        externalData: { 'stage-1': rows.map((row) => ({ ...row })) },
      });

      complain(
        failures,
        network.nodes.length === 2,
        () => `seed ${seed}: ${network.nodes.length} nodes, not 2`,
      );
      for (const node of network.nodes) {
        const { a, b } = node[entityAttributesProperty];
        complain(
          failures,
          a !== b,
          () => `seed ${seed}: b ${String(b)} equals a ${String(a)}`,
        );
      }
    }

    expect(failures).toEqual([]);
  });

  it(`passes over a row whose value breaks a rule against a prompt's, over ${SEEDS} seeds`, () => {
    // Neither end is drawn here either: the prompt fixes `a` and the row
    // supplies `b`, and whether they can sit together depends on the row.
    const failures: string[] = [];
    const rows = rowsOf([{ b: true }, { b: false }, { b: true }, { b: false }]);

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook: sameAsPair,
        stages: [rosterStage(2, ['a', false])],
        externalData: { 'stage-1': rows.map((row) => ({ ...row })) },
      });

      complain(
        failures,
        network.nodes.length === 2,
        () => `seed ${seed}: ${network.nodes.length} nodes, not 2`,
      );
      for (const node of network.nodes) {
        const { a, b } = node[entityAttributesProperty];
        complain(
          failures,
          a === false && b === false,
          () =>
            `seed ${seed}: a ${String(a)} and b ${String(b)}, not both false`,
        );
      }
    }

    expect(failures).toEqual([]);
  });

  /**
   * A comparator between two fixed dates written at different picker
   * resolutions.
   *
   * The runtime's `compareVariables` parses both ends with `new Date(...)`, and
   * ECMAScript reads a date-only string as UTC midnight beginning the period it
   * names: `2020` is the instant `2020-01-01`, and `2009-06` is `2009-06-01`.
   * Ordering the two as strings disagrees with that in both directions —
   * `2020-01-01` sorts after `2020`, and `2009-06` sorts before `2009-06-01` —
   * so a lexical check accepts a pair the interview rejects and writes it into
   * the network.
   */
  const yearAndDay = personCodebook({
    start: {
      name: 'Start',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'year', min: '2000', max: '2030' },
    },
    finish: {
      name: 'Finish',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'full', min: '2000-01-01', max: '2030-12-31' },
      validation: { greaterThanVariable: 'start' },
    },
  });

  const monthAndDay = personCodebook({
    day: {
      name: 'Day',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'full', min: '2000-01-01', max: '2030-12-31' },
    },
    month: {
      name: 'Month',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'month', min: '2000-01', max: '2030-12' },
      validation: { lessThanVariable: 'day' },
    },
  });

  function sweepPairs(
    codebook: Codebook,
    rows: NcNode[],
    holds: (attributes: Record<string, unknown>) => boolean,
  ): string[] {
    const failures: string[] = [];

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook,
        stages: [rosterStage(3)],
        externalData: {
          'stage-1': rows.map((row) => ({
            ...row,
            [entityAttributesProperty]: { ...row[entityAttributesProperty] },
          })),
        },
      });

      complain(
        failures,
        network.nodes.length === 3,
        () => `seed ${seed}: ${network.nodes.length} nodes, not 3`,
      );
      for (const node of network.nodes) {
        const attributes = node[entityAttributesProperty];
        complain(
          failures,
          holds(attributes),
          () => `seed ${seed}: drew ${JSON.stringify(attributes)}`,
        );
      }
    }

    return failures;
  }

  it(`passes over a row whose finer date only sorts past a coarser one, over ${SEEDS} seeds`, () => {
    // Each rejected row's `finish` is the first instant of its `start` year, so
    // a strict comparator does not hold however the two are written.
    const rows = rowsOf([
      { start: '2020', finish: '2020-01-01' },
      { start: '2020', finish: '2020-01-02' },
      { start: '2021', finish: '2021-01-01' },
      { start: '2021', finish: '2021-06-30' },
      { start: '2022', finish: '2022-01-01' },
      { start: '2022', finish: '2022-12-31' },
    ]);

    expect(
      sweepPairs(
        yearAndDay,
        rows,
        ({ start, finish }) => String(finish) > `${String(start)}-01-01`,
      ),
    ).toEqual([]);
  });

  it(`passes over a row whose coarser date only sorts before a finer one, over ${SEEDS} seeds`, () => {
    // The other direction: `2009-06` sorts before `2009-06-01` as a string, but
    // names the very instant it is required to precede.
    const rows = rowsOf([
      { day: '2009-06-01', month: '2009-06' },
      { day: '2009-06-02', month: '2009-06' },
      { day: '2010-06-01', month: '2010-06' },
      { day: '2010-07-15', month: '2010-06' },
      { day: '2011-03-01', month: '2011-03' },
      { day: '2011-03-20', month: '2011-03' },
    ]);

    expect(
      sweepPairs(
        monthAndDay,
        rows,
        ({ day, month }) => `${String(month)}-01` < String(day),
      ),
    ).toEqual([]);
  });

  it(`draws a row whose two resolutions coincide under a non-strict rule, over ${SEEDS} seeds`, () => {
    // The same pair a strict comparator rejects is one a non-strict comparator
    // accepts: the two ends are the same instant, so neither reading may drop
    // the row.
    const atLeast = personCodebook({
      start: {
        name: 'Start',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'year', min: '2000', max: '2030' },
      },
      finish: {
        name: 'Finish',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'full', min: '2000-01-01', max: '2030-12-31' },
        validation: { greaterThanOrEqualToVariable: 'start' },
      },
    });
    const rows = rowsOf([
      { start: '2020', finish: '2020-01-01' },
      { start: '2021', finish: '2021-01-01' },
      { start: '2022', finish: '2022-01-01' },
    ]);

    expect(
      sweepPairs(
        atLeast,
        rows,
        ({ start, finish }) => String(finish) === `${String(start)}-01-01`,
      ),
    ).toEqual([]);
  });
});

/**
 * A value fixed on a node is generated around rather than chosen: the draw is
 * asked only for the variables it leaves over, so nothing between it and the
 * rules it has to satisfy on its own stands in the way. A roster row carrying a
 * value its variable's own rules reject is therefore no more usable than one
 * breaking a rule between two of its values, and is passed over the same way.
 */
describe('a fixed value its own rules reject', () => {
  function rosterStage(count: number, extra?: Record<string, unknown>): Stage {
    return {
      id: 'stage-1',
      type: 'NameGeneratorRoster',
      label: 'Roster',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', text: 'Pick people', ...extra }],
      behaviours: { minNodes: count, maxNodes: count },
    } as unknown as Stage;
  }

  function rowsOf(attributes: Record<string, unknown>[]): NcNode[] {
    return attributes.map(
      (values, index) =>
        ({
          [entityPrimaryKeyProperty]: `roster-${index}`,
          type: 'person',
          [entityAttributesProperty]: values,
        }) as unknown as NcNode,
    );
  }

  function drawnOver(
    codebook: Codebook,
    rows: NcNode[],
    count: number,
    seed: number,
    extra?: Record<string, unknown>,
  ): Record<string, unknown>[] {
    const { network } = generateNetwork({
      seed,
      codebook,
      stages: [rosterStage(count, extra)],
      externalData: {
        'stage-1': rows.map(
          (row) =>
            ({
              ...row,
              [entityAttributesProperty]: {
                ...row[entityAttributesProperty],
              },
            }) as NcNode,
        ),
      },
    });

    return network.nodes.map((node) => node[entityAttributesProperty]);
  }

  /**
   * Every family below gives the stage six rows, three of which the rules
   * accept, and asks it for three people: the stage can only fill that by
   * passing every unusable row over.
   */
  function sweepRoster(
    codebook: Codebook,
    rows: NcNode[],
    usable: (attributes: Record<string, unknown>) => boolean,
  ): string[] {
    const failures: string[] = [];

    for (let seed = 1; seed <= SEEDS; seed++) {
      const drawn = drawnOver(codebook, rows, 3, seed);

      complain(
        failures,
        drawn.length === 3,
        () => `seed ${seed}: ${drawn.length} nodes, not 3`,
      );
      for (const attributes of drawn) {
        complain(
          failures,
          usable(attributes),
          () => `seed ${seed}: drew ${JSON.stringify(attributes)}`,
        );
      }
    }

    return failures;
  }

  const bands = [1, 2, 3].map((value) => ({ label: `Band ${value}`, value }));
  const tags = ['a', 'b', 'c', 'd'].map((value) => ({
    label: value.toUpperCase(),
    value,
  }));

  it(`passes over a row below a value floor, over ${SEEDS} seeds`, () => {
    const codebook = personCodebook({
      age: {
        name: 'Age',
        type: 'number',
        validation: { minValue: 18, maxValue: 100 },
      },
    });
    const rows = rowsOf([
      { age: 5 },
      { age: 42 },
      { age: 7 },
      { age: 55 },
      { age: 900 },
      { age: 61 },
    ]);

    expect(
      sweepRoster(codebook, rows, ({ age }) => {
        const value = Number(age);
        return value >= 18 && value <= 100;
      }),
    ).toEqual([]);
  });

  it(`passes over a row outside the length its variable allows, over ${SEEDS} seeds`, () => {
    const codebook = personCodebook({
      code: {
        name: 'Code',
        type: 'text',
        validation: { minLength: 4, maxLength: 8 },
      },
    });
    const rows = rowsOf([
      { code: 'ab' },
      { code: 'abcd' },
      { code: 'x' },
      { code: 'abcde' },
      { code: 'waytoolongindeed' },
      { code: 'abcdef' },
    ]);

    expect(
      sweepRoster(codebook, rows, ({ code }) => {
        const value = String(code);
        return value.length >= 4 && value.length <= 8;
      }),
    ).toEqual([]);
  });

  it(`passes over a row selecting too few or too many, over ${SEEDS} seeds`, () => {
    const codebook = personCodebook({
      tags: {
        name: 'Tags',
        type: 'categorical',
        options: tags,
        validation: { minSelected: 2, maxSelected: 3 },
      },
    });
    const rows = rowsOf([
      { tags: ['a'] },
      { tags: ['a', 'b'] },
      { tags: ['a', 'b', 'c', 'd'] },
      { tags: ['b', 'c'] },
      { tags: ['c'] },
      { tags: ['a', 'c'] },
    ]);

    expect(
      sweepRoster(
        codebook,
        rows,
        ({ tags: drawn }) =>
          Array.isArray(drawn) && drawn.length >= 2 && drawn.length <= 3,
      ),
    ).toEqual([]);
  });

  it(`passes over a row holding a value no option offers, over ${SEEDS} seeds`, () => {
    const codebook = personCodebook({
      band: { name: 'Band', type: 'ordinal', options: bands },
    });
    const rows = rowsOf([
      { band: 9 },
      { band: 2 },
      { band: 7 },
      { band: 3 },
      { band: 8 },
      { band: 1 },
    ]);

    expect(
      sweepRoster(codebook, rows, ({ band }) =>
        [1, 2, 3].includes(Number(band)),
      ),
    ).toEqual([]);
  });

  it(`passes over a row selecting an option that is not offered, over ${SEEDS} seeds`, () => {
    const codebook = personCodebook({
      tags: { name: 'Tags', type: 'categorical', options: tags },
    });
    const rows = rowsOf([
      { tags: ['zz'] },
      { tags: ['a'] },
      { tags: ['a', 'qq'] },
      { tags: ['b'] },
      { tags: 'c' },
      { tags: ['c', 'd'] },
    ]);

    expect(
      sweepRoster(
        codebook,
        rows,
        ({ tags: drawn }) =>
          Array.isArray(drawn) &&
          drawn.every((value) => ['a', 'b', 'c', 'd'].includes(String(value))),
      ),
    ).toEqual([]);
  });

  it(`passes over a row outside the date picker's window, over ${SEEDS} seeds`, () => {
    const codebook = personCodebook({
      met: {
        name: 'Met',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'full', min: '2000-01-01', max: '2010-12-31' },
      },
    });
    const rows = rowsOf([
      { met: '1980-05-05' },
      { met: '2005-03-03' },
      { met: '2020-01-01' },
      { met: '2001-09-09' },
      { met: '1975-02-02' },
      { met: '2009-11-11' },
    ]);

    expect(
      sweepRoster(codebook, rows, ({ met }) => {
        const value = String(met);
        return value >= '2000-01-01' && value <= '2010-12-31';
      }),
    ).toEqual([]);
  });

  /**
   * A picker collects a date at one resolution and no other, and its calendar
   * offers only days that exist. A window check alone cannot see either: it
   * truncates the value to the picker's units before comparing, so a full date
   * in a year picker lands inside the window and is then copied out verbatim,
   * and `2005-02-31` sorts between the bounds like any other string.
   */
  const yearPicker = personCodebook({
    met: {
      name: 'Met',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'year', min: '2000', max: '2010' },
    },
  });

  const fullPicker = personCodebook({
    met: {
      name: 'Met',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'full', min: '2000-01-01', max: '2010-12-31' },
    },
  });

  it(`passes over a row written finer than its picker collects, over ${SEEDS} seeds`, () => {
    const rows = rowsOf([
      { met: '2001-03-04' },
      { met: '2004' },
      { met: '2005-06-07' },
      { met: '2007' },
      { met: '2008-12-31' },
      { met: '2009' },
    ]);

    expect(
      sweepRoster(yearPicker, rows, ({ met }) => /^\d{4}$/.test(String(met))),
    ).toEqual([]);
  });

  it(`passes over a row naming a day the calendar does not hold, over ${SEEDS} seeds`, () => {
    // `2005-02-31` neither fails to parse nor names February 31st — it rolls
    // forward into March — so a native date input can show neither what was
    // written nor what it means.
    const rows = rowsOf([
      { met: '2005-02-31' },
      { met: '2005-03-01' },
      { met: '2006-04-31' },
      { met: '2006-05-01' },
      { met: '2007-11-31' },
      { met: '2007-12-01' },
    ]);

    expect(
      sweepRoster(fullPicker, rows, ({ met }) =>
        ['2005-03-01', '2006-05-01', '2007-12-01'].includes(String(met)),
      ),
    ).toEqual([]);
  });

  it(`passes over a row holding a string that names no date, over ${SEEDS} seeds`, () => {
    const rows = rowsOf([
      { met: 'not-a-date' },
      { met: '2005-01-02' },
      { met: '2005/06/07' },
      { met: '2006-01-02' },
      { met: '20070102' },
      { met: '2007-01-02' },
    ]);

    expect(
      sweepRoster(fullPicker, rows, ({ met }) =>
        /^\d{4}-\d{2}-\d{2}$/.test(String(met)),
      ),
    ).toEqual([]);
  });

  it(`draws every row its picker could have collected, over ${SEEDS} seeds`, () => {
    // The guard reads the picker's own resolution rather than preferring the
    // finest one: a year picker's rows are years, and all three are usable.
    const rows = rowsOf([{ met: '2001' }, { met: '2004' }, { met: '2009' }]);
    const failures: string[] = [];

    for (let seed = 1; seed <= SEEDS; seed++) {
      const drawn = drawnOver(yearPicker, rows, 3, seed).map(({ met }) =>
        String(met),
      );

      complain(
        failures,
        drawn.toSorted().join(',') === '2001,2004,2009',
        () => `seed ${seed}: dates ${drawn.join(', ')}, not all three rows`,
      );
    }

    expect(failures).toEqual([]);
  });

  it(`draws a row whose date column is empty, over ${SEEDS} seeds`, () => {
    // An emptied column is no answer rather than a date of the wrong shape, and
    // `required` is the rule that owns emptiness — as it does for every other
    // type. A picker the protocol does not mark required accepts a blank.
    const rows = rowsOf([{ met: '2001' }, { met: '' }, { met: '2009' }]);
    const failures: string[] = [];

    for (let seed = 1; seed <= SEEDS; seed++) {
      const drawn = drawnOver(yearPicker, rows, 3, seed).map(({ met }) =>
        String(met),
      );

      complain(
        failures,
        drawn.toSorted().join(',') === ',2001,2009',
        () => `seed ${seed}: dates ${drawn.join(', ')}, not all three rows`,
      );
    }

    expect(failures).toEqual([]);
  });

  it('refuses a prompt fixing a date its picker cannot collect', () => {
    const fixing = {
      id: 'stage-1',
      type: 'NameGenerator',
      label: 'Name generator',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'p1',
          text: 'Name people',
          additionalAttributes: [{ variable: 'met', value: '2005-05-01' }],
        },
      ],
      behaviours: { minNodes: 2, maxNodes: 2 },
    } as unknown as Stage;

    for (const seed of [1, 2, 3, 4, 5]) {
      const build = () =>
        generateNetwork({ seed, codebook: yearPicker, stages: [fixing] });

      expect(build).toThrow(SyntheticDataConstraintError);
      expect(build).toThrow(
        'a prompt fixes this variable to 2005-05-01, which parameters does not allow',
      );
    }
  });

  it(`passes over a row outside the normalised scalar scale, over ${SEEDS} seeds`, () => {
    // A scalar declares no bounds — the schema accepts none — but the slider
    // that collects it runs over 0-1 and nothing else, so a row outside that
    // scale is one no participant could have produced either.
    const codebook = personCodebook({
      closeness: {
        name: 'Closeness',
        type: 'scalar',
        component: 'VisualAnalogScale',
      },
    });
    const rows = rowsOf([
      { closeness: 7 },
      { closeness: 0.5 },
      { closeness: -3 },
      { closeness: 0.2 },
      { closeness: 42 },
      { closeness: 0.9 },
    ]);

    expect(
      sweepRoster(codebook, rows, ({ closeness }) => {
        const value = Number(closeness);
        return value >= 0 && value <= 1;
      }),
    ).toEqual([]);
  });

  it(`passes over a row leaving a required column empty, over ${SEEDS} seeds`, () => {
    const codebook = personCodebook({
      nickname: {
        name: 'Nickname',
        type: 'text',
        validation: { required: true },
      },
    });
    const rows = rowsOf([
      { nickname: null },
      { nickname: 'Ana' },
      { nickname: '   ' },
      { nickname: 'Bo' },
      { nickname: null },
      { nickname: 'Cy' },
    ]);

    expect(
      sweepRoster(codebook, rows, ({ nickname }) =>
        ['Ana', 'Bo', 'Cy'].includes(String(nickname)),
      ),
    ).toEqual([]);
  });

  it(`draws every row when the rules accept all of them, over ${SEEDS} seeds`, () => {
    // The guard is a filter over rows, not a narrowing of what a roster may
    // hold: a roster whose rows are all usable draws all of them.
    const codebook = personCodebook({
      age: {
        name: 'Age',
        type: 'number',
        validation: { minValue: 18, maxValue: 100 },
      },
    });
    const rows = rowsOf([{ age: 42 }, { age: 55 }, { age: 61 }]);
    const failures: string[] = [];

    for (let seed = 1; seed <= SEEDS; seed++) {
      const drawn = drawnOver(codebook, rows, 3, seed).map(({ age }) =>
        Number(age),
      );

      complain(
        failures,
        drawn.toSorted((a, b) => a - b).join(',') === '42,55,61',
        () => `seed ${seed}: ages ${drawn.join(', ')}, not all three rows`,
      );
    }

    expect(failures).toEqual([]);
  });

  it('leaves a roster stage empty when no row can be used', () => {
    // The same outcome as a roster asset that parsed to no rows at all: a
    // roster stage builds people only from rows, so a pool holding none the
    // network can take ends the stage rather than refusing the protocol —
    // which rows a run can use is a property of the data, not of the protocol.
    const codebook = personCodebook({
      age: {
        name: 'Age',
        type: 'number',
        validation: { minValue: 18, maxValue: 100 },
      },
    });
    const rows = rowsOf([{ age: 5 }, { age: 6 }, { age: 7 }, { age: 8 }]);

    for (let seed = 1; seed <= 25; seed++) {
      expect(drawnOver(codebook, rows, 3, seed)).toEqual([]);
    }
  });

  it('still fills a name generator whose panel rows are all unusable', () => {
    // A panel is one source among several, so the stage fabricates the people
    // the unusable rows cannot supply.
    const codebook = personCodebook({
      age: {
        name: 'Age',
        type: 'number',
        validation: { minValue: 18, maxValue: 100 },
      },
    });
    const panelStage = {
      id: 'stage-1',
      type: 'NameGenerator',
      label: 'Name generator',
      subject: { entity: 'node', type: 'person' },
      panels: [{ id: 'panel-1', title: 'Panel', dataSource: 'asset-1' }],
      prompts: [{ id: 'p1', text: 'Name people' }],
      behaviours: { minNodes: 3, maxNodes: 3 },
    } as unknown as Stage;

    for (let seed = 1; seed <= 25; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook,
        stages: [panelStage],
        externalData: {
          'stage-1': [{ age: 5 }, { age: 6 }, { age: 7 }].map(
            (values, index) =>
              ({
                [entityPrimaryKeyProperty]: `roster-${index}`,
                type: 'person',
                [entityAttributesProperty]: values,
              }) as unknown as NcNode,
          ),
        },
      });

      expect(network.nodes).toHaveLength(3);
      for (const node of network.nodes) {
        const age = Number(node[entityAttributesProperty].age);
        expect(age).toBeGreaterThanOrEqual(18);
        expect(age).toBeLessThanOrEqual(100);
      }
    }
  });

  it(`passes over a row whose gap a prompt fills with a value the rules reject, over ${SEEDS} seeds`, () => {
    // The prompt's value only reaches the nodes whose row leaves the variable
    // unset, so which nodes hold it depends on the row — data, settled here,
    // rather than the protocol-wide refusal a fabricating stage would get.
    const codebook = personCodebook({
      band: { name: 'Band', type: 'ordinal', options: bands },
    });
    const rows = rowsOf([{}, { band: 2 }, {}, { band: 3 }, {}, { band: 1 }]);
    const failures: string[] = [];

    for (let seed = 1; seed <= SEEDS; seed++) {
      const drawn = drawnOver(codebook, rows, 3, seed, {
        additionalAttributes: [{ variable: 'band', value: true }],
      }).map(({ band }) => Number(band));

      complain(
        failures,
        drawn.toSorted((a, b) => a - b).join(',') === '1,2,3',
        () => `seed ${seed}: bands ${drawn.join(', ')}, not the three rows`,
      );
    }

    expect(failures).toEqual([]);
  });

  it('refuses a prompt fixing a value its variable cannot hold', () => {
    // A prompt states the value itself, so whether the variable can hold it is
    // protocol rather than draw: refused on every seed or on none.
    const codebook = personCodebook({
      band: { name: 'Band', type: 'ordinal', options: bands },
    });
    const fixing = {
      id: 'stage-1',
      type: 'NameGenerator',
      label: 'Name generator',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'p1',
          text: 'Name people',
          additionalAttributes: [{ variable: 'band', value: true }],
        },
      ],
      behaviours: { minNodes: 3, maxNodes: 3 },
    } as unknown as Stage;

    for (const seed of [1, 2, 3, 4, 5]) {
      const build = () => generateNetwork({ seed, codebook, stages: [fixing] });

      expect(build).toThrow(SyntheticDataConstraintError);
      expect(build).toThrow(
        'a prompt fixes this variable to true, which options does not allow',
      );
    }
  });
});

/**
 * A prompt's `additionalAttributes` are written onto every node the prompt
 * creates, not drawn once per node, so a value a prompt fixes cannot vary with
 * the seed. Fixing a `unique` value on a stage that can create more than one
 * person therefore asks for a value two people hold, which no assignment
 * satisfies — and asks for it on every seed, so it is refused before the draw
 * rather than discovered partway through one.
 */
describe('a unique value a prompt fixes', () => {
  /** A name generator pinning `flagged` on every person it creates. */
  function fixingStage(nodes: number, id = 'stage-fix'): Stage {
    return {
      id,
      type: 'NameGenerator',
      label: 'Name generator',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: `${id}-p1`,
          text: 'Name people',
          additionalAttributes: [{ variable: 'flagged', value: true }],
        },
      ],
      behaviours: { minNodes: nodes, maxNodes: nodes },
    } as unknown as Stage;
  }

  const uniqueFlag = personCodebook({
    flagged: { name: 'Flagged', type: 'boolean', validation: { unique: true } },
  });

  it('refuses a stage that can create two people holding it', () => {
    const build = () =>
      generateNetwork({
        seed: 3,
        codebook: uniqueFlag,
        stages: [fixingStage(2)],
      });

    expect(build).toThrow(SyntheticDataConstraintError);
    expect(build).toThrow(
      'a prompt fixes this to true on up to 2 nodes, but unique allows one node to hold a value',
    );
  });

  it('refuses two stages that fix it once each', () => {
    // Neither stage spends the value twice on its own; between them they spend
    // it twice, which is what `unique` counts.
    expect(() =>
      generateNetwork({
        seed: 3,
        codebook: uniqueFlag,
        stages: [fixingStage(1, 'stage-a'), fixingStage(1, 'stage-b')],
      }),
    ).toThrow(SyntheticDataConstraintError);
  });

  it(`generates a one-person stage whose two prompts both fix it, over ${SEEDS} seeds`, () => {
    // The node ceiling belongs to the stage, not to each of its prompts:
    // `createNodesForStage` counts every prompt against the same `maxNodes`, so
    // a stage allowed one person creates one person however many of its prompts
    // fix the value, and one holder is what `unique` allows.
    const failures: string[] = [];
    const twoPrompts = {
      ...fixingStage(1),
      prompts: [
        {
          id: 'p1',
          text: 'Name people',
          additionalAttributes: [{ variable: 'flagged', value: true }],
        },
        {
          id: 'p2',
          text: 'Name more people',
          additionalAttributes: [{ variable: 'flagged', value: true }],
        },
      ],
    } as unknown as Stage;

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook: uniqueFlag,
        stages: [twoPrompts],
      });
      const flags = network.nodes.map(
        (node) => node[entityAttributesProperty].flagged,
      );

      complain(
        failures,
        flags.length === 1 && flags[0] === true,
        () => `seed ${seed}: flags ${JSON.stringify(flags)}, not [true]`,
      );
    }

    expect(failures).toEqual([]);
  });

  it('refuses it on a variable held equal to a unique one', () => {
    // `flagged` is not itself unique; it shares a value with one that is, so
    // fixing it spends the group's value just as fixing `token` would.
    const build = () =>
      generateNetwork({
        seed: 3,
        codebook: personCodebook({
          token: {
            name: 'Token',
            type: 'boolean',
            validation: { unique: true },
          },
          flagged: {
            name: 'Flagged',
            type: 'boolean',
            validation: { sameAs: 'token' },
          },
        }),
        stages: [fixingStage(2)],
      });

    expect(build).toThrow(SyntheticDataConstraintError);
    expect(build).toThrow('(unique, additionalAttributes)');
    expect(build).toThrow('these variables, which are held equal, to true');
  });

  it('refuses identically regardless of seed', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(() =>
        generateNetwork({
          seed,
          codebook: uniqueFlag,
          stages: [fixingStage(2)],
        }),
      ).toThrow(SyntheticDataConstraintError);
    }
  });

  it(`generates a stage that creates one person holding it, over ${SEEDS} seeds`, () => {
    const failures: string[] = [];

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook: uniqueFlag,
        stages: [fixingStage(1)],
      });
      const flags = network.nodes.map(
        (node) => node[entityAttributesProperty].flagged,
      );

      complain(
        failures,
        flags.length === 1 && flags[0] === true,
        () => `seed ${seed}: flags ${JSON.stringify(flags)}, not [true]`,
      );
    }

    expect(failures).toEqual([]);
  });

  it(`generates two people holding a fixed value no rule holds unique, over ${SEEDS} seeds`, () => {
    const failures: string[] = [];
    const codebook = personCodebook({
      flagged: { name: 'Flagged', type: 'boolean' },
    });

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook,
        stages: [fixingStage(2)],
      });
      const flags = network.nodes.map(
        (node) => node[entityAttributesProperty].flagged,
      );

      complain(
        failures,
        flags.length === 2 && flags.every((flag) => flag === true),
        () => `seed ${seed}: flags ${JSON.stringify(flags)}, not [true, true]`,
      );
    }

    expect(failures).toEqual([]);
  });

  it(`keeps a fixed value away from an earlier stage's draw, over ${SEEDS} seeds`, () => {
    // A prompt's value only reaches the registry when its node is built, which
    // is too late for the stages before it: the first stage drew the opening
    // value of the sequence, the second fixed the same one, and the pair came
    // out identical on every seed. The protocol is satisfiable — the earlier
    // draw simply has to go elsewhere — so it must generate, not be refused.
    const failures: string[] = [];
    const stages = [
      {
        id: 'stage-draw',
        type: 'NameGenerator',
        label: 'Name generator',
        subject: { entity: 'node', type: 'person' },
        prompts: [{ id: 'p1', text: 'Name people' }],
        behaviours: { minNodes: 1, maxNodes: 1 },
      } as unknown as Stage,
      fixingStage(1),
    ];

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook: uniqueFlag,
        stages,
      });
      const flags = network.nodes.map(
        (node) => node[entityAttributesProperty].flagged,
      );

      complain(
        failures,
        flags.length === 2,
        () => `seed ${seed}: ${flags.length} nodes, not 2`,
      );
      complain(
        failures,
        new Set(flags).size === flags.length,
        () => `seed ${seed}: flags ${JSON.stringify(flags)} repeat`,
      );
      complain(
        failures,
        flags.includes(true),
        () =>
          `seed ${seed}: flags ${JSON.stringify(flags)} lost the fixed value`,
      );
    }

    expect(failures).toEqual([]);
  });

  it(`keeps a fixed value away from a later stage's draw, over ${SEEDS} seeds`, () => {
    // The mirror of the above, where the fixed value is already claimed by the
    // time the drawing stage runs. It passed before the reservation existed and
    // has to keep passing: a hold that displaced the claim would trade one
    // ordering's duplicate for the other's.
    const failures: string[] = [];
    const stages = [
      fixingStage(1),
      {
        id: 'stage-draw',
        type: 'NameGenerator',
        label: 'Name generator',
        subject: { entity: 'node', type: 'person' },
        prompts: [{ id: 'p1', text: 'Name people' }],
        behaviours: { minNodes: 1, maxNodes: 1 },
      } as unknown as Stage,
    ];

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook: uniqueFlag,
        stages,
      });
      const flags = network.nodes.map(
        (node) => node[entityAttributesProperty].flagged,
      );

      complain(
        failures,
        flags.length === 2 && new Set(flags).size === 2,
        () => `seed ${seed}: flags ${JSON.stringify(flags)} repeat`,
      );
    }

    expect(failures).toEqual([]);
  });

  it(`fills a value space a fixed value exactly completes, over ${SEEDS} seeds`, () => {
    // Three bands for three people, one of them pinned to band 2. Nothing here
    // is slack: a draw that takes band 2 before the pinned person arrives
    // leaves a duplicate with nowhere else to go.
    const failures: string[] = [];
    const codebook = personCodebook({
      band: {
        name: 'Band',
        type: 'ordinal',
        options: [1, 2, 3].map((value) => ({ label: `Band ${value}`, value })),
        validation: { unique: true },
      },
    });
    const bandStage = (id: string, nodes: number, fixed?: number): Stage =>
      ({
        id,
        type: 'NameGenerator',
        label: 'Name generator',
        subject: { entity: 'node', type: 'person' },
        prompts: [
          {
            id: `${id}-p1`,
            text: 'Name people',
            ...(fixed === undefined
              ? {}
              : { additionalAttributes: [{ variable: 'band', value: fixed }] }),
          },
        ],
        behaviours: { minNodes: nodes, maxNodes: nodes },
      }) as unknown as Stage;
    const stages = [bandStage('stage-draw', 2), bandStage('stage-fix', 1, 2)];

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({ seed, codebook, stages });
      const bands = network.nodes.map((node) =>
        Number(node[entityAttributesProperty].band),
      );

      complain(
        failures,
        bands.length === 3 && new Set(bands).size === 3,
        () => `seed ${seed}: bands ${bands.join(', ')} repeat a unique value`,
      );
      complain(
        failures,
        bands.includes(2),
        () => `seed ${seed}: bands ${bands.join(', ')} lost the fixed value`,
      );
    }

    expect(failures).toEqual([]);
  });

  it(`keeps a fixed value held while a roster stage holds it too, over ${SEEDS} seeds`, () => {
    // A roster row carries band 3 and a later prompt fixes band 3 as well, so
    // both want it held back at once. The roster gives its hold up when its
    // draw ends, and if that took the prompt's hold with it the middle stage
    // would be free to draw band 3 and duplicate the pinned person. Bands 1 and
    // 2 go to the roster so band 3 is the next one the middle stage's draw
    // reaches, where a hold that survived is the only thing sending it past.
    //
    // The fixing stage draws from a roster row of its own, which is what keeps
    // this protocol one the run will accept: every node it builds comes from a
    // row, so the value it fixes reaches a node only where the network can
    // still take it. A stage that could fabricate would write band 3 onto a
    // person of its own however the roster's own band 3 row was drawn, and
    // `analyseFeasibility` refuses that pairing before a seed is consulted.
    //
    // Judged only on the seeds that leave the roster's band 3 row in the pool.
    // The seeds that draw it hand the fixing stage a value the network already
    // holds, and its row is passed over — a stage drawing nobody rather than a
    // duplicate, and not what this fixture is about.
    const failures: string[] = [];
    const codebook = personCodebook({
      band: {
        name: 'Band',
        type: 'ordinal',
        options: [1, 2, 3, 4].map((value) => ({
          label: `Band ${value}`,
          value,
        })),
        validation: { unique: true },
      },
    });
    const rows = [1, 2, 3].map(
      (band, index) =>
        ({
          [entityPrimaryKeyProperty]: `roster-${index}`,
          type: 'person',
          [entityAttributesProperty]: { band },
        }) as unknown as NcNode,
    );
    const stages = [
      {
        id: 'stage-roster',
        type: 'NameGeneratorRoster',
        label: 'Roster',
        subject: { entity: 'node', type: 'person' },
        prompts: [{ id: 'p1', text: 'Pick people' }],
        behaviours: { minNodes: 2, maxNodes: 2 },
      } as unknown as Stage,
      {
        id: 'stage-draw',
        type: 'NameGenerator',
        label: 'Name generator',
        subject: { entity: 'node', type: 'person' },
        prompts: [{ id: 'p2', text: 'Name people' }],
        behaviours: { minNodes: 1, maxNodes: 1 },
      } as unknown as Stage,
      {
        id: 'stage-fix',
        type: 'NameGeneratorRoster',
        label: 'Roster',
        subject: { entity: 'node', type: 'person' },
        prompts: [
          {
            id: 'p3',
            text: 'Pick someone',
            additionalAttributes: [{ variable: 'band', value: 3 }],
          },
        ],
        behaviours: { minNodes: 1, maxNodes: 1 },
      } as unknown as Stage,
    ];

    /** The fixing stage's own row, which leaves `band` to the prompt. */
    const fixedRow = {
      [entityPrimaryKeyProperty]: 'fixed-0',
      type: 'person',
      [entityAttributesProperty]: {},
    } as unknown as NcNode;

    let judged = 0;

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook,
        stages,
        externalData: {
          'stage-roster': rows.map((row) => ({ ...row })),
          'stage-fix': [{ ...fixedRow }],
        },
      });

      if (
        network.nodes.some(
          (node) => node[entityPrimaryKeyProperty] === 'roster-2',
        )
      ) {
        continue;
      }
      judged += 1;

      const bands = network.nodes.map((node) =>
        Number(node[entityAttributesProperty].band),
      );

      complain(
        failures,
        bands.length === 4 && new Set(bands).size === 4,
        () => `seed ${seed}: bands ${bands.join(', ')} repeat a unique value`,
      );
    }

    expect(failures).toEqual([]);
    expect(judged).toBeGreaterThan(0);
  });

  it(`gives a held value up to a draw with nowhere else to go, over ${SEEDS} seeds`, () => {
    // Three bands, three people, and a hold on band 2 that the run may never
    // spend: the prompt's value reaches only the row leaving `band` unset, and
    // the roster stage takes two of its three rows. On the seeds that draw the
    // two rows carrying bands 1 and 3, band 2 is the one value left for the
    // fabricated person — so the hold has to give way. A claim in its place
    // would refuse a protocol that generates perfectly well.
    const failures: string[] = [];
    const codebook = personCodebook({
      band: {
        name: 'Band',
        type: 'ordinal',
        options: [1, 2, 3].map((value) => ({ label: `Band ${value}`, value })),
        validation: { unique: true },
      },
    });
    const rows = [{ band: 1 }, { band: 3 }, {}].map(
      (attributes, index) =>
        ({
          [entityPrimaryKeyProperty]: `roster-${index}`,
          type: 'person',
          [entityAttributesProperty]: attributes,
        }) as unknown as NcNode,
    );
    const stages = [
      {
        id: 'stage-roster',
        type: 'NameGeneratorRoster',
        label: 'Roster',
        subject: { entity: 'node', type: 'person' },
        prompts: [
          {
            id: 'p1',
            text: 'Pick people',
            additionalAttributes: [{ variable: 'band', value: 2 }],
          },
        ],
        behaviours: { minNodes: 2, maxNodes: 2 },
      } as unknown as Stage,
      {
        id: 'stage-fabricate',
        type: 'NameGenerator',
        label: 'Name generator',
        subject: { entity: 'node', type: 'person' },
        prompts: [{ id: 'p2', text: 'Name someone else' }],
        behaviours: { minNodes: 1, maxNodes: 1 },
      } as unknown as Stage,
    ];

    let spentTheHold = 0;

    for (let seed = 1; seed <= SEEDS; seed++) {
      let nodes: NcNode[] = [];
      try {
        const { network } = generateNetwork({
          seed,
          codebook,
          stages,
          externalData: { 'stage-roster': rows.map((row) => ({ ...row })) },
        });
        nodes = network.nodes;
      } catch (error) {
        failures.push(`seed ${seed}: refused — ${String(error)}`);
        continue;
      }

      const bands = nodes.map((node) =>
        Number(node[entityAttributesProperty].band),
      );
      // The prompt's value lands only on the row leaving `band` unset, so a
      // draw that passed that row over is one where the hold was never spent.
      const drewTheUnsetRow = nodes.some(
        (node) => node[entityPrimaryKeyProperty] === 'roster-2',
      );
      if (!drewTheUnsetRow) spentTheHold += 1;

      complain(
        failures,
        bands.length === 3 && new Set(bands).size === 3,
        () => `seed ${seed}: bands ${bands.join(', ')} repeat a unique value`,
      );
    }

    expect(failures).toEqual([]);
    // Without seeds that leave band 2 unspent, nothing above needed the hold to
    // give way and the assertion would hold under a claim as well.
    expect(spentTheHold).toBeGreaterThan(0);
  });

  it('generates a roster stage whose rows all supply the fixed variable', () => {
    // The row's own value wins over the prompt's on a roster stage, so the
    // fixed value never reaches a node and there is nothing to refuse.
    const rows = [true, false].map(
      (flagged, index) =>
        ({
          [entityPrimaryKeyProperty]: `roster-${index}`,
          type: 'person',
          [entityAttributesProperty]: { flagged },
        }) as unknown as NcNode,
    );
    const stage = {
      id: 'stage-roster',
      type: 'NameGeneratorRoster',
      label: 'Roster',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'p1',
          text: 'Pick people',
          additionalAttributes: [{ variable: 'flagged', value: true }],
        },
      ],
      behaviours: { minNodes: 2, maxNodes: 2 },
    } as unknown as Stage;

    const { network } = generateNetwork({
      seed: 3,
      codebook: uniqueFlag,
      stages: [stage],
      externalData: { 'stage-roster': rows.map((row) => ({ ...row })) },
    });

    expect(
      network.nodes
        .map((node) => node[entityAttributesProperty].flagged)
        .toSorted((a, b) => Number(a) - Number(b)),
    ).toEqual([false, true]);
  });
});

/**
 * A roster row's values are the researcher's, so two rows can offer one value
 * for a variable the codebook marks `unique`. A roster is a pool of candidates
 * the run draws a subset of, so the answer is to leave the second row undrawn
 * rather than refuse the protocol — refusing would fail a roster of hundreds of
 * rows over a pair the draw might never have reached.
 */
describe('a unique value two roster rows share', () => {
  const banded = personCodebook({
    band: {
      name: 'Band',
      type: 'ordinal',
      options: [1, 2, 3, 4, 5].map((value) => ({
        label: `Band ${value}`,
        value,
      })),
      validation: { unique: true },
    },
  });

  function rosterOf(bands: number[]): NcNode[] {
    return bands.map(
      (band, index) =>
        ({
          [entityPrimaryKeyProperty]: `roster-${index}`,
          type: 'person',
          [entityAttributesProperty]: { band },
        }) as unknown as NcNode,
    );
  }

  const rosterStage = {
    id: 'stage-roster',
    type: 'NameGeneratorRoster',
    label: 'Roster',
    subject: { entity: 'node', type: 'person' },
    prompts: [{ id: 'p1', text: 'Pick people' }],
    behaviours: { minNodes: 3, maxNodes: 3 },
  } as unknown as Stage;

  function bandsFor(seed: number, bands: number[]): number[] {
    const { network } = generateNetwork({
      seed,
      codebook: banded,
      stages: [rosterStage],
      externalData: { 'stage-roster': rosterOf(bands) },
    });
    return network.nodes.map((node) =>
      Number(node[entityAttributesProperty].band),
    );
  }

  it(`passes over the row that repeats it, over ${SEEDS} seeds`, () => {
    const failures: string[] = [];

    for (let seed = 1; seed <= SEEDS; seed++) {
      const drawn = bandsFor(seed, [1, 1, 3]);

      complain(
        failures,
        new Set(drawn).size === drawn.length,
        () => `seed ${seed}: bands ${drawn.join(', ')} repeat a unique value`,
      );
      // One of the two band 1 rows is usable, and so is band 3; the row
      // repeating band 1 is not, so the stage stops one person short of three.
      complain(
        failures,
        drawn.toSorted((a, b) => a - b).join(',') === '1,3',
        () => `seed ${seed}: bands ${drawn.join(', ')}, not 1 and 3`,
      );
    }

    expect(failures).toEqual([]);
  });

  it(`draws every row when their values differ, over ${SEEDS} seeds`, () => {
    const failures: string[] = [];

    for (let seed = 1; seed <= SEEDS; seed++) {
      const drawn = bandsFor(seed, [1, 2, 3]);

      complain(
        failures,
        drawn.toSorted((a, b) => a - b).join(',') === '1,2,3',
        () => `seed ${seed}: bands ${drawn.join(', ')}, not all three rows`,
      );
    }

    expect(failures).toEqual([]);
  });
});

/**
 * A FamilyPedigree stage marks exactly one of its nodes as ego — the runtime's
 * `egoCellTransform` sets the flag true on the proband and explicitly false on
 * everybody else — so the flag is a third value fixed for a node rather than
 * drawn for it, alongside a roster row's and a prompt's `additionalAttributes`.
 * A rule spanning it and a drawn variable breaks the same way if the node is
 * generated first and the flag written over the top afterwards.
 */
describe('rules spanning a pedigree ego flag and a drawn attribute', () => {
  /** A pedigree stage marking its first node ego through `isEgo`. */
  const pedigreeStage = {
    id: 'stage-pedigree',
    type: 'FamilyPedigree',
    label: 'Family',
    nodeConfig: {
      type: 'person',
      nodeLabelVariable: 'name',
      egoVariable: 'isEgo',
    },
    edgeConfig: { type: 'family' },
  } as unknown as Stage;

  /** A person carrying a display name and whatever a case declares of its own. */
  function pedigreeCodebook(variables: Record<string, unknown>): Codebook {
    return {
      ...personCodebook({ name: { name: 'Name', type: 'text' }, ...variables }),
      edge: { family: { color: 'edge-color-seq-1', variables: {} } },
    } as unknown as Codebook;
  }

  function pedigreeNodes(
    seed: number,
    codebook: Codebook,
    stages: Stage[] = [pedigreeStage],
  ): NcNode[] {
    const { network } = generateNetwork({ seed, codebook, stages });
    return network.nodes;
  }

  function attributesOf(nodes: NcNode[]): Record<string, unknown>[] {
    return nodes.map((node) => node[entityAttributesProperty]);
  }

  /** One node ego and the rest not, which every case below relies on. */
  function complainAboutTheFlag(
    failures: string[],
    seed: number,
    nodes: NcNode[],
  ): void {
    complain(
      failures,
      nodes.length > 1,
      () => `seed ${seed}: ${nodes.length} pedigree nodes, not several`,
    );
    attributesOf(nodes).forEach((attrs, index) => {
      complain(
        failures,
        attrs.isEgo === (index === 0),
        () =>
          `seed ${seed}: node ${index} carries isEgo ${String(attrs.isEgo)}`,
      );
    });
  }

  it(`holds a sameAs pair equal to the ego flag, over ${SEEDS} seeds`, () => {
    const failures: string[] = [];
    const codebook = pedigreeCodebook({
      isEgo: { name: 'Is ego', type: 'boolean' },
      flag: { name: 'Flag', type: 'boolean', validation: { sameAs: 'isEgo' } },
    });

    for (let seed = 1; seed <= SEEDS; seed++) {
      const nodes = pedigreeNodes(seed, codebook);
      complainAboutTheFlag(failures, seed, nodes);

      attributesOf(nodes).forEach((attrs, index) => {
        complain(
          failures,
          attrs.flag === attrs.isEgo,
          () =>
            `seed ${seed}: node ${index} flag ${String(attrs.flag)} is not isEgo ${String(attrs.isEgo)}`,
        );
      });
    }

    expect(failures).toEqual([]);
  });

  it(`holds a differentFrom pair apart from the ego flag, over ${SEEDS} seeds`, () => {
    const failures: string[] = [];
    const codebook = pedigreeCodebook({
      isEgo: { name: 'Is ego', type: 'boolean' },
      flag: {
        name: 'Flag',
        type: 'boolean',
        validation: { differentFrom: 'isEgo' },
      },
    });

    for (let seed = 1; seed <= SEEDS; seed++) {
      const nodes = pedigreeNodes(seed, codebook);
      complainAboutTheFlag(failures, seed, nodes);

      attributesOf(nodes).forEach((attrs, index) => {
        complain(
          failures,
          attrs.flag !== attrs.isEgo,
          () =>
            `seed ${seed}: node ${index} flag ${String(attrs.flag)} equals isEgo ${String(attrs.isEgo)}`,
        );
      });
    }

    expect(failures).toEqual([]);
  });

  it(`orders a comparator against the ego flag, over ${SEEDS} seeds`, () => {
    const failures: string[] = [];
    // A comparison rule may only name a number, datetime or scalar variable, so
    // the shape that puts one across the flag is a pedigree whose ego marker
    // the codebook declares as a number over 0-1. What the stage writes is
    // still the runtime's true/false, which compares as 1 and 0 — so `rank`
    // clears a different ceiling on the proband than on everybody else, and a
    // rank drawn against a flag the node does not end up holding is caught.
    const codebook = pedigreeCodebook({
      isEgo: {
        name: 'Ego marker',
        type: 'number',
        validation: { minValue: 0, maxValue: 1 },
      },
      rank: {
        name: 'Rank',
        type: 'number',
        validation: { minValue: -5, maxValue: 5, lessThanVariable: 'isEgo' },
      },
    });

    for (let seed = 1; seed <= SEEDS; seed++) {
      const nodes = pedigreeNodes(seed, codebook);
      complainAboutTheFlag(failures, seed, nodes);

      attributesOf(nodes).forEach((attrs, index) => {
        complain(
          failures,
          Number(attrs.rank) < Number(attrs.isEgo),
          () =>
            `seed ${seed}: node ${index} rank ${String(attrs.rank)} is not below isEgo ${String(attrs.isEgo)}`,
        );
      });
    }

    expect(failures).toEqual([]);
  });

  it('draws a pedigree no rule reads the flag of exactly as it always did', () => {
    // Settling the flag before the draw takes the variable out of the draw,
    // which moves every random number after it. A pedigree nothing resolves the
    // flag against gains nothing from that and must keep the values it had, so
    // it is still drawn whole and the flag written on afterwards. Held against
    // the same protocol naming no ego variable at all — the run that never pins
    // anything — where only the flag itself may differ.
    const codebook = pedigreeCodebook({
      isEgo: { name: 'Is ego', type: 'boolean' },
      age: {
        name: 'Age',
        type: 'number',
        validation: { minValue: 0, maxValue: 100 },
      },
      alive: { name: 'Alive', type: 'boolean' },
    });
    const unpinned = {
      ...pedigreeStage,
      nodeConfig: { type: 'person', nodeLabelVariable: 'name' },
    } as unknown as Stage;
    // A later stage as well, so a shifted random stream shows up in what the
    // rest of the protocol draws and not only inside the pedigree.
    const laterStage = {
      id: 'stage-ng',
      type: 'NameGenerator',
      label: 'More people',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', text: 'Name people' }],
      behaviours: { minNodes: 3, maxNodes: 3 },
    } as unknown as Stage;

    const withoutFlag = (attrs: Record<string, unknown>) => {
      const { isEgo: _isEgo, ...rest } = attrs;
      return rest;
    };

    for (let seed = 1; seed <= 25; seed++) {
      const pinned = pedigreeNodes(seed, codebook, [pedigreeStage, laterStage]);

      expect(attributesOf(pinned).map(withoutFlag)).toEqual(
        attributesOf(pedigreeNodes(seed, codebook, [unpinned, laterStage])).map(
          withoutFlag,
        ),
      );

      const fromPedigree = pinned.filter(
        (node) => node.stageId === pedigreeStage.id,
      );
      expect(fromPedigree.length).toBeGreaterThan(1);
      expect(attributesOf(fromPedigree).map((attrs) => attrs.isEgo)).toEqual(
        fromPedigree.map((_node, index) => index === 0),
      );
    }
  });
});

/**
 * A stage's prompts share one node ceiling and spend it in order, so a stage
 * whose first prompts fill it reaches the rest with nothing left: they return
 * before drawing, on every seed, and the values they fix are written onto
 * nobody. A refusal over those values would fail a protocol that generates
 * perfectly well, while a prompt that can still draw on some seed keeps every
 * refusal it had — a value only that seed reaches is exactly the failure
 * deciding this up front exists to prevent.
 */
describe('a prompt the stage node ceiling leaves nothing for', () => {
  const differentFromPair = personCodebook({
    a: { name: 'A', type: 'boolean' },
    b: { name: 'B', type: 'boolean', validation: { differentFrom: 'a' } },
  });
  const plainPair = personCodebook({
    a: { name: 'A', type: 'boolean' },
    b: { name: 'B', type: 'boolean' },
  });

  /** A name generator whose second prompt pins `a` and `b` to one value. */
  function pinningSecondPrompt(minNodes: number, maxNodes: number): Stage {
    return {
      id: 'stage-1',
      type: 'NameGenerator',
      label: 'Name generator',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        { id: 'p1', text: 'Name people' },
        {
          id: 'p2',
          text: 'Name more people',
          additionalAttributes: [
            { variable: 'a', value: true },
            { variable: 'b', value: true },
          ],
        },
      ],
      behaviours: { minNodes, maxNodes },
    } as unknown as Stage;
  }

  /** How many of `SEEDS` runs give the second prompt a node of its own. */
  function seedsReachingTheSecondPrompt(
    minNodes: number,
    maxNodes: number,
  ): number {
    let reached = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook: plainPair,
        stages: [pinningSecondPrompt(minNodes, maxNodes)],
      });
      if (network.nodes.some((node) => node.promptIDs?.includes('p2'))) {
        reached += 1;
      }
    }
    return reached;
  }

  it('never reaches a second prompt on a stage allowed one person', () => {
    // The premise the acceptance below rests on: at a floor equal to the
    // ceiling the first prompt spends the stage whole, so this is not a prompt
    // some other seed would have reached.
    expect(seedsReachingTheSecondPrompt(1, 1)).toBe(0);
  });

  it(`generates a stage whose unreachable prompt fixes a pair no rule allows, over ${SEEDS} seeds`, () => {
    const failures: string[] = [];

    for (let seed = 1; seed <= SEEDS; seed++) {
      let nodes: NcNode[] = [];
      try {
        nodes = generateNetwork({
          seed,
          codebook: differentFromPair,
          stages: [pinningSecondPrompt(1, 1)],
        }).network.nodes;
      } catch (error) {
        failures.push(`seed ${seed}: refused with ${String(error)}`);
        continue;
      }

      complain(
        failures,
        nodes.length === 1,
        () => `seed ${seed}: ${nodes.length} nodes, not 1`,
      );
      for (const node of nodes) {
        const { a, b } = node[entityAttributesProperty];
        complain(
          failures,
          a !== b,
          () => `seed ${seed}: a and b are both ${JSON.stringify(a)}`,
        );
      }
    }

    expect(failures).toEqual([]);
  });

  it('still refuses the same pin where the prompt can be reached', () => {
    // A floor below the ceiling leaves the first prompt able to stop short, so
    // the second draws on some seeds — and a value only those seeds reach is
    // still a value no seed may reach.
    expect(seedsReachingTheSecondPrompt(1, 2)).toBeGreaterThan(0);

    const build = () =>
      generateNetwork({
        seed: 3,
        codebook: differentFromPair,
        stages: [pinningSecondPrompt(1, 2)],
      });

    expect(build).toThrow(SyntheticDataConstraintError);
    expect(build).toThrow(
      'a prompt fixes these variables to true and true, which differentFrom cannot hold',
    );
  });

  it('refuses regardless of seed where the prompt can be reached', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(() =>
        generateNetwork({
          seed,
          codebook: differentFromPair,
          stages: [pinningSecondPrompt(1, 2)],
        }),
      ).toThrow(SyntheticDataConstraintError);
    }
  });

  it('reaches the third prompt only while the ceiling still allows it', () => {
    // Two people each at minimum spend a ceiling of three, so a third prompt
    // is out of reach at a floor of two and inside it at a floor of one.
    const reach = (minNodes: number, promptId: string): number => {
      const stage = {
        id: 'stage-1',
        type: 'NameGenerator',
        label: 'Name generator',
        subject: { entity: 'node', type: 'person' },
        prompts: [
          { id: 'p1', text: 'One' },
          { id: 'p2', text: 'Two' },
          { id: 'p3', text: 'Three' },
        ],
        behaviours: { minNodes, maxNodes: 3 },
      } as unknown as Stage;

      let reached = 0;
      for (let seed = 1; seed <= SEEDS; seed++) {
        const { network } = generateNetwork({
          seed,
          codebook: plainPair,
          stages: [stage],
        });
        if (network.nodes.some((node) => node.promptIDs?.includes(promptId))) {
          reached += 1;
        }
      }
      return reached;
    };

    expect(reach(2, 'p2')).toBeGreaterThan(0);
    expect(reach(2, 'p3')).toBe(0);
    expect(reach(1, 'p3')).toBeGreaterThan(0);
  });
});

/**
 * Roster rows are values the run is handed before it starts, so the draws that
 * come before their stage are steered off them exactly as they are steered off
 * a value a prompt fixes. Held only while the row's own stage drew, a
 * fabricated person took the value first and the row became a duplicate of what
 * the network already held — passed over for good, so the roster lost a person
 * a different draw would have left room for.
 *
 * The hold is given back once the row's stage has had its chance to draw: rows
 * are keyed by stage, so a row that stage did not take is one nobody is waiting
 * for, and holding its value any longer would narrow every draw that follows.
 */
describe('roster values held against an earlier stage', () => {
  const uniqueFlag = personCodebook({
    flag: { name: 'Flag', type: 'boolean', validation: { unique: true } },
  });

  function fabricatingStage(id: string): Stage {
    return {
      id,
      type: 'NameGenerator',
      label: 'Name someone',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: `${id}-p1`, text: 'Name someone' }],
      behaviours: { minNodes: 1, maxNodes: 1 },
    } as unknown as Stage;
  }

  function rosterStage(id: string): Stage {
    return {
      id,
      type: 'NameGeneratorRoster',
      label: 'Pick someone',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: `${id}-p1`, text: 'Pick someone' }],
      behaviours: { minNodes: 1, maxNodes: 1 },
    } as unknown as Stage;
  }

  /** Rows under their own id prefix: one person is never in two rosters. */
  function rowsOf(
    attributes: Record<string, unknown>[],
    prefix = 'roster',
  ): NcNode[] {
    return attributes.map(
      (values, index) =>
        ({
          [entityPrimaryKeyProperty]: `${prefix}-${index}`,
          type: 'person',
          [entityAttributesProperty]: values,
        }) as unknown as NcNode,
    );
  }

  it(`leaves a later roster row the unique value it carries, over ${SEEDS} seeds`, () => {
    // One fabricated person and a one-row roster carrying `true`. Reserving the
    // row's value up front sends the fabricated draw to `false`, so both people
    // are made; taking the reservation only once the roster stage began left
    // the row a duplicate and the network one person short.
    const failures: string[] = [];

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook: uniqueFlag,
        stages: [fabricatingStage('stage-fab'), rosterStage('stage-roster')],
        externalData: { 'stage-roster': rowsOf([{ flag: true }]) },
      });

      const shape = network.nodes.map((node) => ({
        stage: node.stageId,
        flag: node[entityAttributesProperty].flag,
      }));

      complain(
        failures,
        shape.length === 2 &&
          shape[0]?.stage === 'stage-fab' &&
          shape[0].flag === false &&
          shape[1]?.stage === 'stage-roster' &&
          shape[1].flag === true,
        () => `seed ${seed}: ${JSON.stringify(shape)}`,
      );
    }

    expect(failures).toEqual([]);
  });

  it(`gives the hold back once the row's stage has drawn, over ${SEEDS} seeds`, () => {
    // The roster's only row breaks its own `maxLength`, so no draw can build a
    // person from it and the roster stage adds nobody. The value it was holding
    // has to come back: a later person is free to be issued `true`, and a hold
    // nothing is waiting for would push every draw after it somewhere else.
    const codebook = personCodebook({
      flag: { name: 'Flag', type: 'boolean', validation: { unique: true } },
      code: {
        name: 'Code',
        type: 'text',
        validation: { minLength: 2, maxLength: 4 },
      },
    });
    const failures: string[] = [];

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook,
        stages: [rosterStage('stage-roster'), fabricatingStage('stage-fab')],
        externalData: {
          'stage-roster': rowsOf([{ flag: true, code: 'far too long' }]),
        },
      });

      const shape = network.nodes.map((node) => ({
        stage: node.stageId,
        flag: node[entityAttributesProperty].flag,
      }));

      complain(
        failures,
        shape.length === 1 &&
          shape[0]?.stage === 'stage-fab' &&
          shape[0].flag === true,
        () => `seed ${seed}: ${JSON.stringify(shape)}`,
      );
    }

    expect(failures).toEqual([]);
  });

  it(`keeps a later stage's rows held while an earlier roster draws, over ${SEEDS} seeds`, () => {
    // Each stage holds its own rows, so giving the first stage's hold back must
    // leave the second's alone. Three ranks and three people, with the last
    // roster carrying the rank the fabricated draw would otherwise reach for:
    // only a hold that survives the stage before it sends that draw to the rank
    // nobody is waiting for.
    const codebook = personCodebook({
      rank: {
        name: 'Rank',
        type: 'ordinal',
        options: [1, 2, 3].map((value) => ({ label: `Rank ${value}`, value })),
        validation: { unique: true },
      },
    });
    const failures: string[] = [];

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook,
        stages: [
          rosterStage('stage-roster-a'),
          fabricatingStage('stage-fab'),
          rosterStage('stage-roster-b'),
        ],
        externalData: {
          'stage-roster-a': rowsOf([{ rank: 1 }], 'roster-a'),
          'stage-roster-b': rowsOf([{ rank: 2 }], 'roster-b'),
        },
      });

      const shape = network.nodes.map(
        (node) =>
          `${String(node.stageId)}:${JSON.stringify(node[entityAttributesProperty].rank)}`,
      );

      complain(
        failures,
        shape.join('|') === 'stage-roster-a:1|stage-fab:3|stage-roster-b:2',
        () => `seed ${seed}: ${JSON.stringify(shape)}`,
      );
    }

    expect(failures).toEqual([]);
  });
});

/**
 * A roster row and a prompt's `additionalAttributes` can both settle one
 * variable, and which of them wins belongs to the interface: the roster
 * interface lets the row's value win, while a name generator's panel lets the
 * prompt's win. Only one of the two ever reaches the node, so every judgement a
 * row is put to has to read that one — a row held to a value the prompt is
 * about to overwrite is passed over for nothing, and a row whose overwritten
 * value goes unexamined builds a node holding whatever the prompt says.
 */
describe('a variable a roster row and a prompt both settle', () => {
  const uniqueFlag = personCodebook({
    flag: { name: 'Flag', type: 'boolean', validation: { unique: true } },
    name: { name: 'Name', type: 'text' },
  });

  /** Rows under their own id prefix: one person is never in two rosters. */
  function rowsOf(
    attributes: Record<string, unknown>[],
    prefix: string,
  ): NcNode[] {
    return attributes.map(
      (values, index) =>
        ({
          [entityPrimaryKeyProperty]: `${prefix}-${index}`,
          type: 'person',
          [entityAttributesProperty]: values,
        }) as unknown as NcNode,
    );
  }

  /** A one-person stage, optionally fixing `flag` through its prompt. */
  function stageOf(id: string, type: string, fixes?: boolean): Stage {
    return {
      id,
      type,
      label: id,
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: `${id}-p1`,
          text: 'Name someone',
          ...(fixes === undefined
            ? {}
            : { additionalAttributes: [{ variable: 'flag', value: fixes }] }),
        },
      ],
      behaviours: { minNodes: 1, maxNodes: 1 },
    } as unknown as Stage;
  }

  function shapeOf(nodes: NcNode[]): string[] {
    return nodes.map((node) => {
      const { flag, name } = node[entityAttributesProperty];
      return `${String(node.stageId)}:${node[entityPrimaryKeyProperty]}:${String(flag)}:${String(name)}`;
    });
  }

  it(`writes a prompt's value over a panel row's, over ${SEEDS} seeds`, () => {
    const failures: string[] = [];

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook: uniqueFlag,
        stages: [stageOf('stage-panel', 'NameGenerator', false)],
        externalData: {
          'stage-panel': rowsOf([{ flag: true, name: 'Rowan' }], 'panel'),
        },
        config: { rosterDrawRatio: 1 },
      });

      const shape = shapeOf(network.nodes);
      complain(
        failures,
        shape.join('|') === 'stage-panel:panel-0:false:Rowan',
        () => `seed ${seed}: ${JSON.stringify(shape)}`,
      );
    }

    expect(failures).toEqual([]);
  });

  it(`writes a roster row's value over a prompt's, over ${SEEDS} seeds`, () => {
    const failures: string[] = [];

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook: uniqueFlag,
        stages: [stageOf('stage-roster', 'NameGeneratorRoster', false)],
        externalData: {
          'stage-roster': rowsOf([{ flag: true, name: 'Rowan' }], 'roster'),
        },
      });

      const shape = shapeOf(network.nodes);
      complain(
        failures,
        shape.join('|') === 'stage-roster:roster-0:true:Rowan',
        () => `seed ${seed}: ${JSON.stringify(shape)}`,
      );
    }

    expect(failures).toEqual([]);
  });

  it(`draws a panel row whose claimed value the prompt overwrites, over ${SEEDS} seeds`, () => {
    // The panel row carries the `true` an earlier stage has already claimed,
    // and the prompt overwrites it with `false` — so the person the row
    // describes is one the network can still take. Reading the row's own value
    // passed it over and fabricated a stranger in its place.
    const failures: string[] = [];

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook: uniqueFlag,
        stages: [
          stageOf('stage-roster', 'NameGeneratorRoster'),
          stageOf('stage-panel', 'NameGenerator', false),
        ],
        externalData: {
          'stage-roster': rowsOf([{ flag: true, name: 'Ann' }], 'roster'),
          'stage-panel': rowsOf([{ flag: true, name: 'Rowan' }], 'panel'),
        },
        config: { rosterDrawRatio: 1 },
      });

      const shape = shapeOf(network.nodes);
      complain(
        failures,
        shape.join('|') ===
          'stage-roster:roster-0:true:Ann|stage-panel:panel-0:false:Rowan',
        () => `seed ${seed}: ${JSON.stringify(shape)}`,
      );
    }

    expect(failures).toEqual([]);
  });

  it(`passes over a roster row whose gap the prompt fills with a claimed value, over ${SEEDS} seeds`, () => {
    // The second stage's row leaves `flag` for the prompt, which fixes the
    // `true` the first stage's row has already claimed: the node that row would
    // build is a duplicate of one the network holds, so the row is passed over
    // and the roster stage adds nobody. Reading the row alone saw no value at
    // all and drew it, and the finished network held `true` twice.
    const failures: string[] = [];

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook: uniqueFlag,
        stages: [
          stageOf('stage-first', 'NameGeneratorRoster'),
          stageOf('stage-second', 'NameGeneratorRoster', true),
        ],
        externalData: {
          'stage-first': rowsOf([{ flag: true, name: 'Ann' }], 'first'),
          'stage-second': rowsOf([{ name: 'Rowan' }], 'second'),
        },
      });

      const flags = network.nodes.map(
        (node) => node[entityAttributesProperty].flag,
      );
      complain(
        failures,
        new Set(flags.map((flag) => String(flag))).size === flags.length,
        () => `seed ${seed}: flags ${flags.map(String).join(', ')} repeat`,
      );
      complain(
        failures,
        shapeOf(network.nodes).join('|') === 'stage-first:first-0:true:Ann',
        () => `seed ${seed}: ${JSON.stringify(shapeOf(network.nodes))}`,
      );
    }

    expect(failures).toEqual([]);
  });
});

/**
 * Roster rows arrive as data, and a caller assembling them by hand can put one
 * primary key on two rows carrying different values. Each of them describes a
 * different person, so each has to be judged on the values it carries: a
 * verdict standing for the key rather than for the row copies whichever row the
 * draw happened to reach first onto the other.
 */
describe('two roster rows a caller gave one primary key', () => {
  const aged = personCodebook({
    age: {
      name: 'Age',
      type: 'number',
      validation: { minValue: 18, maxValue: 90 },
    },
  });

  const rosterStage = {
    id: 'stage-roster',
    type: 'NameGeneratorRoster',
    label: 'Roster',
    subject: { entity: 'node', type: 'person' },
    prompts: [{ id: 'p1', text: 'Pick people' }],
    behaviours: { minNodes: 2, maxNodes: 2 },
  } as unknown as Stage;

  /** Two rows sharing one key, in the order given. */
  function rowsAged(ages: number[]): NcNode[] {
    return ages.map(
      (age) =>
        ({
          [entityPrimaryKeyProperty]: 'shared-key',
          type: 'person',
          [entityAttributesProperty]: { age },
        }) as unknown as NcNode,
    );
  }

  function complaintsFor(seed: number, ages: number[]): string[] {
    const failures: string[] = [];
    const { network } = generateNetwork({
      seed,
      codebook: aged,
      stages: [rosterStage],
      externalData: { 'stage-roster': rowsAged(ages) },
    });

    const drawn = network.nodes.map((node) =>
      Number(node[entityAttributesProperty].age),
    );
    // The row below the age floor is one no participant's form would have
    // accepted, so it is passed over; the row above it is one the protocol
    // describes perfectly well, so it is drawn. A verdict shared by key
    // answered both rows with whichever of them the draw reached first, which
    // on some seeds copied the 5 into the network and on others left the 30
    // behind.
    complain(
      failures,
      drawn.join(',') === '30',
      () => `seed ${seed}: ages ${JSON.stringify(drawn)}, not just 30`,
    );
    return failures;
  }

  it(`passes over the row the rules reject, over ${SEEDS} seeds`, () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= SEEDS; seed++) {
      failures.push(...complaintsFor(seed, [30, 5]));
    }
    expect(failures).toEqual([]);
  });

  it(`passes it over given first as readily as last, over ${SEEDS} seeds`, () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= SEEDS; seed++) {
      failures.push(...complaintsFor(seed, [5, 30]));
    }
    expect(failures).toEqual([]);
  });
});
