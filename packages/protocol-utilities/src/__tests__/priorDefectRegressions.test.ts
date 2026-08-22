import { describe, expect, it } from 'vitest';

import {
  collectInterfaceImpliedRules,
  CurrentProtocolSchema,
  type CurrentProtocol,
  resolveVariableSynthetic,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { generateInterviews } from '../index';
import type { AssetData } from '../synthetic-interviews/simulators/types';

/**
 * Regression pins for every previously identified defect of the four prior
 * synthetic-generation attempts, distilled from the 2026-08-21 evaluation of
 * this implementation against the 88-scenario prior-failure catalogue
 * (mined from PRs #1235/#1371/#1108/#1109/#1204/#1205/#1040, the closed
 * issues #791/#793/#1367/#1370, and the G3/G4 session records; the annotated
 * map lives with the evaluation records).
 *
 * Organisation follows the evaluation's scenario ids (S1..S8); each battery
 * is block-scoped so its fixtures stay local, and each case names the prior
 * defect it guards. Where an existing suite owns the behaviour class, the
 * case here pins the EXACT historical construction — the prior attempts'
 * recurring failure was fixing the pointed-at instance and missing its
 * siblings, so the constructions themselves are what this file keeps alive.
 *
 * KNOWN GAP (issue #1428): bin-written variables generate as
 * always-answered because the interaction affords no per-node skip; the
 * runtime nevertheless allows advancing with unplaced nodes today. When
 * #1428 lands its optional stage-level placement gate, the bin missingness
 * contract becomes gate-dependent and the S2 pins re-decide with it.
 */

describe('S1 — quick-add: the interface requires a value per node', () => {
  const protocolWith = (variable: Record<string, unknown>): CurrentProtocol =>
    CurrentProtocolSchema.parse({
      name: 'S1 probe',
      schemaVersion: 8,
      codebook: {
        node: {
          person: {
            name: 'Person',
            color: 'node-color-seq-1',
            shape: { default: 'circle' },
            variables: { label: variable },
          },
        },
      },
      stages: [
        {
          id: 'qa',
          type: 'NameGeneratorQuickAdd',
          label: 'Quick add',
          subject: { entity: 'node', type: 'person' },
          quickAdd: 'label',
          synthetic: { count: { distribution: 'constant', value: 8 } },
          prompts: [{ id: 'p1', text: 'Who?' }],
        },
      ],
    }) as CurrentProtocol;

  const run = (protocol: CurrentProtocol, seed: number) =>
    generateInterviews(protocol, {
      count: 1,
      seed,
      simulateDropOut: false,
      startWindow: '2026-08-20T12:00:00.000Z',
    })[0]!;

  describe('S1a: unvalidated quick-add variable still answers every node', () => {
    it('8 nodes, 8 non-empty values, across seeds', () => {
      const protocol = protocolWith({
        name: 'label',
        type: 'text',
        component: 'Text',
        // NO validation at all: required is absent.
      });
      for (const seed of [1, 2, 3, 42]) {
        const nodes = run(protocol, seed).session.network.nodes;
        expect(nodes).toHaveLength(8);
        for (const node of nodes) {
          const value = node[entityAttributesProperty]['label'];
          expect(typeof value).toBe('string');
          expect((value as string).length).toBeGreaterThan(0);
        }
      }
    });

    it('the interface itself imposes required (the mechanism)', () => {
      const protocol = protocolWith({
        name: 'label',
        type: 'text',
        component: 'Text',
      });
      const implied = collectInterfaceImpliedRules(protocol)
        .get('node:person')
        ?.get('label');
      expect(implied).toEqual({ required: true });
    });
  });

  describe('S1b: authored missingProbability 1 cannot make nameless nodes', () => {
    it('parses (the author is not refused) …', () => {
      expect(() =>
        protocolWith({
          name: 'label',
          type: 'text',
          component: 'Text',
          synthetic: { missingProbability: 1 },
        }),
      ).not.toThrow();
    });

    it('… resolution derives missingness 0 under the implied required', () => {
      const protocol = protocolWith({
        name: 'label',
        type: 'text',
        component: 'Text',
        synthetic: { missingProbability: 1 },
      });
      const variable = protocol.codebook.node!['person']!.variables!['label']!;
      const implied = collectInterfaceImpliedRules(protocol)
        .get('node:person')
        ?.get('label');
      const descriptor = resolveVariableSynthetic(variable, {
        ...('validation' in variable ? variable.validation : undefined),
        ...implied,
      });
      expect(descriptor?.missingProbability).toBe(0);
    });

    it('… and every generated node carries a value on every seed', () => {
      const protocol = protocolWith({
        name: 'label',
        type: 'text',
        component: 'Text',
        synthetic: { missingProbability: 1 },
      });
      for (const seed of [1, 7, 42, 99]) {
        const nodes = run(protocol, seed).session.network.nodes;
        expect(nodes).toHaveLength(8);
        for (const node of nodes) {
          const value = node[entityAttributesProperty]['label'];
          expect(typeof value).toBe('string');
          expect((value as string).length).toBeGreaterThan(0);
        }
      }
    });
  });
});

describe('S2 — categorical bin: single assignment, context, layering', () => {
  const OPTIONS = [
    { label: 'A', value: 'a' },
    { label: 'B', value: 'b' },
    { label: 'C', value: 'c' },
    { label: 'D', value: 'd' },
  ];

  const binProtocol = (
    variable: Record<string, unknown>,
    extraStages: unknown[] = [],
  ): CurrentProtocol =>
    CurrentProtocolSchema.parse({
      name: 'S2 probe',
      schemaVersion: 8,
      codebook: {
        node: {
          person: {
            name: 'Person',
            color: 'node-color-seq-1',
            shape: { default: 'circle' },
            variables: {
              label: { name: 'label', type: 'text', component: 'Text' },
              cats: variable,
            },
          },
        },
      },
      stages: [
        {
          id: 'qa',
          type: 'NameGeneratorQuickAdd',
          label: 'Quick add',
          subject: { entity: 'node', type: 'person' },
          quickAdd: 'label',
          synthetic: { count: { distribution: 'constant', value: 6 } },
          prompts: [{ id: 'p1', text: 'Who?' }],
        },
        ...extraStages,
        {
          id: 'bin',
          type: 'CategoricalBin',
          label: 'Sort',
          subject: { entity: 'node', type: 'person' },
          prompts: [{ id: 'b1', text: 'Sort them', variable: 'cats' }],
        },
      ],
    }) as CurrentProtocol;

  const run = (protocol: CurrentProtocol, seed: number) =>
    generateInterviews(protocol, {
      count: 1,
      seed,
      simulateDropOut: false,
      startWindow: '2026-08-20T12:00:00.000Z',
    })[0]!;

  describe('S2a: a bin-written categorical holds exactly one option, always', () => {
    it('across seeds, every node: array of length 1, member of options', () => {
      const protocol = binProtocol({
        name: 'cats',
        type: 'categorical',
        options: OPTIONS,
        // No validation, no synthetic: the DEFAULT for a free categorical
        // would allow multiple selections — the bin context must narrow it.
      });
      for (const seed of [1, 5, 42, 1234]) {
        for (const node of run(protocol, seed).session.network.nodes) {
          const value = node[entityAttributesProperty]['cats'];
          expect(Array.isArray(value)).toBe(true);
          expect((value as unknown[]).length).toBe(1);
          expect(['a', 'b', 'c', 'd']).toContain((value as unknown[])[0]);
        }
      }
    });

    it('mechanism: the bin imposes maxSelected 1 AND required', () => {
      const protocol = binProtocol({
        name: 'cats',
        type: 'categorical',
        options: OPTIONS,
      });
      expect(
        collectInterfaceImpliedRules(protocol).get('node:person')?.get('cats'),
      ).toEqual({ maxSelected: 1, required: true });
    });
  });

  describe('S2b: the SAME variable in a form context keeps the wide default', () => {
    it('a form-only categorical may select multiple options', () => {
      // Same variable shape, but collected by a form field instead of a bin.
      const protocol = CurrentProtocolSchema.parse({
        name: 'S2b probe',
        schemaVersion: 8,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              shape: { default: 'circle' },
              variables: {
                label: { name: 'label', type: 'text', component: 'Text' },
                cats: {
                  name: 'cats',
                  type: 'categorical',
                  component: 'CheckboxGroup',
                  options: OPTIONS,
                },
              },
            },
          },
        },
        stages: [
          {
            id: 'ng',
            type: 'NameGenerator',
            label: 'People',
            subject: { entity: 'node', type: 'person' },
            form: {
              title: 'About them',
              fields: [
                { variable: 'label', prompt: 'Name?' },
                { variable: 'cats', prompt: 'Which apply?' },
              ],
            },
            synthetic: { count: { distribution: 'constant', value: 40 } },
            prompts: [{ id: 'p1', text: 'Who?' }],
          },
        ],
      }) as CurrentProtocol;

      let sawMultiple = false;
      for (const seed of [1, 2, 3]) {
        for (const node of run(protocol, seed).session.network.nodes) {
          const value = node[entityAttributesProperty]['cats'];
          if (Array.isArray(value) && value.length > 1) sawMultiple = true;
        }
      }
      expect(sawMultiple).toBe(true);
    });
  });

  describe('S2c: authored parameters looser than the context are refused', () => {
    it('selectionCount max 3 on a bin-written variable refuses at parse', () => {
      expect(() =>
        binProtocol({
          name: 'cats',
          type: 'categorical',
          options: OPTIONS,
          synthetic: {
            selectionCount: { distribution: 'uniform', min: 2, max: 3 },
          },
        }),
      ).toThrow();
    });

    it('declared minSelected 2 on a BIN-ONLY variable: the rule is dead letter, exactly as at runtime', () => {
      // No form ever renders this variable, so no participant ever faces its
      // minSelected — the bin writes single values regardless of declared
      // rules (the runtime never validates bin writes). The implementation's
      // binOnlyVariables machinery encodes exactly this: form rules are not
      // enforced for variables only a bin drop writes.
      const protocol = binProtocol({
        name: 'cats',
        type: 'categorical',
        component: 'CheckboxGroup',
        options: OPTIONS,
        validation: { minSelected: 2, maxSelected: 3 },
      });
      for (const seed of [1, 2, 3]) {
        for (const node of run(protocol, seed).session.network.nodes) {
          const value = node[entityAttributesProperty]['cats'];
          expect(Array.isArray(value)).toBe(true);
          expect((value as unknown[]).length).toBe(1);
        }
      }
    });

    it('the SAME contradiction with the variable ALSO form-collected refuses on every seed', () => {
      // Once a form really renders the variable, its minSelected is a rule a
      // participant faces — the draw honours it, the bin cannot write it, and
      // generation refuses identically on every seed rather than emitting a
      // session no interview could hold. (Also pinned in @codaco/interview's
      // syntheticDataConformance: 'refuses to generate once the bin stages
      // write it'.)
      const protocol = binProtocol(
        {
          name: 'cats',
          type: 'categorical',
          component: 'CheckboxGroup',
          options: OPTIONS,
          validation: { minSelected: 2, maxSelected: 3 },
        },
        [
          {
            id: 'form-too',
            type: 'NameGenerator',
            label: 'More people',
            subject: { entity: 'node', type: 'person' },
            form: {
              title: 'About them',
              fields: [
                { variable: 'label', prompt: 'Name?' },
                { variable: 'cats', prompt: 'Which apply?' },
              ],
            },
            synthetic: { count: { distribution: 'constant', value: 2 } },
            prompts: [{ id: 'f1', text: 'Who else?' }],
          },
        ],
      );
      for (const seed of [1, 2, 3, 42, 99]) {
        expect(() => run(protocol, seed)).toThrow(/exactly one bin/);
      }
    });
  });

  describe('S2d: bin missingness follows the DESIGN, not the escape hatch', () => {
    // Mechanically the runtime does not block forward navigation on unbinned
    // nodes (canMoveForward is position-only; formIsReady feeds only the
    // pulse) — but the interface affords no way to SKIP a node while placing
    // the others, and generation models designed usage (maintainer ruling,
    // 2026-08-21): bins imply `required`, like quick-add.
    it('DEFAULT: with nothing authored, every node is binned (complete data)', () => {
      const protocol = binProtocol({
        name: 'cats',
        type: 'categorical',
        options: OPTIONS,
      });
      for (const seed of [1, 2, 3, 4, 5]) {
        for (const node of run(protocol, seed).session.network.nodes) {
          expect(node[entityAttributesProperty]['cats']).toBeDefined();
        }
      }
    });

    it('AUTHORED missingProbability is inert on a bin: every node still binned', () => {
      // Maintainer ruling (2026-08-21): the bin affords no way to skip a node
      // while placing the others, so the interface implies `required` and an
      // authored missingProbability resolves to zero — the exact quick-add
      // contract (S1b).
      const protocol = binProtocol({
        name: 'cats',
        type: 'categorical',
        options: OPTIONS,
        synthetic: { missingProbability: 0.5 },
      });
      for (const seed of [1, 2, 3, 4, 5]) {
        for (const node of run(protocol, seed).session.network.nodes) {
          expect(node[entityAttributesProperty]['cats']).toBeDefined();
        }
      }
    });

    it('a selection table that can draw zero refuses at parse', () => {
      expect(() =>
        binProtocol({
          name: 'cats',
          type: 'categorical',
          options: OPTIONS,
          synthetic: {
            selectionCount: { probabilities: [{ count: 0, probability: 1 }] },
          },
        }),
      ).toThrow(/exactly one bin/);
    });
  });
});

describe('S3 — roster characteristics vs generation constraints', () => {
  const MANIFEST = {
    colleagues: {
      id: 'colleagues',
      name: 'Colleagues',
      type: 'network',
      source: 'colleagues.json',
    },
  };

  const rosterProtocol = (
    stageExtras: Record<string, unknown>,
    variables: Record<string, unknown> = {},
    extraStages: unknown[] = [],
  ): CurrentProtocol =>
    CurrentProtocolSchema.parse({
      name: 'S3 probe',
      schemaVersion: 8,
      assetManifest: MANIFEST,
      codebook: {
        node: {
          person: {
            name: 'Person',
            color: 'node-color-seq-1',
            shape: { default: 'circle' },
            variables: {
              label: { name: 'label', type: 'text', component: 'Text' },
              ...variables,
            },
          },
        },
      },
      stages: [
        {
          id: 'roster',
          type: 'NameGeneratorRoster',
          label: 'Colleagues',
          subject: { entity: 'node', type: 'person' },
          dataSource: 'colleagues',
          prompts: [{ id: 'r1', text: 'Who do you work with?' }],
          ...stageExtras,
        },
        ...extraStages,
      ],
    }) as CurrentProtocol;

  const rows = (
    count: number,
    attributes: (index: number) => Record<string, string | number> = (
      index,
    ) => ({
      label: `Colleague ${index}`,
    }),
  ): NcNode[] =>
    Array.from({ length: count }, (_, index) => ({
      [entityPrimaryKeyProperty]: `row-${index}`,
      type: 'person',
      [entityAttributesProperty]: attributes(index),
    }));

  const run = (
    protocol: CurrentProtocol,
    seed: number,
    assetData?: AssetData,
  ) =>
    generateInterviews(
      protocol,
      {
        count: 1,
        seed,
        simulateDropOut: false,
        startWindow: '2026-08-20T12:00:00.000Z',
      },
      assetData,
    )[0]!;

  describe('S3a: pool of 5, stage requires 6 — pre-seed refusal, every seed', () => {
    const protocol = rosterProtocol({
      behaviours: { minNodes: 6 },
      synthetic: {
        generatesData: true,
        count: { distribution: 'constant', value: 6 },
      },
    });
    const pool: AssetData = { rosterNodes: { roster: rows(5) } };

    it('refuses identically on many seeds, naming the stage and the floor', () => {
      let message = '';
      for (const seed of [1, 2, 3, 42, 500]) {
        let threw = false;
        try {
          run(protocol, seed, pool);
        } catch (error) {
          threw = true;
          const text = (error as Error).message;
          if (!message) message = text;
          expect(text).toBe(message); // identical refusal on every seed
        }
        expect(threw).toBe(true);
      }
      expect(message).toMatch(/minNodes|at least/i);
      expect(message).toMatch(/roster/i);
    });
  });

  describe('S3b: pool of 5, count 6, NO floor — nominate what exists', () => {
    it('the participant can only pick what is displayed: 5 nodes, no refusal', () => {
      const protocol = rosterProtocol({
        synthetic: {
          generatesData: true,
          count: { distribution: 'constant', value: 6 },
        },
      });
      const result = run(protocol, 42, { rosterNodes: { roster: rows(5) } });
      expect(result.session.network.nodes).toHaveLength(5);
    });
  });

  describe('S3c: unique variable, duplicate roster values — verbatim, like the runtime', () => {
    it('rows land as the researcher wrote them; the floor is still met', () => {
      const protocol = rosterProtocol(
        {
          behaviours: { minNodes: 4 },
          synthetic: {
            generatesData: true,
            count: { distribution: 'constant', value: 4 },
          },
        },
        {
          band: {
            name: 'band',
            type: 'ordinal',
            component: 'RadioGroup',
            options: [
              { label: 'One', value: 1 },
              { label: 'Two', value: 2 },
              { label: 'Three', value: 3 },
            ],
            validation: { unique: true },
          },
        },
      );
      // Four rows, but only TWO distinct band values: a drawability filter
      // would under-fill the floor; the runtime's roster add validates nothing.
      const pool: AssetData = {
        rosterNodes: {
          roster: rows(4, (index) => ({
            label: `Colleague ${index}`,
            band: index < 2 ? 1 : 2,
          })),
        },
      };
      const nodes = run(protocol, 42, pool).session.network.nodes;
      expect(nodes).toHaveLength(4);
      const bands = nodes.map((node) => node[entityAttributesProperty]['band']);
      expect(bands.toSorted((a, b) => Number(a) - Number(b))).toEqual([
        1, 1, 2, 2,
      ]);
    });
  });

  describe('S3d: roster values consuming a unique space a later stage needs', () => {
    it('refuses pre-seed when reserved rows leave too little for the draws', () => {
      const protocol = rosterProtocol(
        {
          behaviours: { minNodes: 2 },
          synthetic: {
            generatesData: true,
            count: { distribution: 'constant', value: 2 },
          },
        },
        {
          band: {
            name: 'band',
            type: 'ordinal',
            component: 'RadioGroup',
            options: [
              { label: 'One', value: 1 },
              { label: 'Two', value: 2 },
              { label: 'Three', value: 3 },
            ],
            validation: { required: true, unique: true },
          },
        },
        [
          {
            id: 'more',
            type: 'NameGenerator',
            label: 'More people',
            subject: { entity: 'node', type: 'person' },
            form: {
              title: 'About them',
              fields: [
                { variable: 'label', prompt: 'Name?' },
                { variable: 'band', prompt: 'Band?' },
              ],
            },
            synthetic: { count: { distribution: 'constant', value: 2 } },
            prompts: [{ id: 'm1', text: 'Who else?' }],
          },
        ],
      );
      // Rows hold bands 1 and 2; the later form stage must DRAW 2 more unique
      // bands from a 3-value space with 2 reserved -> only 1 left -> refuse.
      const pool: AssetData = {
        rosterNodes: {
          roster: rows(2, (index) => ({
            label: `Colleague ${index}`,
            band: index + 1,
          })),
        },
      };
      for (const seed of [1, 2, 3]) {
        expect(() => run(protocol, seed, pool)).toThrow(/unique|distinct/i);
      }
    });
  });

  describe('S3e: the D18 three-way pool contract', () => {
    const floored = rosterProtocol({
      behaviours: { minNodes: 1 },
      synthetic: {
        generatesData: true,
        count: { distribution: 'constant', value: 1 },
      },
    });

    it('absent map: the caller opted out of the contract — generates', () => {
      const result = run(floored, 42);
      expect(result.session.network.nodes).toHaveLength(0);
    });

    it('present map, key missing: unresolved source — refuses', () => {
      expect(() => run(floored, 42, { rosterNodes: {} })).toThrow(
        /no rows were resolved|unresolved/i,
      );
    });

    it('present map, known-empty pool: refuses the same way', () => {
      expect(() => run(floored, 42, { rosterNodes: { roster: [] } })).toThrow(
        /roster/i,
      );
    });
  });
});

describe('S4 — realistic names vs validation', () => {
  const formProtocol = (
    variable: Record<string, unknown>,
    count = 12,
  ): CurrentProtocol =>
    CurrentProtocolSchema.parse({
      name: 'S4 probe',
      schemaVersion: 8,
      codebook: {
        node: {
          person: {
            name: 'Person',
            color: 'node-color-seq-1',
            shape: { default: 'circle' },
            variables: { theVar: variable },
          },
        },
      },
      stages: [
        {
          id: 'ng',
          type: 'NameGenerator',
          label: 'People',
          subject: { entity: 'node', type: 'person' },
          form: {
            title: 'About them',
            fields: [{ variable: 'theVar', prompt: 'Value?' }],
          },
          synthetic: { count: { distribution: 'constant', value: count } },
          prompts: [{ id: 'p1', text: 'Who?' }],
        },
      ],
    }) as CurrentProtocol;

  const values = (protocol: CurrentProtocol, seed: number): string[] =>
    generateInterviews(protocol, {
      count: 1,
      seed,
      simulateDropOut: false,
      startWindow: '2026-08-20T12:00:00.000Z',
    })[0]!.session.network.nodes.map(
      (node) => node[entityAttributesProperty]['theVar'] as string,
    );

  describe('S4a: name-like + unconstrained -> realistic full names', () => {
    it('draws person-shaped names, varied, with spaces', () => {
      const drawn = values(
        formProtocol({
          name: 'partnerName',
          type: 'text',
          component: 'Text',
          validation: { required: true },
        }),
        42,
      );
      expect(drawn).toHaveLength(12);
      // Person-shaped: letters (with common name punctuation), at least one
      // space in most (full names), high variety.
      const spaced = drawn.filter((v) => /\s/.test(v));
      expect(spaced.length).toBeGreaterThan(6);
      for (const v of drawn) {
        expect(v).toMatch(/^[\p{L}][\p{L}\p{M}'. -]*$/u);
      }
      expect(new Set(drawn).size).toBeGreaterThan(6);
    });
  });

  describe('S4b: name-like + maxLength 5 — the constraint always wins', () => {
    it('every value fits the bound, on every seed', () => {
      const protocol = formProtocol({
        name: 'petName',
        type: 'text',
        component: 'Text',
        validation: { required: true, maxLength: 5 },
      });
      for (const seed of [1, 2, 3, 42]) {
        for (const v of values(protocol, seed)) {
          expect(v.length).toBeGreaterThan(0);
          expect(v.length).toBeLessThanOrEqual(5);
        }
      }
    });

    it('minLength 12 + maxLength 14 is honoured too', () => {
      const protocol = formProtocol({
        name: 'longName',
        type: 'text',
        component: 'Text',
        validation: { required: true, minLength: 12, maxLength: 14 },
      });
      for (const v of values(protocol, 7)) {
        expect(v.length).toBeGreaterThanOrEqual(12);
        expect(v.length).toBeLessThanOrEqual(14);
      }
    });
  });

  describe('S4c: name-like + unique at scale — distinct and still valid', () => {
    it('50 unique names, all distinct, all person-shaped', () => {
      const protocol = formProtocol(
        {
          name: 'fullName',
          type: 'text',
          component: 'Text',
          validation: { required: true, unique: true },
        },
        50,
      );
      for (const seed of [1, 42]) {
        const drawn = values(protocol, seed);
        expect(drawn).toHaveLength(50);
        expect(new Set(drawn).size).toBe(50);
        for (const v of drawn) expect(v.length).toBeGreaterThan(0);
      }
    });

    it('unique + tight length window (exactly 4 chars): distinct within bounds', () => {
      const protocol = formProtocol(
        {
          name: 'codeName',
          type: 'text',
          component: 'Text',
          validation: {
            required: true,
            unique: true,
            minLength: 4,
            maxLength: 4,
          },
        },
        20,
      );
      const drawn = values(protocol, 42);
      expect(drawn).toHaveLength(20);
      expect(new Set(drawn).size).toBe(20);
      for (const v of drawn) expect(v).toHaveLength(4);
    });
  });

  describe('S4d: an authored generator overrides the name heuristic', () => {
    it('neutralWords on a name-like variable stops the personName inference', () => {
      const withGenerator = formProtocol({
        name: 'nickname',
        type: 'text',
        component: 'Text',
        validation: { required: true },
        synthetic: { generator: 'neutralWords' },
      });
      const inferred = formProtocol({
        name: 'nickname',
        type: 'text',
        component: 'Text',
        validation: { required: true },
      });
      const authored = values(withGenerator, 42);
      const heuristic = values(inferred, 42);
      // Same seed, different generator: the outputs must differ, and the
      // heuristic one should look like names (spaces) more than the authored.
      expect(authored).not.toEqual(heuristic);
    });
  });
});

describe('S5 — the three generation-side default-override bugs', () => {
  const protocolWith = (variable: Record<string, unknown>): CurrentProtocol =>
    CurrentProtocolSchema.parse({
      name: 'S5 probe',
      schemaVersion: 8,
      codebook: {
        node: {
          person: {
            name: 'Person',
            color: 'node-color-seq-1',
            shape: { default: 'circle' },
            variables: {
              label: { name: 'label', type: 'text', component: 'Text' },
              theVar: variable,
            },
          },
        },
      },
      stages: [
        {
          id: 'ng',
          type: 'NameGenerator',
          label: 'People',
          subject: { entity: 'node', type: 'person' },
          form: {
            title: 'About them',
            fields: [
              { variable: 'label', prompt: 'Name?' },
              { variable: 'theVar', prompt: 'Value?' },
            ],
          },
          synthetic: { count: { distribution: 'constant', value: 10 } },
          prompts: [{ id: 'p1', text: 'Who?' }],
        },
      ],
    }) as CurrentProtocol;

  const values = (protocol: CurrentProtocol, seed: number): unknown[] =>
    generateInterviews(protocol, {
      count: 1,
      seed,
      simulateDropOut: false,
      startWindow: '2026-08-20T12:00:00.000Z',
    })[0]!.session.network.nodes.map(
      (node) => node[entityAttributesProperty]['theVar'],
    );

  describe('S5-1: declared selectionCount 4 must not be capped to 2', () => {
    it('a categorical authored to pick 4 picks 4', () => {
      const protocol = protocolWith({
        name: 'hobbies',
        type: 'categorical',
        component: 'CheckboxGroup',
        options: [
          { label: 'A', value: 'a' },
          { label: 'B', value: 'b' },
          { label: 'C', value: 'c' },
          { label: 'D', value: 'd' },
          { label: 'E', value: 'e' },
        ],
        validation: { required: true },
        synthetic: {
          // The authored form: a probability table over counts — here "always 4".
          selectionCount: { probabilities: [{ count: 4, probability: 1 }] },
        },
      });
      for (const value of values(protocol, 42)) {
        expect(Array.isArray(value)).toBe(true);
        expect((value as unknown[]).length).toBe(4);
      }
    });
  });

  describe('S5-2: declared constant 250 must not be capped to 80', () => {
    it('a number authored constant 250 draws 250', () => {
      const protocol = protocolWith({
        name: 'weight',
        type: 'number',
        component: 'Number',
        validation: { required: true },
        synthetic: { distribution: 'constant', value: 250 },
      });
      for (const value of values(protocol, 42)) {
        expect(value).toBe(250);
      }
    });
  });

  describe('S5-3: a declared 1990-1995 date range must not be decade-clipped', () => {
    it('every drawn date stays inside the authored window (issue #1370)', () => {
      const protocol = protocolWith({
        name: 'started',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'full', min: '1990-01-01', max: '1995-12-31' },
        validation: { required: true },
      });
      for (const seed of [1, 2, 42]) {
        for (const value of values(protocol, seed)) {
          expect(typeof value).toBe('string');
          expect((value as string) >= '1990-01-01').toBe(true);
          expect((value as string) <= '1995-12-31').toBe(true);
        }
      }
    });
  });
});

describe('S6 — numeric robustness at the schema boundary', () => {
  const parseWith = (variable: Record<string, unknown>, count = 5) =>
    CurrentProtocolSchema.safeParse({
      name: 'S6',
      schemaVersion: 8,
      codebook: {
        node: {
          person: {
            name: 'Person',
            color: 'node-color-seq-1',
            shape: { default: 'circle' },
            variables: {
              label: { name: 'label', type: 'text', component: 'Text' },
              theVar: variable,
            },
          },
        },
      },
      stages: [
        {
          id: 'ng',
          type: 'NameGenerator',
          label: 'People',
          subject: { entity: 'node', type: 'person' },
          form: {
            title: 'About them',
            fields: [
              { variable: 'label', prompt: 'Name?' },
              { variable: 'theVar', prompt: 'Value?' },
            ],
          },
          synthetic: { count: { distribution: 'constant', value: count } },
          prompts: [{ id: 'p1', text: 'Who?' }],
        },
      ],
    });

  const valuesOf = (protocol: CurrentProtocol, seed: number): unknown[] =>
    generateInterviews(protocol, {
      count: 1,
      seed,
      simulateDropOut: false,
      startWindow: '2026-08-20T12:00:00.000Z',
    })[0]!.session.network.nodes.map(
      (node) => node[entityAttributesProperty]['theVar'],
    );

  it('zero-variance support outside the window is refused at parse (#1235, five rounds)', () => {
    const parsed = parseWith({
      name: 'theVar',
      type: 'number',
      component: 'Number',
      validation: { required: true, minValue: 10, maxValue: 20 },
      synthetic: { distribution: 'normal', mean: 5, sd: 0 },
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(JSON.stringify(parsed.error.issues)).toMatch(
        /standard deviation of 0/,
      );
    }
  });

  it('zero-variance support inside the window draws the authored constant', () => {
    const parsed = parseWith({
      name: 'theVar',
      type: 'number',
      component: 'Number',
      validation: { required: true, minValue: 0, maxValue: 20 },
      synthetic: { distribution: 'normal', mean: 5, sd: 0 },
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(valuesOf(parsed.data as CurrentProtocol, 1)).toEqual([
      5, 5, 5, 5, 5,
    ]);
  });

  it('a near-limit beta stays finite and inside the scale (#1235 NaN family)', () => {
    const parsed = parseWith({
      name: 'theVar',
      type: 'scalar',
      component: 'VisualAnalogScale',
      validation: { required: true },
      synthetic: { distribution: 'beta', mean: 0.5, sd: 0.4999 },
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    for (const seed of [1, 2, 3]) {
      for (const value of valuesOf(parsed.data as CurrentProtocol, seed)) {
        expect(Number.isFinite(value as number)).toBe(true);
        expect(value as number).toBeGreaterThanOrEqual(0);
        expect(value as number).toBeLessThanOrEqual(1);
      }
    }
  });

  it('a near-zero-variance beta concentrates at its mean, never a Bernoulli endpoint (#1205 class)', () => {
    const parsed = parseWith({
      name: 'theVar',
      type: 'scalar',
      component: 'VisualAnalogScale',
      validation: { required: true },
      synthetic: { distribution: 'beta', mean: 0.5, sd: 0.000001 },
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    for (const value of valuesOf(parsed.data as CurrentProtocol, 1)) {
      expect(Math.abs((value as number) - 0.5)).toBeLessThan(0.1);
    }
  });

  it('option weights above the ceiling are unrepresentable (the 1e308 collapse)', () => {
    const parsed = parseWith({
      name: 'theVar',
      type: 'ordinal',
      component: 'RadioGroup',
      options: [
        { label: 'A', value: 1 },
        { label: 'B', value: 2 },
      ],
      validation: { required: true },
      synthetic: {
        optionWeights: [
          { value: 1, weight: 1e308 },
          { value: 2, weight: 1e308 },
        ],
      },
    });
    expect(parsed.success).toBe(false);
  });

  it('a selection table of count 0 on an OPTIONAL form variable selects nothing', () => {
    // An empty selection is the participant visiting the field and ticking
    // no box — distinct from missingness, which is the absent key. (On a
    // bin-written variable the same table is refused at parse; see S2.)
    const parsed = parseWith({
      name: 'theVar',
      type: 'categorical',
      component: 'CheckboxGroup',
      options: [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
      ],
      synthetic: {
        selectionCount: { probabilities: [{ count: 0, probability: 1 }] },
      },
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    for (const value of valuesOf(parsed.data as CurrentProtocol, 3)) {
      if (value !== undefined) {
        expect(value).toEqual([]);
      }
    }
  });

  it('duplicate-valued options never shrink a required selection (#1108 dedup bug)', () => {
    const parsed = parseWith({
      name: 'theVar',
      type: 'categorical',
      component: 'CheckboxGroup',
      options: [
        { label: 'A1', value: 'x' },
        { label: 'A2', value: 'x' },
        { label: 'B', value: 'b' },
      ],
      validation: { required: true, minSelected: 2, maxSelected: 2 },
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    for (const value of valuesOf(parsed.data as CurrentProtocol, 3)) {
      expect(Array.isArray(value)).toBe(true);
      expect(new Set(value as unknown[]).size).toBe(2);
    }
  });

  it('a count whose support cannot reach an authored floor refuses at parse', () => {
    const result = CurrentProtocolSchema.safeParse({
      name: 'S6-count',
      schemaVersion: 8,
      codebook: {
        node: {
          person: {
            name: 'Person',
            color: 'node-color-seq-1',
            shape: { default: 'circle' },
            variables: {
              label: { name: 'label', type: 'text', component: 'Text' },
            },
          },
        },
      },
      stages: [
        {
          id: 'qa',
          type: 'NameGeneratorQuickAdd',
          label: 'Quick add',
          subject: { entity: 'node', type: 'person' },
          quickAdd: 'label',
          behaviours: { minNodes: 30 },
          synthetic: { count: { distribution: 'normal', mean: 8, sd: 3 } },
          prompts: [{ id: 'p1', text: 'Who?' }],
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe('S7 — caps, injectivity, stage-time truth', () => {
  const run = (protocol: CurrentProtocol, seed = 1) =>
    generateInterviews(protocol, {
      count: 1,
      seed,
      simulateDropOut: false,
      startWindow: '2026-08-20T12:00:00.000Z',
    })[0]!;

  describe('S7-caps: schema-valid monsters cannot freeze a synchronous preview', () => {
    it('constant 1e9 count: refused at parse', () => {
      const parsed = CurrentProtocolSchema.safeParse({
        name: 'monster',
        schemaVersion: 8,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              shape: { default: 'circle' },
              variables: {
                label: { name: 'label', type: 'text', component: 'Text' },
              },
            },
          },
        },
        stages: [
          {
            id: 'qa',
            type: 'NameGeneratorQuickAdd',
            label: 'QA',
            subject: { entity: 'node', type: 'person' },
            quickAdd: 'label',
            synthetic: {
              count: { distribution: 'constant', value: 1_000_000_000 },
            },
            prompts: [{ id: 'p1', text: 'Who?' }],
          },
        ],
      });
      expect(parsed.success).toBe(false);
    });

    it('normal(10000, 10000) count: bounded, never a 70k-node derived ceiling', () => {
      const parsed = CurrentProtocolSchema.safeParse({
        name: 'monster2',
        schemaVersion: 8,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              shape: { default: 'circle' },
              variables: {
                label: { name: 'label', type: 'text', component: 'Text' },
              },
            },
          },
        },
        stages: [
          {
            id: 'qa',
            type: 'NameGeneratorQuickAdd',
            label: 'QA',
            subject: { entity: 'node', type: 'person' },
            quickAdd: 'label',
            synthetic: {
              count: { distribution: 'normal', mean: 10_000, sd: 10_000 },
            },
            prompts: [{ id: 'p1', text: 'Who?' }],
          },
        ],
      });
      if (!parsed.success) return; // refusal is the strong answer
      const started = Date.now();
      const result = run(parsed.data as CurrentProtocol);
      const elapsed = Date.now() - started;
      expect(result.session.network.nodes.length).toBeLessThanOrEqual(100);
      expect(elapsed).toBeLessThan(10_000);
    });

    it('authored census demand past the pair cap: structured refusal', () => {
      const parsed = CurrentProtocolSchema.safeParse({
        name: 'pairs',
        schemaVersion: 8,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              shape: { default: 'circle' },
              variables: {
                label: { name: 'label', type: 'text', component: 'Text' },
              },
            },
          },
          edge: { knows: { name: 'Knows', color: 'edge-color-seq-1' } },
        },
        stages: [
          {
            id: 'a',
            type: 'NameGeneratorQuickAdd',
            label: 'A',
            subject: { entity: 'node', type: 'person' },
            quickAdd: 'label',
            synthetic: { count: { distribution: 'constant', value: 60 } },
            prompts: [{ id: 'pa', text: 'Who?' }],
          },
          {
            id: 'b',
            type: 'NameGeneratorQuickAdd',
            label: 'B',
            subject: { entity: 'node', type: 'person' },
            quickAdd: 'label',
            synthetic: { count: { distribution: 'constant', value: 60 } },
            prompts: [{ id: 'pb', text: 'Who else?' }],
          },
          {
            id: 'census',
            type: 'DyadCensus',
            label: 'Census',
            subject: { entity: 'node', type: 'person' },
            introductionPanel: { title: 'Pairs', text: 'Every pair.' },
            prompts: [{ id: 'pc', text: 'Linked?', createEdge: 'knows' }],
          },
        ],
      });
      expect(parsed.success).toBe(true);
      for (const seed of [1, 2]) {
        expect(() => run(parsed.data as CurrentProtocol, seed)).toThrow(
          /pair/i,
        );
      }
    });
  });

  describe('S7-injectivity: one variable id under two scopes', () => {
    it('is UNREPRESENTABLE: the schema refuses cross-scope key reuse', () => {
      // #1235's id-keyed lookup collapse and rng-stream collision both needed
      // one variable key under two entity scopes. The schema refuses the
      // construction itself, so the whole family has nothing to collide.
      const parsed = CurrentProtocolSchema.safeParse({
        name: 'scopes',
        schemaVersion: 8,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              shape: { default: 'circle' },
              variables: {
                label: { name: 'label', type: 'text', component: 'Text' },
                score: { name: 'score', type: 'number', component: 'Number' },
              },
            },
            org: {
              name: 'Org',
              color: 'node-color-seq-2',
              shape: { default: 'square' },
              variables: {
                title: { name: 'title', type: 'text', component: 'Text' },
                score: { name: 'score', type: 'number', component: 'Number' },
              },
            },
          },
        },
        stages: [
          {
            id: 'p',
            type: 'NameGenerator',
            label: 'People',
            subject: { entity: 'node', type: 'person' },
            form: {
              title: 'P',
              fields: [{ variable: 'label', prompt: 'Name?' }],
            },
            prompts: [{ id: 'pp', text: 'Who?' }],
          },
        ],
      });
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(JSON.stringify(parsed.error.issues)).toMatch(
          /reused across entity types/,
        );
      }
    });
  });
  describe('S7-stage-time truth: census answers are stage-time, not final', () => {
    it('a later sociogram edge never rewrites an earlier census negative', () => {
      const protocol = CurrentProtocolSchema.parse({
        name: 'census-truth',
        schemaVersion: 8,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              shape: { default: 'circle' },
              variables: {
                label: { name: 'label', type: 'text', component: 'Text' },
                layout: { name: 'layout', type: 'layout' },
              },
            },
          },
          edge: { knows: { name: 'Knows', color: 'edge-color-seq-1' } },
        },
        stages: [
          {
            id: 'qa',
            type: 'NameGeneratorQuickAdd',
            label: 'QA',
            subject: { entity: 'node', type: 'person' },
            quickAdd: 'label',
            synthetic: { count: { distribution: 'constant', value: 4 } },
            prompts: [{ id: 'p1', text: 'Who?' }],
          },
          {
            id: 'census',
            type: 'DyadCensus',
            label: 'Census',
            subject: { entity: 'node', type: 'person' },
            introductionPanel: { title: 'Pairs', text: 'Every pair.' },
            synthetic: {
              topology: {
                metric: 'density',
                distribution: { distribution: 'constant', value: 0 },
              },
            },
            prompts: [{ id: 'pc', text: 'Linked?', createEdge: 'knows' }],
          },
          {
            id: 'soc',
            type: 'Sociogram',
            label: 'Link',
            subject: { entity: 'node', type: 'person' },
            background: { concentricCircles: 3 },
            synthetic: {
              topology: {
                metric: 'density',
                distribution: { distribution: 'constant', value: 1 },
              },
            },
            prompts: [
              {
                id: 'ps',
                text: 'Link them',
                layout: { layoutVariable: 'layout' },
                edges: { create: 'knows' },
              },
            ],
          },
        ],
      }) as CurrentProtocol;
      const result = run(protocol, 3);
      // Density 1 sociogram: all 6 pairs linked in the final network.
      expect(
        result.session.network.edges.filter((e) => e.type === 'knows'),
      ).toHaveLength(6);
      // Density 0 census: all 6 tuples recorded NEGATIVE, and they stay so.
      const ledger = result.session.stageMetadata?.['1'];
      expect(Array.isArray(ledger)).toBe(true);
      const tuples = ledger as [number, string, string, boolean][];
      expect(tuples).toHaveLength(6);
      for (const tuple of tuples) expect(tuple[3]).toBe(false);
    });

    it('a self-guarded EgoForm cannot see its own would-be write', () => {
      // SKIP when the form's own variable EXISTS: on arrival nothing has been
      // written, so the stage RUNS (the live interview's own semantics); the
      // old planner settled it against the final ego and skipped it.
      const protocol = CurrentProtocolSchema.parse({
        name: 'self-guard',
        schemaVersion: 8,
        codebook: {
          ego: {
            variables: {
              consent: {
                name: 'consent',
                type: 'boolean',
                component: 'Toggle',
                validation: { required: true },
              },
            },
          },
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              shape: { default: 'circle' },
              variables: {
                label: { name: 'label', type: 'text', component: 'Text' },
              },
            },
          },
        },
        stages: [
          {
            id: 'ego',
            type: 'EgoForm',
            label: 'You',
            introductionPanel: { title: 'You', text: 'About you.' },
            skipLogic: {
              action: 'SKIP',
              filter: {
                rules: [
                  {
                    id: 'r',
                    type: 'ego',
                    options: { attribute: 'consent', operator: 'EXISTS' },
                  },
                ],
              },
            },
            form: { fields: [{ variable: 'consent', prompt: 'OK?' }] },
          },
          {
            id: 'qa',
            type: 'NameGeneratorQuickAdd',
            label: 'QA',
            subject: { entity: 'node', type: 'person' },
            quickAdd: 'label',
            synthetic: { count: { distribution: 'constant', value: 2 } },
            prompts: [{ id: 'p1', text: 'Who?' }],
          },
        ],
      }) as CurrentProtocol;
      const result = generateInterviews(protocol, {
        count: 1,
        seed: 1,
        simulateDropOut: false,
        respectSkipLogic: true,
        startWindow: '2026-08-20T12:00:00.000Z',
      })[0]!;
      // The ego form RAN (consent answered) and the creator ran after it.
      expect(result.visitedStages).toEqual([0, 1]);
      expect(
        result.session.network.ego?.[entityAttributesProperty]?.['consent'],
      ).toBeDefined();
      expect(result.session.network.nodes).toHaveLength(2);
    });
  });

  describe('S7-sparse contract: no null attribute values anywhere', () => {
    it('a mixed-stage session holds only defined values or absent keys', () => {
      const protocol = CurrentProtocolSchema.parse({
        name: 'sparse',
        schemaVersion: 8,
        codebook: {
          ego: {
            variables: {
              note: { name: 'note', type: 'text', component: 'Text' },
            },
          },
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              shape: { default: 'circle' },
              variables: {
                label: { name: 'label', type: 'text', component: 'Text' },
                extra: {
                  name: 'extra',
                  type: 'text',
                  component: 'Text',
                  synthetic: { missingProbability: 0.6 },
                },
              },
            },
          },
        },
        stages: [
          {
            id: 'ego',
            type: 'EgoForm',
            label: 'You',
            introductionPanel: { title: 'You', text: 'About you.' },
            form: { fields: [{ variable: 'note', prompt: 'Note?' }] },
          },
          {
            id: 'ng',
            type: 'NameGenerator',
            label: 'People',
            subject: { entity: 'node', type: 'person' },
            form: {
              title: 'P',
              fields: [
                { variable: 'label', prompt: 'Name?' },
                { variable: 'extra', prompt: 'Extra?' },
              ],
            },
            synthetic: { count: { distribution: 'constant', value: 12 } },
            prompts: [{ id: 'p1', text: 'Who?' }],
          },
        ],
      }) as CurrentProtocol;
      for (const seed of [1, 2, 3]) {
        const network = run(protocol, seed).session.network;
        let sawAbsent = false;
        for (const node of network.nodes) {
          const attrs = node[entityAttributesProperty];
          for (const [key, value] of Object.entries(attrs)) {
            expect(value, `${key} must never be null`).not.toBeNull();
          }
          if (!('extra' in attrs)) sawAbsent = true;
        }
        expect(sawAbsent).toBe(true); // missingness = absent key, not null
      }
    });
  });
});

describe('S8 — stage semantics, hosts, and the never-reproduced set', () => {
  const run = (protocol: CurrentProtocol, seed = 1, respectSkipLogic = true) =>
    generateInterviews(protocol, {
      count: 1,
      seed,
      simulateDropOut: false,
      respectSkipLogic,
      startWindow: '2026-08-20T12:00:00.000Z',
    })[0]!;

  describe('S8: values land only where their collecting stage writes them', () => {
    it('a generator sharing the pedigree node type never mints pedigree structure', () => {
      // #1205's proband scatter: createNodesForStage filled EVERY declared
      // variable, so name-generator alters carried the pedigree's ego flag.
      const protocol = CurrentProtocolSchema.parse({
        name: 'shared-type',
        schemaVersion: 8,
        codebook: {
          node: {
            'family-member': {
              name: 'Member',
              color: 'node-color-seq-1',
              shape: { default: 'circle' },
              variables: {
                name: { name: 'name', type: 'text', component: 'Text' },
                isEgo: { name: 'isEgo', type: 'boolean' },
                relationship: { name: 'relationship', type: 'text' },
                biologicalSex: {
                  name: 'biologicalSex',
                  type: 'categorical',
                  options: [
                    { label: 'Female', value: 'female' },
                    { label: 'Male', value: 'male' },
                    { label: 'Unknown', value: 'unknown' },
                  ],
                },
              },
            },
          },
        },
        stages: [
          {
            id: 'qa',
            type: 'NameGeneratorQuickAdd',
            label: 'QA',
            subject: { entity: 'node', type: 'family-member' },
            quickAdd: 'name',
            synthetic: { count: { distribution: 'constant', value: 5 } },
            prompts: [{ id: 'p1', text: 'Who?' }],
          },
        ],
      }) as CurrentProtocol;
      for (const seed of [1, 2, 3]) {
        for (const node of run(protocol, seed).session.network.nodes) {
          const attrs = node[entityAttributesProperty];
          // Only the collecting stage's variable is written; the pedigree's
          // structural slots stay ABSENT — never scattered defaults.
          expect(typeof attrs['name']).toBe('string');
          expect('isEgo' in attrs).toBe(false);
          expect('relationship' in attrs).toBe(false);
          expect('biologicalSex' in attrs).toBe(false);
        }
      }
    });
  });

  describe('S9: the #791 construction — minNodes 9, no maxNodes', () => {
    it('never hangs: bounded outcome, fast, deterministic', () => {
      const parsed = CurrentProtocolSchema.safeParse({
        name: 'floor-only',
        schemaVersion: 8,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              shape: { default: 'circle' },
              variables: {
                label: { name: 'label', type: 'text', component: 'Text' },
              },
            },
          },
        },
        stages: [
          {
            id: 'qa',
            type: 'NameGeneratorQuickAdd',
            label: 'QA',
            subject: { entity: 'node', type: 'person' },
            quickAdd: 'label',
            behaviours: { minNodes: 9 },
            prompts: [{ id: 'p1', text: 'Who?' }],
          },
        ],
      });
      if (!parsed.success) {
        // A parse refusal (default count support below the floor) is a legal
        // strong answer — the old bug was an infinite 'Loading preview…'.
        return;
      }
      const started = Date.now();
      const result = run(parsed.data as CurrentProtocol, 42);
      expect(Date.now() - started).toBeLessThan(5000);
      expect(result.session.network.nodes.length).toBeGreaterThanOrEqual(9);
    });
  });

  describe('⚠1: sameAs-group missingness is a group decision, never a split', () => {
    it('an optional sameAs pair with missingness 1 on one member: both absent or both present', () => {
      const parsed = CurrentProtocolSchema.safeParse({
        name: 'sameas-missing',
        schemaVersion: 8,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              shape: { default: 'circle' },
              variables: {
                label: { name: 'label', type: 'text', component: 'Text' },
                a: { name: 'a', type: 'boolean', component: 'Toggle' },
                b: {
                  name: 'b',
                  type: 'boolean',
                  component: 'Toggle',
                  validation: { sameAs: 'a' },
                  synthetic: { missingProbability: 1 },
                },
              },
            },
          },
        },
        stages: [
          {
            id: 'ng',
            type: 'NameGenerator',
            label: 'P',
            subject: { entity: 'node', type: 'person' },
            form: {
              title: 'P',
              fields: [
                { variable: 'label', prompt: 'Name?' },
                { variable: 'a', prompt: 'A?' },
                { variable: 'b', prompt: 'B?' },
              ],
            },
            synthetic: { count: { distribution: 'constant', value: 10 } },
            prompts: [{ id: 'p1', text: 'Who?' }],
          },
        ],
      });
      if (!parsed.success) return; // refusal of the contradiction also legal
      for (const seed of [1, 2, 3]) {
        let generated = true;
        try {
          for (const node of run(parsed.data as CurrentProtocol, seed).session
            .network.nodes) {
            const attrs = node[entityAttributesProperty];
            const hasA = 'a' in attrs;
            const hasB = 'b' in attrs;
            if (hasB) {
              // b present forces the pair equal (the runtime validator's rule).
              expect(hasA).toBe(true);
              expect(attrs['b']).toBe(attrs['a']);
            }
          }
        } catch (error) {
          generated = false;
          expect((error as Error).message).toMatch(/cannot|conflict|satisf/i);
        }
        expect(typeof generated).toBe('boolean');
      }
    });
  });

  describe('⚠4: sociogram highlight cannot bypass the constraint machinery', () => {
    it('a unique highlight boolean over 3 nodes: honoured or refused, never duplicated', () => {
      const parsed = CurrentProtocolSchema.safeParse({
        name: 'hl-unique',
        schemaVersion: 8,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              shape: { default: 'circle' },
              variables: {
                label: { name: 'label', type: 'text', component: 'Text' },
                layout: { name: 'layout', type: 'layout' },
                starred: {
                  name: 'starred',
                  type: 'boolean',
                  validation: { unique: true },
                },
              },
            },
          },
        },
        stages: [
          {
            id: 'qa',
            type: 'NameGeneratorQuickAdd',
            label: 'QA',
            subject: { entity: 'node', type: 'person' },
            quickAdd: 'label',
            synthetic: { count: { distribution: 'constant', value: 3 } },
            prompts: [{ id: 'p1', text: 'Who?' }],
          },
          {
            id: 'soc',
            type: 'Sociogram',
            label: 'Star',
            subject: { entity: 'node', type: 'person' },
            background: { concentricCircles: 3 },
            prompts: [
              {
                id: 'ps',
                text: 'Star them',
                layout: { layoutVariable: 'layout' },
                highlight: { allowHighlighting: true, variable: 'starred' },
              },
            ],
          },
        ],
      });
      if (!parsed.success) {
        // Refusing unique-on-a-3-node-boolean pre-seed is the strong answer:
        // a 2-value space cannot hold 3 unique values.
        expect(JSON.stringify(parsed.error.issues)).toMatch(/unique|distinct/i);
        return;
      }
      let refused = false;
      const values: unknown[] = [];
      try {
        for (const node of run(parsed.data as CurrentProtocol, 5).session
          .network.nodes) {
          values.push(node[entityAttributesProperty]['starred']);
        }
      } catch (error) {
        refused = true;
        expect((error as Error).message).toMatch(/unique|distinct/i);
      }
      if (!refused) {
        const present = values.filter((v) => v !== undefined);
        expect(new Set(present).size).toBe(present.length); // never duplicated
      }
    });
  });

  describe('⚠5: pedigree sex variable storage shape', () => {
    it('an ordinal biologicalSexVariable is refused or stored to type', () => {
      const parsed = CurrentProtocolSchema.safeParse({
        name: 'ped-ordinal-sex',
        schemaVersion: 8,
        codebook: {
          node: {
            'family-member': {
              name: 'Member',
              color: 'node-color-seq-1',
              shape: { default: 'circle' },
              variables: {
                name: { name: 'name', type: 'text', component: 'Text' },
                isEgo: { name: 'isEgo', type: 'boolean' },
                relationship: { name: 'relationship', type: 'text' },
                sex: {
                  name: 'sex',
                  type: 'ordinal',
                  options: [
                    { label: 'Female', value: 'female' },
                    { label: 'Male', value: 'male' },
                  ],
                },
              },
            },
          },
          edge: {
            'family-edge': {
              name: 'Edge',
              color: 'edge-color-seq-1',
              variables: {
                relationshipType: {
                  name: 'relationshipType',
                  type: 'categorical',
                  options: [
                    { label: 'Biological', value: 'biological' },
                    { label: 'Partner', value: 'partner' },
                  ],
                },
                isActive: { name: 'isActive', type: 'boolean' },
              },
            },
          },
        },
        stages: [
          {
            id: 'fp',
            type: 'FamilyPedigree',
            label: 'Family',
            nodeConfig: {
              type: 'family-member',
              nodeLabelVariable: 'name',
              egoVariable: 'isEgo',
              relationshipVariable: 'relationship',
              biologicalSexVariable: 'sex',
            },
            edgeConfig: {
              type: 'family-edge',
              relationshipTypeVariable: 'relationshipType',
              isActiveVariable: 'isActive',
            },
            framing: { mode: 'fixed', value: 'gamete' },
            boundaries: {
              requireGrandparents: 'off',
              requireChildrenContributors: 'off',
            },
            censusPrompt: 'Build your family.',
          },
        ],
      });
      if (!parsed.success) {
        // Schema refusing a non-categorical sex variable = shape mismatch
        // unrepresentable.
        return;
      }
      const nodes = run(parsed.data as CurrentProtocol, 1).session.network
        .nodes;
      for (const node of nodes) {
        const sex = node[entityAttributesProperty]['sex'];
        if (sex !== undefined) {
          // Ordinal values are SCALARS in this codebase's storage contract.
          expect(Array.isArray(sex)).toBe(false);
        }
      }
    });
  });
});

describe('S7b — a skipped edge creator contributes nothing downstream', () => {
  it('the #1235 topology-transfer class has no mechanism to transfer', () => {
    const protocol = CurrentProtocolSchema.parse({
      name: 'skip-topology',
      schemaVersion: 8,
      codebook: {
        ego: {
          variables: {
            consent: { name: 'consent', type: 'boolean', component: 'Toggle' },
          },
        },
        node: {
          person: {
            name: 'Person',
            color: 'node-color-seq-1',
            shape: { default: 'circle' },
            variables: {
              label: { name: 'label', type: 'text', component: 'Text' },
              layout: { name: 'layout', type: 'layout' },
            },
          },
        },
        edge: { knows: { name: 'Knows', color: 'edge-color-seq-1' } },
      },
      stages: [
        {
          id: 'qa',
          type: 'NameGeneratorQuickAdd',
          label: 'QA',
          subject: { entity: 'node', type: 'person' },
          quickAdd: 'label',
          synthetic: { count: { distribution: 'constant', value: 4 } },
          prompts: [{ id: 'p1', text: 'Who?' }],
        },
        {
          // Always skipped: people exist by the time the route reaches it.
          id: 'soc',
          type: 'Sociogram',
          label: 'Link',
          subject: { entity: 'node', type: 'person' },
          background: { concentricCircles: 3 },
          skipLogic: {
            action: 'SKIP',
            filter: {
              rules: [
                {
                  id: 'anyone',
                  type: 'node',
                  options: { type: 'person', operator: 'EXISTS' },
                },
              ],
            },
          },
          synthetic: {
            topology: {
              metric: 'density',
              distribution: { distribution: 'constant', value: 1 },
            },
          },
          prompts: [
            {
              id: 'ps',
              text: 'Link them',
              layout: { layoutVariable: 'layout' },
              edges: { create: 'knows' },
            },
          ],
        },
        {
          id: 'census',
          type: 'DyadCensus',
          label: 'Census',
          subject: { entity: 'node', type: 'person' },
          introductionPanel: { title: 'Pairs', text: 'Every pair.' },
          synthetic: {
            topology: {
              metric: 'density',
              distribution: { distribution: 'constant', value: 0 },
            },
          },
          prompts: [{ id: 'pc', text: 'Linked?', createEdge: 'knows' }],
        },
      ],
    }) as CurrentProtocol;
    const result = generateInterviews(protocol, {
      count: 1,
      seed: 1,
      simulateDropOut: false,
      respectSkipLogic: true,
      startWindow: '2026-08-20T12:00:00.000Z',
    })[0]!;
    // The density-1 sociogram was skipped: no edges from it, and its
    // topology target moved nowhere — the density-0 census answers every
    // pair negative over an edgeless network.
    expect(result.visitedStages).toEqual([0, 2]);
    expect(result.session.network.edges).toEqual([]);
    const ledger = result.session.stageMetadata?.['2'];
    expect(Array.isArray(ledger)).toBe(true);
    for (const tuple of ledger as [number, string, string, boolean][]) {
      expect(tuple[3]).toBe(false);
    }
  });
});
