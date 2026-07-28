import { describe, expect, it, vi } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { generateNetwork } from '../generateNetwork';
import { SyntheticDataConstraintError } from '../generateNetwork/constraints/error';

// Every sweep below generates a full network per seed, and the solver added by
// PR #1109 costs a little more per entity. On this repo's CI runners the
// heaviest sweep measured 7.0s against vitest's 5s default, so the whole file
// is given room rather than the handful that happened to cross first. Set for
// the file, not the package: a sweep that took a minute would be a real
// regression, and every other suite keeps the default.
vi.setConfig({ testTimeout: 60_000 });

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
    // Judged only on the seeds that leave the band 3 row in the pool. The seeds
    // that draw it put the researcher's own value on one person and the
    // prompt's on another, which is a duplicate from the data rather than from
    // the draw and is not what this fixture is about.
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
        type: 'NameGenerator',
        label: 'Name generator',
        subject: { entity: 'node', type: 'person' },
        prompts: [
          {
            id: 'p3',
            text: 'Name people',
            additionalAttributes: [{ variable: 'band', value: 3 }],
          },
        ],
        behaviours: { minNodes: 1, maxNodes: 1 },
      } as unknown as Stage,
    ];

    let judged = 0;

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook,
        stages,
        externalData: { 'stage-roster': rows.map((row) => ({ ...row })) },
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
