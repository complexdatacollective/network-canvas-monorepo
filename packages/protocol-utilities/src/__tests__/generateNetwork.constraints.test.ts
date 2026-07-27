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
