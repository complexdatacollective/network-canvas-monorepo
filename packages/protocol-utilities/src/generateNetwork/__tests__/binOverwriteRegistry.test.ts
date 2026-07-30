import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  type VariableValue,
} from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';
import { valueKey } from '../constraints/uniqueRegistry';

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

type StageOrder =
  | 'binThenForm'
  | 'binThenTwoForms'
  | 'binThenMorePeopleThenForm'
  | 'twoBinsThenForm'
  | 'formThenBin';

/** The shape the reviewer reported, and the wider one the sweeps use. */
type Shape = {
  minPeople: number;
  maxPeople: number;
  options: number;
  /** Joins a second variable to band's `unique` slot with `sameAs`. */
  echoed?: boolean;
  /** Adds a rule that forces band redraws, so releases change what is drawn. */
  contested?: boolean;
};

const REPORTED: Shape = { minPeople: 2, maxPeople: 2, options: 3 };
const SWEPT: Shape = {
  minPeople: 2,
  maxPeople: 4,
  options: 6,
  contested: true,
};

/**
 * People and a `unique` variable offering more values than there are of them —
 * which feasibility accepts with room to spare — written by a binning stage and
 * by a form.
 *
 * The bin and the form naming one variable is a protocol-authoring hazard in
 * its own right: the value a bin assigns is never validated, so the two stages
 * disagree about what the variable means. What is asserted here is only that
 * the registry's books survive it — a claim released must be the releasing
 * node's own.
 */
function binAndFormProtocol(
  binType: 'OrdinalBin' | 'CategoricalBin',
  order: StageOrder,
  shape: Shape,
): { codebook: Codebook; stages: Stage[] } {
  const nameGenerator = {
    id: 'stage-1',
    type: 'NameGenerator',
    label: 'Name generator',
    subject: { entity: 'node', type: 'person' },
    prompts: [{ id: 'p1', text: 'Name people' }],
    behaviours: { minNodes: shape.minPeople, maxNodes: shape.maxPeople },
  };
  const bin = {
    id: 'stage-bin',
    type: binType,
    label: 'Sort into bands',
    subject: { entity: 'node', type: 'person' },
    prompts: [{ id: 'p2', text: 'Sort', variable: 'band' }],
  };
  const formStage = (id: string) => ({
    id,
    type: 'AlterForm',
    label: 'About each person',
    subject: { entity: 'node', type: 'person' },
    form: { fields: [{ variable: 'band', prompt: 'Band' }] },
  });
  const form = formStage('stage-form');
  // People the binning stage never saw, so their claims are still the
  // registry's when the form runs.
  const laterPeople = {
    ...nameGenerator,
    id: 'stage-1b',
    prompts: [{ id: 'p1b', text: 'Name more people' }],
    behaviours: { minNodes: 1, maxNodes: 1 },
  };

  const stages =
    order === 'binThenForm'
      ? [nameGenerator, bin, form]
      : order === 'binThenTwoForms'
        ? [nameGenerator, bin, form, formStage('stage-form-2')]
        : order === 'binThenMorePeopleThenForm'
          ? [nameGenerator, bin, laterPeople, form]
          : order === 'twoBinsThenForm'
            ? [
                nameGenerator,
                bin,
                laterPeople,
                { ...bin, id: 'stage-bin-2' },
                form,
              ]
            : [nameGenerator, form, bin];

  return {
    codebook: {
      node: {
        person: {
          color: 'node-color-seq-1',
          variables: {
            band: {
              name: 'Band',
              type: binType === 'OrdinalBin' ? 'ordinal' : 'categorical',
              options: Array.from({ length: shape.options }, (_, index) => ({
                label: `Band ${index + 1}`,
                value: index + 1,
              })),
              validation: shape.contested
                ? { unique: true, differentFrom: 'mood' }
                : { unique: true },
            },
            ...(shape.echoed
              ? {
                  bandEcho: {
                    name: 'Band echo',
                    type: 'ordinal',
                    options: Array.from(
                      { length: shape.options },
                      (_, index) => ({
                        label: `Band ${index + 1}`,
                        value: index + 1,
                      }),
                    ),
                    validation: { sameAs: 'band' },
                  },
                }
              : {}),
            ...(shape.contested
              ? {
                  mood: {
                    name: 'Mood',
                    type: 'ordinal',
                    options: Array.from(
                      { length: shape.options },
                      (_, index) => ({
                        label: `Band ${index + 1}`,
                        value: index + 1,
                      }),
                    ),
                  },
                }
              : {}),
          },
        },
      },
    } as unknown as Codebook,
    stages: stages as unknown as Stage[],
  };
}

function bandsForSeed(
  seed: number,
  binType: 'OrdinalBin' | 'CategoricalBin',
  order: StageOrder = 'binThenForm',
  shape: Shape = SWEPT,
): VariableValue[] {
  const { codebook, stages } = binAndFormProtocol(binType, order, shape);
  const { network } = generateNetwork({ seed, codebook, stages });
  return network.nodes.map(
    (node) => node[entityAttributesProperty].band ?? null,
  );
}

/** Seeds whose people came out sharing a value, or which refused outright. */
function sweep(
  binType: 'OrdinalBin' | 'CategoricalBin',
  order: StageOrder = 'binThenForm',
): string[] {
  const failures: string[] = [];

  for (let seed = 1; seed <= 500; seed++) {
    try {
      const bands = bandsForSeed(seed, binType, order);
      const distinct = new Set(bands.map(valueKey));
      if (distinct.size !== bands.length) {
        failures.push(`seed ${seed}: bands ${JSON.stringify(bands)}`);
      }
    } catch (error) {
      failures.push(`seed ${seed}: ${String(error)}`);
    }
  }

  return failures;
}

describe('a unique variable a binning stage and a form both write', () => {
  // The bin's own two assignments collide on this seed, so the second node's
  // regeneration was handed a value the registry had issued to the first: the
  // release freed that claim and the draw handed the same value straight back,
  // for a network of [3, 3].
  it('issues no duplicate on seed 8, where two bin assignments collided', () => {
    expect(bandsForSeed(8, 'OrdinalBin', 'binThenForm', REPORTED)).toEqual([
      3, 1,
    ]);
  });

  it('issues no duplicate for an OrdinalBin over 500 seeds', () => {
    expect(sweep('OrdinalBin')).toEqual([]);
  });

  it('issues no duplicate for a CategoricalBin over 500 seeds', () => {
    expect(sweep('CategoricalBin')).toEqual([]);
  });

  // A second form has to give back what the first was issued, so the variable
  // must stop counting as written out of band once a draw has issued it again.
  it('issues no duplicate when a second form regenerates as well', () => {
    expect(sweep('OrdinalBin', 'binThenTwoForms')).toEqual([]);
  });

  // The bin value a form is handed can be a value the registry issued somebody
  // the bin never touched. Regenerating around it must not hand that claim back.
  it('issues no duplicate when people arrive after the bin', () => {
    expect(sweep('OrdinalBin', 'binThenMorePeopleThenForm')).toEqual([]);
  });

  // A second bin overwrites a value the registry never issued, so it has
  // nothing of this node's to give back — and giving one back anyway would be
  // giving back somebody else's.
  it('issues no duplicate when a second bin overwrites the first', () => {
    expect(sweep('OrdinalBin', 'twoBinsThenForm')).toEqual([]);
  });

  // A `sameAs` sibling the bin did not write still carries the value the
  // registry issued, so the claim is the node's and stays put — releasing it
  // would offer somebody else a value this node is still holding.
  it('keeps the claim a sameAs sibling still carries', () => {
    const echoed: Shape = { ...SWEPT, echoed: true };
    const failures: string[] = [];

    for (let seed = 1; seed <= 500; seed++) {
      const { codebook, stages } = binAndFormProtocol(
        'OrdinalBin',
        'binThenMorePeopleThenForm',
        echoed,
      );
      const { network } = generateNetwork({ seed, codebook, stages });
      const echoes: VariableValue[] = network.nodes.map(
        (node) => node[entityAttributesProperty].bandEcho ?? null,
      );
      if (new Set(echoes.map(valueKey)).size !== echoes.length) {
        failures.push(`seed ${seed}: echoes ${JSON.stringify(echoes)}`);
      }
    }

    expect(failures).toEqual([]);
  });

  // The counterpart to the sweeps above: a bin assignment is not a registry
  // draw, and nothing here may start enforcing `unique` on one. Two people
  // sharing a band is an arrangement the interface offers — OrdinalBin renders
  // no form field for its prompt variable, so the interview never validates it
  // — and the value a bin writes last is the value the network keeps.
  it('still lets two people share a bin, the bin having written last', () => {
    let shared = 0;

    for (let seed = 1; seed <= 500; seed++) {
      const bands = bandsForSeed(seed, 'OrdinalBin', 'formThenBin');
      if (new Set(bands.map(valueKey)).size < bands.length) shared += 1;
    }

    expect(shared).toBeGreaterThan(100);
  });
});
