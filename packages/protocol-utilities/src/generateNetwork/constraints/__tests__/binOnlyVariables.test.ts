import { describe, expect, it } from 'vitest';

import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { generateNetwork } from '../../../generateNetwork';
import { collectBinOnlyVariables } from '../binOnlyVariables';
import { SyntheticDataConstraintError } from '../error';

/** Three people, so a two-value `unique` space is one short of the count. */
const nameGenerator = {
  id: 'stage-people',
  type: 'NameGenerator',
  label: 'People',
  subject: { entity: 'node', type: 'person' },
  prompts: [{ id: 'p1', text: 'Name people' }],
  behaviours: { minNodes: 3, maxNodes: 3 },
} as unknown as Stage;

const ordinalBin = {
  id: 'stage-bin',
  type: 'OrdinalBin',
  label: 'Sort people',
  subject: { entity: 'node', type: 'person' },
  prompts: [{ id: 'p2', text: 'Sort', variable: 'rank' }],
} as unknown as Stage;

const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      variables: {
        rank: {
          name: 'Rank',
          type: 'ordinal',
          component: 'RadioGroup',
          options: [
            { label: 'Low', value: 1 },
            { label: 'High', value: 2 },
          ],
          validation: { unique: true },
        },
      },
    },
  },
} as unknown as StructuralCodebook;

/** The same name generator, now also collecting `rank` in a form field. */
const nameGeneratorRankingRank = {
  ...nameGenerator,
  form: {
    title: 'About this person',
    fields: [{ variable: 'rank', prompt: 'Rank' }],
  },
} as unknown as Stage;

const narrativeDisplayingRank = {
  id: 'stage-narrative',
  type: 'Narrative',
  label: 'Review people',
  subject: { entity: 'node', type: 'person' },
  presets: [
    {
      id: 'preset-1',
      label: 'Review',
      layoutVariable: 'layout',
      highlight: ['rank'],
    },
  ],
} as unknown as Stage;

describe('a unique variable used only by a binning stage', () => {
  it('generates, because nothing in the interview validates it', () => {
    const { network } = generateNetwork({
      seed: 3,
      codebook,
      stages: [nameGenerator, ordinalBin],
    });

    expect(network.nodes).toHaveLength(3);
    for (const node of network.nodes) {
      expect([1, 2]).toContain(node[entityAttributesProperty].rank);
    }
  });

  // The exemption rests on nothing rendering a field for the variable, so a
  // protocol that does render one takes it away again: there the participant
  // is shown a validation error, and generated data that could not pass is
  // data the preview should refuse rather than quietly produce.
  it('is still refused once a form field renders the same variable', () => {
    let error: unknown;
    try {
      generateNetwork({
        seed: 3,
        codebook,
        stages: [nameGeneratorRankingRank, ordinalBin],
      });
    } catch (thrown) {
      error = thrown;
    }

    expect(error).toBeInstanceOf(SyntheticDataConstraintError);
    if (!(error instanceof SyntheticDataConstraintError)) return;
    expect(error.conflicts).toHaveLength(1);
    expect(error.conflicts[0]?.variableNames).toEqual(['Rank']);
    expect(error.conflicts[0]?.rules).toEqual(['unique']);
  });

  it('generates when the only other reference is on a read-only stage', () => {
    const { network } = generateNetwork({
      seed: 3,
      codebook,
      stages: [nameGenerator, ordinalBin, narrativeDisplayingRank],
    });

    expect(network.nodes).toHaveLength(3);
  });

  it('generates when a form writer is proven unreachable', () => {
    const unreachableForm = {
      id: 'stage-form',
      type: 'AlterForm',
      label: 'About each person',
      subject: { entity: 'node', type: 'person' },
      form: {
        fields: [{ variable: 'rank', prompt: 'Rank' }],
      },
      skipLogic: {
        action: 'SKIP',
        filter: {
          rules: [
            {
              id: 'missing-consent',
              type: 'ego',
              options: {
                attribute: 'consent',
                operator: 'NOT_EXISTS',
              },
            },
          ],
        },
      },
    } as unknown as Stage;

    const { network } = generateNetwork({
      seed: 3,
      codebook,
      stages: [nameGenerator, ordinalBin, unreachableForm],
      respectSkipLogicAndFiltering: true,
    });

    expect(network.nodes).toHaveLength(3);
  });
});

describe('collectBinOnlyVariables', () => {
  it('names a binning stage prompt variable nothing else references', () => {
    expect(collectBinOnlyVariables([nameGenerator, ordinalBin])).toEqual(
      new Map([['person', new Set(['rank'])]]),
    );
  });

  it('drops a variable a form field also renders', () => {
    expect(
      collectBinOnlyVariables([nameGeneratorRankingRank, ordinalBin]),
    ).toEqual(new Map());
  });

  it('ignores read-only references to a binning stage variable', () => {
    expect(
      collectBinOnlyVariables([
        nameGenerator,
        ordinalBin,
        narrativeDisplayingRank,
      ]),
    ).toEqual(new Map([['person', new Set(['rank'])]]));
  });

  it('keeps a variable two binning stages share', () => {
    const categoricalBin = {
      id: 'stage-categorical-bin',
      type: 'CategoricalBin',
      label: 'Sort people again',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p3', text: 'Sort', variable: 'rank' }],
    } as unknown as Stage;

    expect(
      collectBinOnlyVariables([nameGenerator, ordinalBin, categoricalBin]),
    ).toEqual(new Map([['person', new Set(['rank'])]]));
  });

  // CategoricalBin's `otherVariable` is the one value a binning stage does
  // collect in a `Field`, so its rules are enforced like any other form field's.
  it("excludes a categorical bin prompt's other variable", () => {
    const categoricalBin = {
      id: 'stage-categorical-bin',
      type: 'CategoricalBin',
      label: 'Sort people',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'p3',
          text: 'Sort',
          variable: 'contexts',
          otherVariable: 'otherContext',
          otherVariablePrompt: 'Which?',
        },
      ],
    } as unknown as Stage;

    expect(collectBinOnlyVariables([nameGenerator, categoricalBin])).toEqual(
      new Map([['person', new Set(['contexts'])]]),
    );
  });
});
