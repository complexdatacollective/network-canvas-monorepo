import { describe, expect, it } from 'vitest';

import { MAX_SYNTHETIC_POPULATION } from '../../../shared/synthetic/helpers.ts';
import { createBaseProtocol } from '../../../utils/test-utils.ts';
import ProtocolSchemaV8 from '../schema.ts';
import { networkComposerStage } from '../stages/network-composer.ts';
import {
  DEFAULT_CATEGORICAL_OTHER_BIN_PROBABILITY,
  DEFAULT_PANEL_NOMINATION_PROBABILITY,
  DEFAULT_RESPONSE_BURDEN,
} from '../synthetic/index.ts';

type Loose = Record<string, unknown>;

const parse = (protocol: unknown) => ProtocolSchemaV8.safeParse(protocol);

// Serialised search: a variable that fails inside the plain VariableSchema
// union (e.g. boolean, whose type matches two branches) surfaces its member
// issues nested under an invalid_union issue rather than flattened.
const hasIssue = (
  result: ReturnType<typeof parse>,
  fragment: string,
): boolean =>
  !result.success && JSON.stringify(result.error.issues).includes(fragment);

// Counts and topology are declared by the STAGE that creates the entities, not
// by the codebook type. The base protocol opens with a NameGenerator and a
// Sociogram, which are exactly the two hosts these tests need.
const withNodeStageSynthetic = (synthetic: unknown) => {
  const protocol = createBaseProtocol();
  (protocol.stages[0] as Loose).synthetic = synthetic;
  return protocol;
};

const withEdgeStageSynthetic = (synthetic: unknown) => {
  const protocol = createBaseProtocol();
  (protocol.stages[1] as Loose).synthetic = synthetic;
  return protocol;
};

/**
 * Adds (or replaces) a person variable and returns the protocol. The base
 * protocol's person type already carries text/number/categorical/ordinal/
 * layout variables that these tests decorate with `synthetic`.
 */
const withPersonVariable = (key: string, variable: Loose) => {
  const protocol = createBaseProtocol();
  (protocol.codebook.node.person.variables as Loose)[key] = variable;
  return protocol;
};

describe('synthetic metadata (additive to schema 8)', () => {
  it('accepts the base protocol without any synthetic metadata', () => {
    expect(parse(createBaseProtocol()).success).toBe(true);
  });

  describe('node population counts', () => {
    it.each([
      ['constant', { distribution: 'constant', value: 5 }],
      ['uniform', { distribution: 'uniform', min: 1, max: 8 }],
      ['poisson', { distribution: 'poisson', mean: 3 }],
      [
        'truncated normal',
        { distribution: 'normal', mean: 18, sd: 6, min: 5, max: 40 },
      ],
    ])('accepts a %s count', (_label, count) => {
      expect(parse(withNodeStageSynthetic({ count })).success).toBe(true);
    });

    it.each([
      ['inverted uniform bounds', { distribution: 'uniform', min: 8, max: 1 }],
      ['negative sd', { distribution: 'normal', mean: 10, sd: -1 }],
      ['negative poisson mean', { distribution: 'poisson', mean: -2 }],
      ['non-integer constant', { distribution: 'constant', value: 5.5 }],
      ['negative constant', { distribution: 'constant', value: -1 }],
      ['unknown family', { distribution: 'zipf', mean: 3 }],
      [
        'parameters from another family',
        { distribution: 'poisson', mean: 3, sd: 2 },
      ],
    ])('rejects a count with %s', (_label, count) => {
      expect(parse(withNodeStageSynthetic({ count })).success).toBe(false);
    });

    it.each([
      ['a mean below its own minimum', { mean: 5, sd: 0, min: 10 }],
      ['a negative mean', { mean: -5, sd: 0 }],
      ['a mean above its own maximum', { mean: 40, sd: 0, max: 20 }],
    ])('rejects a zero-deviation count with %s', (_label, count) => {
      // Single-point support: the sole draw is clamped to the window, so the
      // authored mean is discarded in silence.
      const result = parse(
        withNodeStageSynthetic({ count: { distribution: 'normal', ...count } }),
      );
      expect(result.success).toBe(false);
      expect(
        hasIssue(result, 'a standard deviation of 0 can reach nothing else'),
      ).toBe(true);
    });

    it('accepts a zero-deviation count its window can return', () => {
      expect(
        parse(
          withNodeStageSynthetic({
            count: { distribution: 'normal', mean: 12, sd: 0, min: 10 },
          }),
        ).success,
      ).toBe(true);
    });

    it('leaves a negative mean WITH spread alone', () => {
      // "Usually zero, occasionally more" is a legitimate parameterisation;
      // only the degenerate case is decidable.
      expect(
        parse(
          withNodeStageSynthetic({
            count: { distribution: 'normal', mean: -5, sd: 4 },
          }),
        ).success,
      ).toBe(true);
    });

    it('rejects a population no preview could render', () => {
      // Generation is synchronous, and Architect's PreviewHost runs it on the
      // main thread: a billion people is arithmetically fine, schema-valid
      // before this, and locks the renderer.
      expect(
        parse(
          withNodeStageSynthetic({
            count: { distribution: 'constant', value: 1_000_000_000 },
          }),
        ).success,
      ).toBe(false);
    });

    it.each([
      ['uniform', { distribution: 'uniform', min: 1, max: 50_000 }],
      ['poisson', { distribution: 'poisson', mean: 2_000_000 }],
      ['normal', { distribution: 'normal', mean: 1_000_000, sd: 1 }],
      // Every parameter here looks reasonable; the DERIVED ceiling is
      // mean + 6·sd = 70,000 people and 2.45 billion pairs.
      ['wide-normal', { distribution: 'normal', mean: 10_000, sd: 10_000 }],
      ['wide-poisson', { distribution: 'poisson', mean: 9_900 }],
    ])('rejects an oversized %s count', (_label, count) => {
      expect(parse(withNodeStageSynthetic({ count })).success).toBe(false);
    });

    it('accepts a spread whose derived ceiling stays inside the cap', () => {
      // mean + 6·sd = 40, well under the ceiling.
      expect(
        parse(
          withNodeStageSynthetic({
            count: { distribution: 'normal', mean: 10, sd: 5 },
          }),
        ).success,
      ).toBe(true);
    });

    it('accepts a wide spread that declares its own ceiling', () => {
      // An explicit `max` is what the draw truncates to, so a spread wider
      // than the window is fine — provided the mean itself stays inside it.
      expect(
        parse(
          withNodeStageSynthetic({
            count: {
              distribution: 'normal',
              mean: 25,
              sd: 10_000,
              max: 50,
            },
          }),
        ).success,
      ).toBe(true);
    });

    it('accepts a population at the ceiling', () => {
      expect(
        parse(
          withNodeStageSynthetic({
            count: {
              distribution: 'constant',
              value: MAX_SYNTHETIC_POPULATION,
            },
          }),
        ).success,
      ).toBe(true);
    });

    it('rejects unknown keys beside count', () => {
      const synthetic = {
        count: { distribution: 'poisson', mean: 3 },
        extra: true,
      };
      expect(parse(withNodeStageSynthetic(synthetic)).success).toBe(false);
    });

    it('rejects synthetic metadata on ego', () => {
      const protocol = createBaseProtocol();
      (protocol.codebook.ego as Loose).synthetic = {
        count: { distribution: 'constant', value: 1 },
      };
      expect(parse(protocol).success).toBe(false);
    });
  });

  describe('edge topology', () => {
    it.each([
      [
        'mean degree with a truncated normal',
        {
          metric: 'meanDegree',
          distribution: { distribution: 'normal', mean: 3.5, sd: 1, min: 0 },
        },
      ],
      [
        'density with explicit uniform bounds',
        {
          metric: 'density',
          distribution: { distribution: 'uniform', min: 0.3, max: 0.5 },
        },
      ],
      [
        'density uniform over its whole 0-1 domain',
        { metric: 'density', distribution: { distribution: 'uniform' } },
      ],
      [
        'constant density',
        {
          metric: 'density',
          distribution: { distribution: 'constant', value: 0.15 },
        },
      ],
      [
        'constant mean degree',
        {
          metric: 'meanDegree',
          distribution: { distribution: 'constant', value: 2 },
        },
      ],
    ])('accepts %s', (_label, topology) => {
      expect(parse(withEdgeStageSynthetic({ topology })).success).toBe(true);
    });

    it.each([
      [
        'an absolute edge count',
        // Absolute counts are deliberately unrepresentable for edges.
        { count: { distribution: 'poisson', mean: 12 } },
      ],
      [
        'a density above 1',
        {
          topology: {
            metric: 'density',
            distribution: { distribution: 'constant', value: 1.5 },
          },
        },
      ],
      [
        'a mean-degree uniform without bounds',
        // No canonical domain supplies meanDegree bounds, so uniform requires
        // them explicitly.
        {
          topology: {
            metric: 'meanDegree',
            distribution: { distribution: 'uniform' },
          },
        },
      ],
      [
        'an unknown metric',
        {
          topology: {
            metric: 'edgeCount',
            distribution: { distribution: 'constant', value: 3 },
          },
        },
      ],
      [
        'inverted truncation bounds',
        {
          topology: {
            metric: 'meanDegree',
            distribution: {
              distribution: 'normal',
              mean: 3,
              sd: 1,
              min: 4,
              max: 2,
            },
          },
        },
      ],
    ])('rejects %s', (_label, synthetic) => {
      expect(parse(withEdgeStageSynthetic(synthetic)).success).toBe(false);
    });

    it('accepts a beta density', () => {
      // Density is a proportion, so beta is the family that lives on 0-1 by
      // construction rather than by clamping a normal that wanted to leave.
      expect(
        parse(
          withEdgeStageSynthetic({
            topology: {
              metric: 'density',
              distribution: { distribution: 'beta', mean: 0.3, sd: 0.15 },
            },
          }),
        ).success,
      ).toBe(true);
    });

    it('rejects a beta density with no alpha/beta solution', () => {
      // sd² >= mean·(1−mean) cannot be realised by any beta distribution.
      expect(
        parse(
          withEdgeStageSynthetic({
            topology: {
              metric: 'density',
              distribution: { distribution: 'beta', mean: 0.5, sd: 0.5 },
            },
          }),
        ).success,
      ).toBe(false);
    });
  });

  describe('where count and topology may be declared', () => {
    const aCount = { distribution: 'constant', value: 5 };
    const aTopology = {
      metric: 'density',
      distribution: { distribution: 'constant', value: 0.4 },
    };

    it('rejects a count on the node type it used to be declared on', () => {
      // A count is a property of the asking, not of the asked-about: three
      // name generators over `person` each nominate their own people, and
      // nothing in the protocol says how one declared population would split
      // between them.
      const protocol = createBaseProtocol();
      (protocol.codebook.node.person as Loose).synthetic = { count: aCount };
      expect(parse(protocol).success).toBe(false);
    });

    it('rejects topology on the edge type it used to be declared on', () => {
      const protocol = createBaseProtocol();
      (protocol.codebook.edge.knows as Loose).synthetic = {
        topology: aTopology,
      };
      expect(parse(protocol).success).toBe(false);
    });

    it('rejects topology on a name generator, which creates no edges', () => {
      expect(
        parse(withNodeStageSynthetic({ topology: aTopology })).success,
      ).toBe(false);
    });

    const informationStage = (synthetic?: unknown): Loose => ({
      id: 'info1',
      type: 'Information',
      label: 'Welcome',
      title: 'Welcome',
      items: [{ id: 'item-1', type: 'text', content: 'Hello' }],
      ...(synthetic === undefined ? {} : { synthetic }),
    });

    it('accepts an Information stage carrying no synthetic metadata', () => {
      // Guards the assertion below: that one must fail for the synthetic
      // block, not because this fixture was malformed all along.
      const protocol = createBaseProtocol();
      (protocol.stages as Loose[]).push(informationStage());
      expect(parse(protocol).success).toBe(true);
    });

    it('rejects a count on a stage that creates nobody', () => {
      const protocol = createBaseProtocol();
      (protocol.stages as Loose[]).push(informationStage({ count: aCount }));
      expect(parse(protocol).success).toBe(false);
    });

    describe('a stage that creates both people and links', () => {
      const composer = (synthetic?: unknown) => ({
        id: 'nc1',
        label: 'Build the network',
        type: 'NetworkComposer',
        subject: { entity: 'node', type: 'person' },
        quickAdd: 'name',
        layoutVariable: 'layoutPosition',
        background: { concentricCircles: 4 },
        edges: [{ id: 'edge-1', subject: { entity: 'edge', type: 'knows' } }],
        ...(synthetic === undefined ? {} : { synthetic }),
      });

      it.each([
        ['a count alone', { count: aCount }],
        ['a topology alone', { topology: aTopology }],
        ['both halves together', { count: aCount, topology: aTopology }],
      ])('accepts %s', (_label, synthetic) => {
        expect(
          networkComposerStage.safeParse(composer(synthetic)).success,
        ).toBe(true);
      });

      it('accepts the stage with no synthetic block at all', () => {
        expect(networkComposerStage.safeParse(composer()).success).toBe(true);
      });

      it('rejects an empty synthetic block', () => {
        // "On but declaring nothing" says exactly what "no block" says, and
        // storing it would leave the editor's toggle with two off states.
        expect(networkComposerStage.safeParse(composer({})).success).toBe(
          false,
        );
      });
    });
  });

  describe('response burden', () => {
    // The base protocol opens with a NameGenerator and a Sociogram and
    // declares no synthetic metadata, so what comes back is exactly what
    // parsing put there.
    const parsedStages = (protocol: unknown) => {
      const result = parse(protocol);
      if (!result.success) {
        throw new Error(JSON.stringify(result.error.issues));
      }
      return result.data.stages;
    };

    it('gives a stage that declares none the burden its type carries', () => {
      const [nameGenerator, sociogram] = parsedStages(createBaseProtocol());

      expect(nameGenerator?.synthetic.responseBurden).toBe(
        DEFAULT_RESPONSE_BURDEN.NameGenerator,
      );
      expect(sociogram?.synthetic.responseBurden).toBe(
        DEFAULT_RESPONSE_BURDEN.Sociogram,
      );
    });

    it('leaves an authored burden alone', () => {
      // The point of the field: a researcher who knows their own sociogram
      // takes longer than most says so, and the default does not overrule it.
      const [nameGenerator, sociogram] = parsedStages(
        withEdgeStageSynthetic({ responseBurden: 1.5 }),
      );

      expect(sociogram?.synthetic.responseBurden).toBe(1.5);
      // ...and says nothing about any other stage.
      expect(nameGenerator?.synthetic.responseBurden).toBe(
        DEFAULT_RESPONSE_BURDEN.NameGenerator,
      );
    });

    it('leaves an authored burden alone on a stage that resolves its own count', () => {
      // A name generator rebuilds its descriptor in a transform rather than
      // taking it from the field, so it is the one shape where an authored
      // burden could be dropped on the floor.
      const [nameGenerator] = parsedStages(
        withNodeStageSynthetic({
          responseBurden: 0.9,
          count: { distribution: 'constant', value: 4 },
        }),
      );

      expect(nameGenerator?.synthetic.responseBurden).toBe(0.9);
    });

    it('accepts a burden above 1', () => {
      // Burden is a rate that accumulates without bound, not a probability:
      // 1.5 means "half again as demanding as the usual DyadCensus", and
      // capping it at 1 would make the table's ceiling the model's ceiling.
      expect(
        parse(withEdgeStageSynthetic({ responseBurden: 2.5 })).success,
      ).toBe(true);
    });

    it('accepts a burden of 0', () => {
      // A stage the researcher operates rather than the participant.
      expect(parse(withEdgeStageSynthetic({ responseBurden: 0 })).success).toBe(
        true,
      );
    });

    it('rejects a negative burden', () => {
      // Nothing an interview can do makes a participant less tired than they
      // were before it, so a stage cannot repay burden the others accrued.
      const result = parse(withEdgeStageSynthetic({ responseBurden: -0.1 }));

      expect(result.success).toBe(false);
      expect(hasIssue(result, 'responseBurden')).toBe(true);
    });
  });

  describe('panel nomination odds', () => {
    // The base protocol opens with a NameGenerator, which is one of the two
    // stage types that can carry panels at all.
    const withPanels = (panels: Loose[]) => {
      const protocol = createBaseProtocol();
      (protocol.stages[0] as Loose).panels = panels;
      return protocol;
    };

    const parsedPanels = (protocol: unknown) => {
      const result = parse(protocol);
      if (!result.success) {
        throw new Error(JSON.stringify(result.error.issues));
      }
      const [stage] = result.data.stages;
      if (stage?.type !== 'NameGenerator') {
        throw new Error('Base protocol no longer opens with a NameGenerator');
      }
      return stage.panels ?? [];
    };

    it('gives an existing-network panel that declares none the default odds', () => {
      const [panel] = parsedPanels(
        withPanels([{ id: 'e', title: 'Previously', dataSource: 'existing' }]),
      );

      expect(panel?.synthetic?.nominationProbability).toBe(
        DEFAULT_PANEL_NOMINATION_PROBABILITY,
      );
    });

    it('leaves authored odds alone', () => {
      // The point of the field: a researcher who knows their participants
      // reliably take back the people they named earlier says so, and the
      // default does not overrule it.
      const [panel] = parsedPanels(
        withPanels([
          {
            id: 'e',
            title: 'Previously',
            dataSource: 'existing',
            synthetic: { nominationProbability: 0.9 },
          },
        ]),
      );

      expect(panel?.synthetic?.nominationProbability).toBe(0.9);
    });

    it('resolves odds panel by panel', () => {
      // Two panels on one stage are two questions, so one declaring its own
      // rate says nothing about the other.
      const panels = parsedPanels(
        withPanels([
          {
            id: 'close',
            title: 'People you were close to',
            dataSource: 'existing',
            synthetic: { nominationProbability: 0.8 },
          },
          { id: 'all', title: 'Everyone so far', dataSource: 'existing' },
        ]),
      );

      expect(panels[0]?.synthetic?.nominationProbability).toBe(0.8);
      expect(panels[1]?.synthetic?.nominationProbability).toBe(
        DEFAULT_PANEL_NOMINATION_PROBABILITY,
      );
    });

    it('leaves a roster panel with no odds at all', () => {
      // The resolved default must not reach a panel the schema would refuse
      // an authored one on, or every roster panel in every protocol would be
      // rejected for metadata the schema itself had put there.
      const [panel] = parsedPanels(
        withPanels([{ id: 'r', title: 'Roster', dataSource: 'asset-1' }]),
      );

      expect(panel?.synthetic).toBeUndefined();
    });

    it('rejects authored odds on a roster panel', () => {
      // A roster's contribution is drawn once for the stage rather than
      // person by person, so per-candidate odds set on one could never be
      // consulted.
      const result = parse(
        withPanels([
          {
            id: 'r',
            title: 'Roster',
            dataSource: 'asset-1',
            synthetic: { nominationProbability: 0.9 },
          },
        ]),
      );

      expect(result.success).toBe(false);
      expect(hasIssue(result, 'Synthetic nomination odds apply only')).toBe(
        true,
      );
    });

    it('rejects an empty synthetic block on a roster panel', () => {
      // `{}` is still something a human wrote, and it parses to a full
      // descriptor. Accepting it would leave the one authored shape the
      // refusal cannot see.
      const result = parse(
        withPanels([
          {
            id: 'r',
            title: 'Roster',
            dataSource: 'asset-1',
            synthetic: {},
          },
        ]),
      );

      expect(result.success).toBe(false);
      expect(hasIssue(result, 'Synthetic nomination odds apply only')).toBe(
        true,
      );
    });

    it('rejects odds outside 0 to 1', () => {
      // Consulted once per candidate as a weighted coin, so there is nothing
      // for a value above 1 to mean.
      const result = parse(
        withPanels([
          {
            id: 'e',
            title: 'Previously',
            dataSource: 'existing',
            synthetic: { nominationProbability: 1.5 },
          },
        ]),
      );

      expect(result.success).toBe(false);
      expect(hasIssue(result, 'nominationProbability')).toBe(true);
    });
  });

  describe('categorical bin other-bin odds', () => {
    // The base protocol carries no bin stage, so these append one that sorts
    // people by the `category` variable it already defines. `name` is its
    // text variable, which is what an 'other' answer is typed into.
    const withBinPrompts = (...prompts: Loose[]) => {
      const protocol = createBaseProtocol();
      (protocol.stages as Loose[]).push({
        id: 'categoricalBin1',
        type: 'CategoricalBin',
        label: 'Sort by category',
        subject: { entity: 'node', type: 'person' },
        prompts: prompts.map((prompt, index) => ({
          id: `binPrompt${index + 1}`,
          text: 'Which category?',
          variable: 'category',
          ...prompt,
        })),
      });
      return protocol;
    };

    const otherFields = {
      otherVariable: 'name',
      otherVariablePrompt: 'Which other category?',
      otherOptionLabel: 'Other',
    };

    const parsedBinPrompts = (protocol: unknown) => {
      const result = parse(protocol);
      if (!result.success) {
        throw new Error(JSON.stringify(result.error.issues));
      }
      const stage = result.data.stages.at(-1);
      if (stage?.type !== 'CategoricalBin') {
        throw new Error('Expected the appended stage to be a CategoricalBin');
      }
      return stage.prompts;
    };

    it('gives a prompt with an other bin the default odds', () => {
      const [prompt] = parsedBinPrompts(withBinPrompts(otherFields));

      expect(prompt?.synthetic?.otherBinProbability).toBe(
        DEFAULT_CATEGORICAL_OTHER_BIN_PROBABILITY,
      );
    });

    it('leaves authored odds alone', () => {
      // The point of the field: a researcher who knows their category list
      // covers their participants badly says so, and the default does not
      // overrule it.
      const [prompt] = parsedBinPrompts(
        withBinPrompts({
          ...otherFields,
          synthetic: { otherBinProbability: 0.6 },
        }),
      );

      expect(prompt?.synthetic?.otherBinProbability).toBe(0.6);
    });

    it('resolves odds prompt by prompt', () => {
      // Two prompts on one stage are two questions, so one declaring its own
      // rate says nothing about the other.
      const prompts = parsedBinPrompts(
        withBinPrompts(
          { ...otherFields, synthetic: { otherBinProbability: 0.6 } },
          otherFields,
        ),
      );

      expect(prompts[0]?.synthetic?.otherBinProbability).toBe(0.6);
      expect(prompts[1]?.synthetic?.otherBinProbability).toBe(
        DEFAULT_CATEGORICAL_OTHER_BIN_PROBABILITY,
      );
    });

    it('leaves a prompt with no other bin no odds at all', () => {
      // The resolved default must not reach a prompt the schema would refuse
      // an authored one on, or every bin prompt without an other bin would be
      // rejected for metadata the schema itself had put there.
      const [prompt] = parsedBinPrompts(withBinPrompts({}));

      expect(prompt?.synthetic).toBeUndefined();
    });

    it('rejects authored odds on a prompt with no other bin', () => {
      // With no other bin rendered, nothing can be drawn against these odds.
      const result = parse(
        withBinPrompts({ synthetic: { otherBinProbability: 0.6 } }),
      );

      expect(result.success).toBe(false);
      expect(hasIssue(result, 'synthetic other-bin odds require')).toBe(true);
    });

    it('rejects an empty synthetic block on a prompt with no other bin', () => {
      // `{}` is still something a human wrote, and it parses to a full
      // descriptor. Accepting it would leave the one authored shape the
      // refusal cannot see.
      const result = parse(withBinPrompts({ synthetic: {} }));

      expect(result.success).toBe(false);
      expect(hasIssue(result, 'synthetic other-bin odds require')).toBe(true);
    });

    it('rejects odds outside 0 to 1', () => {
      // Consulted once per alter as a weighted coin, so there is nothing for
      // a value above 1 to mean.
      const result = parse(
        withBinPrompts({
          ...otherFields,
          synthetic: { otherBinProbability: 1.5 },
        }),
      );

      expect(result.success).toBe(false);
      expect(hasIssue(result, 'otherBinProbability')).toBe(true);
    });
  });

  describe('boolean variables with a one-sided option list', () => {
    const booleanVariable = (synthetic: unknown, options?: Loose[]): Loose => ({
      name: 'Is_Close',
      type: 'boolean',
      component: 'Boolean',
      ...(options ? { options } : {}),
      synthetic,
    });

    it('rejects a probability the offered values cannot produce', () => {
      // Only `false` is offered, so the generator returns it and the declared
      // probability never applies — the opposite of what was authored.
      const protocol = withPersonVariable(
        'isClose',
        booleanVariable({ probabilityTrue: 1 }, [
          { label: 'No', value: false },
        ]),
      );
      const result = parse(protocol);
      expect(result.success).toBe(false);
      expect(hasIssue(result, 'cannot be drawn when the only option')).toBe(
        true,
      );
    });

    it('accepts a probability the sole option agrees with', () => {
      const protocol = withPersonVariable(
        'isClose',
        booleanVariable({ probabilityTrue: 0 }, [
          { label: 'No', value: false },
        ]),
      );
      expect(parse(protocol).success).toBe(true);
    });

    it('leaves a componentless boolean alone', () => {
      // A NetworkComposer field can render this as a `Toggle`, which ignores
      // the options — `booleanDomainValues` only reads them for the `Boolean`
      // choice control — so both values stay drawable and the probability
      // takes effect.
      const protocol = withPersonVariable('isClose', {
        name: 'Is_Close',
        type: 'boolean',
        options: [{ label: 'No', value: false }],
        synthetic: { probabilityTrue: 1 },
      });
      expect(parse(protocol).success).toBe(true);
    });

    it('leaves a two-sided list alone', () => {
      const protocol = withPersonVariable(
        'isClose',
        booleanVariable({ probabilityTrue: 0.7 }, [
          { label: 'No', value: false },
          { label: 'Yes', value: true },
        ]),
      );
      expect(parse(protocol).success).toBe(true);
    });
  });

  describe('number variables', () => {
    const numberVariable = (synthetic: unknown, validation?: Loose): Loose => ({
      name: 'Height',
      type: 'number',
      ...(validation ? { validation } : {}),
      synthetic,
    });

    it.each([
      [
        'a normal descriptor inside validation bounds',
        {
          distribution: 'normal',
          mean: 34,
          sd: 12,
          min: 18,
          max: 99,
          missingProbability: 0.08,
        },
      ],
      ['a lognormal descriptor', { distribution: 'lognormal', mean: 8, sd: 7 }],
      ['a uniform descriptor', { distribution: 'uniform', min: 20, max: 60 }],
      ['a constant', { distribution: 'constant', value: 42 }],
      ['a missing-only declaration', { missingProbability: 0.08 }],
    ])('accepts %s', (_label, synthetic) => {
      const protocol = withPersonVariable(
        'height',
        numberVariable(synthetic, { minValue: 18, maxValue: 99 }),
      );
      expect(parse(protocol).success).toBe(true);
    });

    it.each([
      ['an unknown family', { distribution: 'cauchy', mean: 0 }],
      ['inverted uniform bounds', { distribution: 'uniform', min: 9, max: 1 }],
      [
        'a non-positive lognormal mean',
        { distribution: 'lognormal', mean: 0, sd: 1 },
      ],
      ['a negative sd', { distribution: 'normal', mean: 0, sd: -2 }],
      ['an out-of-range missing probability', { missingProbability: 1.5 }],
      ['an empty block', {}],
    ])('rejects %s', (_label, synthetic) => {
      const protocol = withPersonVariable('height', numberVariable(synthetic));
      expect(parse(protocol).success).toBe(false);
    });

    it('rejects a uniform range disjoint from the validation bounds', () => {
      const protocol = withPersonVariable(
        'height',
        numberVariable(
          { distribution: 'uniform', min: 200, max: 300 },
          {
            minValue: 18,
            maxValue: 99,
          },
        ),
      );
      const result = parse(protocol);
      expect(result.success).toBe(false);
      expect(hasIssue(result, 'exceeds the validation maxValue')).toBe(true);
    });

    it('rejects a zero-deviation normal outside the validation bounds', () => {
      // Same single-point support a constant has, so the same rule: every draw
      // is clamped to a boundary and the authored distribution is replaced.
      const protocol = withPersonVariable(
        'height',
        numberVariable(
          { distribution: 'normal', mean: 200, sd: 0 },
          { minValue: 18, maxValue: 99 },
        ),
      );
      const result = parse(protocol);
      expect(result.success).toBe(false);
      expect(
        hasIssue(result, 'standard deviation of 0 can reach nothing'),
      ).toBe(true);
    });

    it('rejects a zero-deviation normal outside its own window', () => {
      // Generation clamps into the intersection of both windows, so the
      // descriptor's own bounds exclude a mean just as the validation ones do.
      // Read against validation alone this passed, and every draw came back as
      // 10 rather than the declared mean of 5.
      const protocol = withPersonVariable(
        'height',
        numberVariable({
          distribution: 'normal',
          mean: 5,
          sd: 0,
          min: 10,
          max: 20,
        }),
      );
      const result = parse(protocol);
      expect(result.success).toBe(false);
      expect(
        hasIssue(result, 'standard deviation of 0 can reach nothing'),
      ).toBe(true);
    });

    it('still reports a descriptor window disjoint from the validation one', () => {
      // The zero-deviation check used to return past these, so a window that
      // generation ignores entirely went unreported.
      const protocol = withPersonVariable(
        'height',
        numberVariable(
          { distribution: 'normal', mean: 150, sd: 0, min: 150, max: 200 },
          { minValue: 18, maxValue: 99 },
        ),
      );
      const result = parse(protocol);
      expect(result.success).toBe(false);
      expect(hasIssue(result, 'exceeds the validation maxValue')).toBe(true);
    });

    it('accepts a zero-deviation normal inside them', () => {
      const protocol = withPersonVariable(
        'height',
        numberVariable(
          { distribution: 'normal', mean: 50, sd: 0 },
          { minValue: 18, maxValue: 99 },
        ),
      );
      expect(parse(protocol).success).toBe(true);
    });

    it('rejects a lognormal under a nonpositive ceiling', () => {
      // The descriptor authors no `min`, so comparing only authored bounds
      // finds nothing to object to. A lognormal's support is positive
      // regardless, and generation truncates into the validation window — so
      // accepting this stores a distribution that can only ever emit the
      // ceiling itself.
      const protocol = withPersonVariable(
        'debt',
        numberVariable(
          { distribution: 'lognormal', mean: 100, sd: 20 },
          { maxValue: -1 },
        ),
      );
      const result = parse(protocol);
      expect(result.success).toBe(false);
      expect(hasIssue(result, 'draws only positive values')).toBe(true);
    });

    it('rejects a zero-deviation lognormal outside the validation bounds', () => {
      // Positive support, so the lognormal ceiling rule says nothing; with a
      // deviation of zero the mean is the only value it can produce.
      const protocol = withPersonVariable(
        'debt',
        numberVariable(
          { distribution: 'lognormal', mean: 1, sd: 0 },
          { minValue: 10, maxValue: 500 },
        ),
      );
      const result = parse(protocol);
      expect(result.success).toBe(false);
      expect(
        hasIssue(result, 'standard deviation of 0 can reach nothing'),
      ).toBe(true);
    });

    it('accepts a zero-deviation lognormal inside them', () => {
      const protocol = withPersonVariable(
        'debt',
        numberVariable(
          { distribution: 'lognormal', mean: 100, sd: 0 },
          { minValue: 10, maxValue: 500 },
        ),
      );
      expect(parse(protocol).success).toBe(true);
    });

    it('accepts a lognormal whose ceiling leaves positive room', () => {
      const protocol = withPersonVariable(
        'debt',
        numberVariable(
          { distribution: 'lognormal', mean: 100, sd: 20 },
          { maxValue: 500 },
        ),
      );
      expect(parse(protocol).success).toBe(true);
    });

    it('rejects a constant outside the validation bounds', () => {
      const protocol = withPersonVariable(
        'height',
        numberVariable(
          { distribution: 'constant', value: 5 },
          {
            minValue: 18,
          },
        ),
      );
      const result = parse(protocol);
      expect(result.success).toBe(false);
      expect(hasIssue(result, 'outside the validation bounds')).toBe(true);
    });

    it('rejects a truncation max below the validation minValue', () => {
      const protocol = withPersonVariable(
        'height',
        numberVariable(
          { distribution: 'normal', mean: 10, sd: 2, max: 10 },
          {
            minValue: 18,
          },
        ),
      );
      expect(parse(protocol).success).toBe(false);
    });
  });

  describe('scalar variables', () => {
    const scalarVariable = (synthetic: unknown): Loose => ({
      name: 'Closeness_Scalar',
      type: 'scalar',
      synthetic,
    });

    it.each([
      ['a beta descriptor', { distribution: 'beta', mean: 0.7, sd: 0.18 }],
      ['a domain-bounded uniform', { distribution: 'uniform' }],
      ['a normal descriptor', { distribution: 'normal', mean: 0.5, sd: 0.2 }],
      ['a constant', { distribution: 'constant', value: 0.5 }],
      ['a missing-only declaration', { missingProbability: 0.05 }],
    ])('accepts %s', (_label, synthetic) => {
      expect(
        parse(withPersonVariable('closenessScalar', scalarVariable(synthetic)))
          .success,
      ).toBe(true);
    });

    it.each([
      [
        'beta parameters with no alpha/beta solution',
        { distribution: 'beta', mean: 0.5, sd: 0.5 },
      ],
      ['a constant outside 0-1', { distribution: 'constant', value: 1.5 }],
      [
        'a normal mean outside 0-1',
        { distribution: 'normal', mean: 1.2, sd: 0.1 },
      ],
      [
        'a lognormal family (not offered for scalar)',
        { distribution: 'lognormal', mean: 1, sd: 1 },
      ],
    ])('rejects %s', (_label, synthetic) => {
      expect(
        parse(withPersonVariable('closenessScalar', scalarVariable(synthetic)))
          .success,
      ).toBe(false);
    });
  });

  describe('boolean variables', () => {
    const booleanVariable = (synthetic: unknown): Loose => ({
      name: 'Smoker',
      type: 'boolean',
      synthetic,
    });

    it.each([
      ['a probability', { probabilityTrue: 0.7 }],
      [
        'a probability with missingness',
        { probabilityTrue: 0.7, missingProbability: 0.1 },
      ],
      ['a missing-only declaration', { missingProbability: 0.1 }],
    ])('accepts %s', (_label, synthetic) => {
      expect(
        parse(withPersonVariable('smoker', booleanVariable(synthetic))).success,
      ).toBe(true);
    });

    it.each([
      ['an empty block', {}],
      ['an out-of-range probability', { probabilityTrue: 1.2 }],
    ])('rejects %s', (_label, synthetic) => {
      expect(
        parse(withPersonVariable('smoker', booleanVariable(synthetic))).success,
      ).toBe(false);
    });
  });

  describe('ordinal variables', () => {
    // The base protocol's `strength` ordinal offers integer values 1/2/3.
    const withStrengthSynthetic = (synthetic: unknown) => {
      const protocol = createBaseProtocol();
      (protocol.codebook.node.person.variables.strength as Loose).synthetic =
        synthetic;
      return protocol;
    };

    it('accepts weights over a subset of option values', () => {
      const result = parse(
        withStrengthSynthetic({
          optionWeights: [
            { value: 1, weight: 0.1 },
            { value: 2, weight: 0.3 },
          ],
        }),
      );
      expect(result.success).toBe(true);
    });

    it('accepts a missing-only declaration', () => {
      expect(
        parse(withStrengthSynthetic({ missingProbability: 0.02 })).success,
      ).toBe(true);
    });

    it('rejects a weight for a value the options do not offer', () => {
      const result = parse(
        withStrengthSynthetic({ optionWeights: [{ value: 4, weight: 1 }] }),
      );
      expect(result.success).toBe(false);
      expect(hasIssue(result, 'not one of this variable')).toBe(true);
    });

    it('rejects a weight whose value type does not match the option value', () => {
      // Typed identity: the string "1" is not the integer option value 1.
      const result = parse(
        withStrengthSynthetic({ optionWeights: [{ value: '1', weight: 1 }] }),
      );
      expect(result.success).toBe(false);
    });

    it('rejects repeated weight entries for one value', () => {
      const result = parse(
        withStrengthSynthetic({
          optionWeights: [
            { value: 1, weight: 0.2 },
            { value: 1, weight: 0.8 },
          ],
        }),
      );
      expect(result.success).toBe(false);
      expect(hasIssue(result, 'Duplicate option weight')).toBe(true);
    });

    it('rejects a table that zeroes every option value', () => {
      const result = parse(
        withStrengthSynthetic({
          optionWeights: [
            { value: 1, weight: 0 },
            { value: 2, weight: 0 },
            { value: 3, weight: 0 },
          ],
        }),
      );
      expect(result.success).toBe(false);
      expect(hasIssue(result, 'positive weight')).toBe(true);
    });

    it('accepts zero weights while an omitted value keeps the default weight', () => {
      const result = parse(
        withStrengthSynthetic({
          optionWeights: [
            { value: 1, weight: 0 },
            { value: 2, weight: 0 },
          ],
        }),
      );
      expect(result.success).toBe(true);
    });

    it('rejects an empty weights table', () => {
      expect(parse(withStrengthSynthetic({ optionWeights: [] })).success).toBe(
        false,
      );
    });

    it('rejects a negative weight', () => {
      expect(
        parse(
          withStrengthSynthetic({ optionWeights: [{ value: 1, weight: -1 }] }),
        ).success,
      ).toBe(false);
    });
  });

  describe('categorical variables', () => {
    // The base protocol's `category` offers string values friend/family.
    const withCategorySynthetic = (synthetic: unknown, validation?: Loose) => {
      const protocol = createBaseProtocol();
      const category = protocol.codebook.node.person.variables
        .category as Loose;
      category.synthetic = synthetic;
      if (validation) category.validation = validation;
      return protocol;
    };

    it('accepts a selection-count table with option weights', () => {
      const result = parse(
        withCategorySynthetic({
          selectionCount: {
            probabilities: [
              { count: 0, probability: 0.1 },
              { count: 1, probability: 0.6 },
              { count: 2, probability: 0.3 },
            ],
          },
          optionWeights: [
            { value: 'friend', weight: 0.6 },
            { value: 'family', weight: 0.4 },
          ],
        }),
      );
      expect(result.success).toBe(true);
    });

    it.each([
      [
        'only option weights',
        { optionWeights: [{ value: 'friend', weight: 2 }] },
      ],
      [
        'only a selection-count table',
        {
          selectionCount: {
            probabilities: [{ count: 1, probability: 1 }],
          },
        },
      ],
      ['a missing-only declaration', { missingProbability: 0.04 }],
    ])('accepts %s', (_label, synthetic) => {
      expect(parse(withCategorySynthetic(synthetic)).success).toBe(true);
    });

    it('rejects probabilities that do not sum to 1', () => {
      const result = parse(
        withCategorySynthetic({
          selectionCount: {
            probabilities: [
              { count: 1, probability: 0.5 },
              { count: 2, probability: 0.3 },
            ],
          },
        }),
      );
      expect(result.success).toBe(false);
      expect(hasIssue(result, 'must sum to 1')).toBe(true);
    });

    it('rejects duplicate counts', () => {
      const result = parse(
        withCategorySynthetic({
          selectionCount: {
            probabilities: [
              { count: 1, probability: 0.5 },
              { count: 1, probability: 0.5 },
            ],
          },
        }),
      );
      expect(result.success).toBe(false);
      expect(hasIssue(result, 'Duplicate selection count')).toBe(true);
    });

    it('rejects a count above the number of distinct option values', () => {
      const result = parse(
        withCategorySynthetic({
          selectionCount: {
            probabilities: [{ count: 3, probability: 1 }],
          },
        }),
      );
      expect(result.success).toBe(false);
      expect(hasIssue(result, 'distinct option values')).toBe(true);
    });

    it('rejects a zero count on a required variable', () => {
      const result = parse(
        withCategorySynthetic(
          {
            selectionCount: {
              probabilities: [
                { count: 0, probability: 0.5 },
                { count: 1, probability: 0.5 },
              ],
            },
          },
          { required: true },
        ),
      );
      expect(result.success).toBe(false);
      expect(hasIssue(result, 'not required')).toBe(true);
    });

    it('rejects a positive count below minSelected', () => {
      const result = parse(
        withCategorySynthetic(
          {
            selectionCount: {
              probabilities: [
                { count: 1, probability: 0.5 },
                { count: 2, probability: 0.5 },
              ],
            },
          },
          { minSelected: 2 },
        ),
      );
      expect(result.success).toBe(false);
      expect(hasIssue(result, 'below minSelected')).toBe(true);
    });

    it('rejects a count above maxSelected', () => {
      const result = parse(
        withCategorySynthetic(
          {
            selectionCount: {
              probabilities: [{ count: 2, probability: 1 }],
            },
          },
          { maxSelected: 1 },
        ),
      );
      expect(result.success).toBe(false);
      expect(hasIssue(result, 'exceeds maxSelected')).toBe(true);
    });

    describe('a variable a CategoricalBin bins', () => {
      // A bin drop places an alter in exactly one bin, so only 0 or 1 is
      // drawable however many options the variable offers.
      const withBinnedCategory = (synthetic: unknown) => {
        const protocol = createBaseProtocol();
        (protocol.codebook.node.person.variables.category as Loose).synthetic =
          synthetic;
        protocol.stages.push({
          id: 'categoricalBin1',
          type: 'CategoricalBin',
          label: 'Groups',
          subject: { entity: 'node', type: 'person' },
          prompts: [
            { id: 'cbPrompt1', text: 'Which group?', variable: 'category' },
          ],
        } as unknown as (typeof protocol.stages)[number]);
        return protocol;
      };

      it('rejects a count above one', () => {
        const result = parse(
          withBinnedCategory({
            selectionCount: { probabilities: [{ count: 2, probability: 1 }] },
          }),
        );
        expect(result.success).toBe(false);
        expect(hasIssue(result, 'places an alter in exactly one bin')).toBe(
          true,
        );
      });

      it('accepts counts of 0 and 1', () => {
        // An alter left in the bucket is a state the interface produces, and
        // being binned does not stop the variable being optional.
        const result = parse(
          withBinnedCategory({
            selectionCount: {
              probabilities: [
                { count: 0, probability: 0.2 },
                { count: 1, probability: 0.8 },
              ],
            },
          }),
        );
        expect(result.success).toBe(true);
      });

      it('leaves the same count legal where no bin stage collects it', () => {
        const result = parse(
          withCategorySynthetic({
            selectionCount: { probabilities: [{ count: 2, probability: 1 }] },
          }),
        );
        expect(result.success).toBe(true);
      });
    });

    it('rejects a count above the option values with positive weight', () => {
      const result = parse(
        withCategorySynthetic({
          selectionCount: {
            probabilities: [{ count: 2, probability: 1 }],
          },
          optionWeights: [{ value: 'friend', weight: 0 }],
        }),
      );
      expect(result.success).toBe(false);
      expect(hasIssue(result, 'positive weight')).toBe(true);
    });
  });

  describe('a zero-deviation topology mean', () => {
    // Single-point support, so the mean must be a value the draw can return —
    // the rule the variable-level number and datetime descriptors carry.
    const composerWith = (topology: unknown) => {
      const protocol = createBaseProtocol();
      (protocol.stages[1] as Loose).synthetic = { topology };
      return protocol;
    };

    it('rejects a density mean its own window excludes', () => {
      const result = parse(
        composerWith({
          metric: 'density',
          distribution: {
            distribution: 'normal',
            mean: 0.2,
            sd: 0,
            min: 0.8,
            max: 0.9,
          },
        }),
      );
      expect(result.success).toBe(false);
      expect(
        hasIssue(result, 'a standard deviation of 0 can reach nothing else'),
      ).toBe(true);
    });

    it('rejects a mean-degree mean below the domain', () => {
      const result = parse(
        composerWith({
          metric: 'meanDegree',
          distribution: { distribution: 'normal', mean: -2, sd: 0 },
        }),
      );
      expect(result.success).toBe(false);
      expect(
        hasIssue(result, 'a standard deviation of 0 can reach nothing else'),
      ).toBe(true);
    });

    it('accepts a mean the draw can return', () => {
      expect(
        parse(
          composerWith({
            metric: 'density',
            distribution: {
              distribution: 'normal',
              mean: 0.85,
              sd: 0,
              min: 0.8,
              max: 0.9,
            },
          }),
        ).success,
      ).toBe(true);
    });

    it('leaves a spread distribution alone', () => {
      // Only the degenerate case is decidable: with any spread the draw can
      // land inside the window whatever its centre.
      expect(
        parse(
          composerWith({
            metric: 'density',
            distribution: {
              distribution: 'normal',
              mean: 0.2,
              sd: 0.3,
              min: 0.8,
              max: 0.9,
            },
          }),
        ).success,
      ).toBe(true);
    });
  });

  describe('a boolean a Composer field renders as a choice', () => {
    // The variable-level rule scopes itself to a variable declaring the
    // `Boolean` control, because a componentless boolean may be rendered as a
    // Toggle, which ignores options. A composer field supplies the rendering
    // the variable lacked.
    const withComposerBoolean = (probabilityTrue: number) => {
      const protocol = withPersonVariable('agreed', {
        name: 'Agreed',
        type: 'boolean',
        // No component of its own, and only one answer offered.
        options: [{ label: 'No', value: false }],
        synthetic: { probabilityTrue },
      });
      (protocol.stages as Loose[]).push({
        id: 'nc-boolean',
        label: 'Build the network',
        type: 'NetworkComposer',
        subject: { entity: 'node', type: 'person' },
        quickAdd: 'name',
        layoutVariable: 'layoutPosition',
        background: { concentricCircles: 4 },
        nodeForm: {
          fields: [{ variable: 'agreed', component: 'Boolean' }],
        },
      } as unknown as Loose);
      return protocol;
    };

    it('rejects a probability the offered option cannot express', () => {
      const result = parse(withComposerBoolean(1));
      expect(result.success).toBe(false);
      expect(hasIssue(result, 'can never be drawn')).toBe(true);
    });

    it('accepts one the offered option can', () => {
      expect(parse(withComposerBoolean(0)).success).toBe(true);
    });
  });

  describe('datetime variables', () => {
    const datetimeVariable = (
      synthetic: unknown,
      parameters?: Loose,
      component = 'DatePicker',
    ): Loose => ({
      name: 'Date_Met',
      type: 'datetime',
      component,
      ...(parameters ? { parameters } : {}),
      synthetic,
    });

    it('rejects a window a Composer field puts out of reach', () => {
      // A composer field carries its own picker parameters, and
      // `applyComposerRenderings` makes them authoritative for the values this
      // stage generates. Judged against the codebook variable's own window
      // alone — here, none at all — a synthetic range the field can never
      // accept passed validation and was silently discarded at generation.
      const protocol = withPersonVariable(
        'dateMet',
        datetimeVariable({
          distribution: 'uniform',
          min: '1950-01-01',
          max: '1960-01-01',
        }),
      );
      (protocol.stages as Loose[]).push({
        id: 'nc-window',
        label: 'Build the network',
        type: 'NetworkComposer',
        subject: { entity: 'node', type: 'person' },
        quickAdd: 'name',
        layoutVariable: 'layoutPosition',
        background: { concentricCircles: 4 },
        nodeForm: {
          fields: [
            {
              variable: 'dateMet',
              component: 'DatePicker',
              parameters: { min: '2000-01-01', max: '2010-01-01' },
            },
          ],
        },
      } as unknown as Loose);

      const result = parse(protocol);
      expect(result.success).toBe(false);
      expect(
        hasIssue(result, 'is before the earliest date this field accepts'),
      ).toBe(true);
    });

    it('accepts a window the Composer field can reach', () => {
      const protocol = withPersonVariable(
        'dateMet',
        datetimeVariable({
          distribution: 'uniform',
          min: '2001-01-01',
          max: '2002-01-01',
        }),
      );
      (protocol.stages as Loose[]).push({
        id: 'nc-window',
        label: 'Build the network',
        type: 'NetworkComposer',
        subject: { entity: 'node', type: 'person' },
        quickAdd: 'name',
        layoutVariable: 'layoutPosition',
        background: { concentricCircles: 4 },
        nodeForm: {
          fields: [
            {
              variable: 'dateMet',
              component: 'DatePicker',
              parameters: { min: '2000-01-01', max: '2010-01-01' },
            },
          ],
        },
      } as unknown as Loose);

      expect(parse(protocol).success).toBe(true);
    });

    it('rejects a synthetic bound the picker cannot offer', () => {
      // The picker's own parameters are already held to these floors, and a
      // synthetic window is drawn from directly where the field declares no
      // bounds — so a bound below them would have generation emit dates no
      // participant could enter.
      const yearZero = withPersonVariable(
        'dateMet',
        datetimeVariable({ distribution: 'uniform', min: '0000-01-01' }),
      );
      const zeroResult = parse(yearZero);
      expect(zeroResult.success).toBe(false);
      expect(hasIssue(zeroResult, 'year of 0001 or later')).toBe(true);

      const smallCoarseYear = withPersonVariable(
        'dateMet',
        datetimeVariable(
          { distribution: 'uniform', min: '0099' },
          {
            type: 'year',
          },
        ),
      );
      const coarseResult = parse(smallCoarseYear);
      expect(coarseResult.success).toBe(false);
      expect(hasIssue(coarseResult, 'four-digit year of 1000 or later')).toBe(
        true,
      );
    });

    it('accepts a uniform window at the variable resolution', () => {
      const protocol = withPersonVariable(
        'dateMet',
        datetimeVariable(
          { distribution: 'uniform', min: '2005-01' },
          {
            type: 'month',
          },
        ),
      );
      expect(parse(protocol).success).toBe(true);
    });

    it('rejects a zero-deviation date mean outside its own window', () => {
      // One date and nothing else, so a mean outside the synthetic window is
      // clamped to a boundary and never appears.
      const protocol = withPersonVariable(
        'dateMet',
        datetimeVariable({
          distribution: 'normal',
          mean: '1990-06-15',
          sdDays: 0,
          min: '2010-01-01',
          max: '2020-01-01',
        }),
      );
      const result = parse(protocol);
      expect(result.success).toBe(false);
      expect(hasIssue(result, 'standard deviation of 0 days')).toBe(true);
    });

    it('accepts a zero-deviation date mean inside it', () => {
      const protocol = withPersonVariable(
        'dateMet',
        datetimeVariable({
          distribution: 'normal',
          mean: '2015-06-15',
          sdDays: 0,
          min: '2010-01-01',
          max: '2020-01-01',
        }),
      );
      expect(parse(protocol).success).toBe(true);
    });

    it('accepts a normal descriptor with a full ISO mean and sdDays', () => {
      const protocol = withPersonVariable(
        'dateMet',
        datetimeVariable(
          { distribution: 'normal', mean: '2010-06-15', sdDays: 365 },
          { type: 'month' },
        ),
      );
      expect(parse(protocol).success).toBe(true);
    });

    it('accepts a missing-only declaration', () => {
      const protocol = withPersonVariable(
        'dateMet',
        datetimeVariable({ missingProbability: 0.1 }),
      );
      expect(parse(protocol).success).toBe(true);
    });

    it('rejects bounds that do not match the variable resolution', () => {
      const protocol = withPersonVariable(
        'dateMet',
        datetimeVariable(
          { distribution: 'uniform', min: '2005-01-15' },
          {
            type: 'month',
          },
        ),
      );
      const result = parse(protocol);
      expect(result.success).toBe(false);
      expect(hasIssue(result, 'valid YYYY-MM date')).toBe(true);
    });

    it('rejects an inverted window', () => {
      const protocol = withPersonVariable(
        'dateMet',
        datetimeVariable({
          distribution: 'uniform',
          min: '2020-01-01',
          max: '2010-01-01',
        }),
      );
      expect(parse(protocol).success).toBe(false);
    });

    it('accepts a window that overlaps the field window', () => {
      const protocol = withPersonVariable(
        'dateMet',
        datetimeVariable(
          { distribution: 'uniform', min: '2020-06-01', max: '2021-06-01' },
          { type: 'full', min: '2020-01-01', max: '2020-12-31' },
        ),
      );
      expect(parse(protocol).success).toBe(true);
    });

    it('rejects a window that starts after the field window ends', () => {
      const protocol = withPersonVariable(
        'dateMet',
        datetimeVariable(
          { distribution: 'uniform', min: '2030-01-01' },
          { type: 'full', min: '2020-01-01', max: '2020-12-31' },
        ),
      );
      const result = parse(protocol);
      expect(result.success).toBe(false);
      expect(hasIssue(result, 'after the latest date this field accepts')).toBe(
        true,
      );
    });

    it('rejects a window that ends before the field window starts', () => {
      const protocol = withPersonVariable(
        'dateMet',
        datetimeVariable(
          { distribution: 'uniform', max: '2010-01-01' },
          { type: 'full', min: '2020-01-01' },
        ),
      );
      const result = parse(protocol);
      expect(result.success).toBe(false);
      expect(
        hasIssue(result, 'before the earliest date this field accepts'),
      ).toBe(true);
    });

    it('compares the field window at the variable resolution', () => {
      const protocol = withPersonVariable(
        'dateMet',
        datetimeVariable(
          { distribution: 'uniform', min: '2030-01' },
          { type: 'month', min: '2005-01', max: '2010-12' },
        ),
      );
      const result = parse(protocol);
      expect(result.success).toBe(false);
      expect(hasIssue(result, 'after the latest date this field accepts')).toBe(
        true,
      );
    });

    it('rejects a normal mean that is not a full ISO date', () => {
      const protocol = withPersonVariable(
        'dateMet',
        datetimeVariable(
          { distribution: 'normal', mean: '2010-06', sdDays: 30 },
          { type: 'month' },
        ),
      );
      const result = parse(protocol);
      expect(result.success).toBe(false);
      expect(hasIssue(result, 'full ISO date')).toBe(true);
    });

    it('validates RelativeDatePicker bounds at full resolution', () => {
      const accepted = withPersonVariable(
        'dateMet',
        datetimeVariable(
          { distribution: 'uniform', min: '2020-01-01' },
          undefined,
          'RelativeDatePicker',
        ),
      );
      expect(parse(accepted).success).toBe(true);

      const rejected = withPersonVariable(
        'dateMet',
        datetimeVariable(
          { distribution: 'uniform', min: '2020-01' },
          undefined,
          'RelativeDatePicker',
        ),
      );
      expect(parse(rejected).success).toBe(false);
    });

    it('rejects a negative sdDays', () => {
      const protocol = withPersonVariable(
        'dateMet',
        datetimeVariable({
          distribution: 'normal',
          mean: '2010-06-15',
          sdDays: -1,
        }),
      );
      expect(parse(protocol).success).toBe(false);
    });
  });

  describe('text variables', () => {
    const withNameSynthetic = (synthetic: unknown) => {
      const protocol = createBaseProtocol();
      (protocol.codebook.node.person.variables.name as Loose).synthetic =
        synthetic;
      return protocol;
    };

    it.each(['personName', 'placeName', 'paragraph'] as const)(
      'accepts the %s generator',
      (generator) => {
        expect(parse(withNameSynthetic({ generator })).success).toBe(true);
      },
    );

    it('accepts a generator with missingness', () => {
      expect(
        parse(
          withNameSynthetic({
            generator: 'occupation',
            missingProbability: 0.2,
          }),
        ).success,
      ).toBe(true);
    });

    it('rejects a generator outside the curated enum', () => {
      expect(parse(withNameSynthetic({ generator: 'petName' })).success).toBe(
        false,
      );
    });

    it('rejects an empty block', () => {
      expect(parse(withNameSynthetic({})).success).toBe(false);
    });
  });

  describe('required and missingProbability are incompatible', () => {
    it.each([
      [
        'number',
        {
          name: 'Height',
          type: 'number',
          validation: { required: true },
          synthetic: { missingProbability: 0.1 },
        },
      ],
      [
        'text',
        {
          name: 'Nickname',
          type: 'text',
          validation: { required: true },
          synthetic: { generator: 'firstName', missingProbability: 0.1 },
        },
      ],
      [
        'boolean',
        {
          name: 'Smoker',
          type: 'boolean',
          validation: { required: true },
          synthetic: { probabilityTrue: 0.5, missingProbability: 0.1 },
        },
      ],
    ])('rejects it on a required %s variable', (_label, variable) => {
      const result = parse(withPersonVariable('subject', variable as Loose));
      expect(result.success).toBe(false);
      expect(hasIssue(result, 'required variable')).toBe(true);
    });
  });

  describe('layout and location variables stay stage-owned', () => {
    it('rejects synthetic metadata on a layout variable', () => {
      const protocol = createBaseProtocol();
      (
        protocol.codebook.node.person.variables.layoutPosition as Loose
      ).synthetic = { missingProbability: 0.1 };
      expect(parse(protocol).success).toBe(false);
    });

    it('rejects synthetic metadata on a location variable', () => {
      const protocol = withPersonVariable('home', {
        name: 'Home_Location',
        type: 'location',
        synthetic: { missingProbability: 0.1 },
      });
      expect(parse(protocol).success).toBe(false);
    });
  });
});

describe('a RelativeDatePicker with a declared anchor', () => {
  const relative = (
    parameters: Record<string, unknown>,
    synthetic: Record<string, unknown>,
  ) =>
    withPersonVariable('when', {
      name: 'when',
      type: 'datetime',
      component: 'RelativeDatePicker',
      parameters,
      synthetic,
    });

  it('rejects synthetic bounds outside the window the anchor fixes', () => {
    // A declared anchor makes the collection window static, and bounds outside
    // it are bounds the generator silently ignores — saved metadata with no
    // effect, which is worse than a refusal.
    expect(
      parse(
        relative(
          { anchor: '2020-06-01', before: 30, after: 30 },
          { distribution: 'uniform', min: '2030-01-01', max: '2030-02-01' },
        ),
      ).success,
    ).toBe(false);
  });

  it('accepts bounds inside it', () => {
    expect(
      parse(
        relative(
          { anchor: '2020-06-01', before: 30, after: 30 },
          { distribution: 'uniform', min: '2020-05-20', max: '2020-06-20' },
        ),
      ).success,
    ).toBe(true);
  });

  it('leaves a window with no anchor alone, because it moves with the run', () => {
    expect(
      parse(
        relative(
          { before: 30, after: 30 },
          { distribution: 'uniform', min: '2030-01-01', max: '2030-02-01' },
        ),
      ).success,
    ).toBe(true);
  });
});
