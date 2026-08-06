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
  | 'formThenBin'
  | 'binOnly';

/** The narrow shape a reviewer once reported on, and the wider sweep shape. */
type Shape = {
  minPeople: number;
  maxPeople: number;
  options: number;
  /** Joins a second variable to band's `unique` slot with `sameAs`. */
  echoed?: boolean;
  /** Adds a cross-variable rule, so band is drawn against another value. */
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
 * disagree about what the variable means. The old generator re-drew the value
 * at each writer and had to keep the unique registry's books straight through
 * overwrite-and-release cycles; the planner draws each node's final value once
 * and every writer lands that same value, so what these sweeps pin now is the
 * surviving guarantee itself — one claim per node, no duplicates, whatever
 * order the writers run in.
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
    form: { title: 'About this person', fields: [] },
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
    form: {
      fields: [
        { variable: 'band', prompt: 'Band' },
        // A variable no stage writes is absent from the network, so the
        // echoed shape renders its sibling here to give it a writer.
        ...(shape.echoed
          ? [{ variable: 'bandEcho', prompt: 'Band echo' }]
          : []),
      ],
    },
  });
  const form = formStage('stage-form');
  // People the binning stage never saw, so the form is the first writer to
  // reach them.
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
            : order === 'formThenBin'
              ? [nameGenerator, form, bin]
              : [nameGenerator, bin];

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
  it('issues no duplicate for the reported two-person shape over 500 seeds', () => {
    const failures: string[] = [];

    for (let seed = 1; seed <= 500; seed++) {
      const bands = bandsForSeed(seed, 'OrdinalBin', 'binThenForm', REPORTED);
      if (new Set(bands.map(valueKey)).size !== bands.length) {
        failures.push(`seed ${seed}: bands ${JSON.stringify(bands)}`);
      }
    }

    expect(failures).toEqual([]);
  });

  it('issues no duplicate for an OrdinalBin over 500 seeds', () => {
    expect(sweep('OrdinalBin')).toEqual([]);
  });

  it('issues no duplicate for a CategoricalBin over 500 seeds', () => {
    expect(sweep('CategoricalBin')).toEqual([]);
  });

  it('issues no duplicate when a second form regenerates as well', () => {
    expect(sweep('OrdinalBin', 'binThenTwoForms')).toEqual([]);
  });

  it('issues no duplicate when people arrive after the bin', () => {
    expect(sweep('OrdinalBin', 'binThenMorePeopleThenForm')).toEqual([]);
  });

  it('issues no duplicate when a second bin overwrites the first', () => {
    expect(sweep('OrdinalBin', 'twoBinsThenForm')).toEqual([]);
  });

  it('issues no duplicate when the bin writes after the form', () => {
    // Both writers land the node's one planned value, so which of them runs
    // last no longer decides what the network keeps — the value is the same,
    // and it is distinct because the form's field makes `unique` enforceable.
    expect(sweep('OrdinalBin', 'formThenBin')).toEqual([]);
  });

  // A `sameAs` sibling shares the slot with band, so the pair claims one value
  // between them and the echoes must be as distinct as the bands.
  it('keeps a sameAs sibling as distinct as the variable it echoes', () => {
    const echoed: Shape = { ...SWEPT, echoed: true };
    const failures: string[] = [];

    for (let seed = 1; seed <= 500; seed++) {
      const { codebook, stages } = binAndFormProtocol(
        'OrdinalBin',
        'binThenMorePeopleThenForm',
        echoed,
      );
      const { network } = generateNetwork({ seed, codebook, stages });
      const pairs = network.nodes.map((node) => ({
        band: node[entityAttributesProperty].band ?? null,
        echo: node[entityAttributesProperty].bandEcho ?? null,
      }));
      const echoes: VariableValue[] = pairs.map(({ echo }) => echo);
      if (
        new Set(echoes.map(valueKey)).size !== echoes.length ||
        pairs.some(({ band, echo }) => valueKey(band) !== valueKey(echo))
      ) {
        failures.push(`seed ${seed}: ${JSON.stringify(pairs)}`);
      }
    }

    expect(failures).toEqual([]);
  });

  // The counterpart to the sweeps above: a bin assignment is not a form
  // submission, and where the bin is the variable's ONLY writer the interview
  // never validates it — OrdinalBin renders no form field for its prompt
  // variable — so `unique` is set aside and two people may share a band.
  it('still lets two people share a band where only the bin writes it', () => {
    let shared = 0;

    for (let seed = 1; seed <= 500; seed++) {
      const bands = bandsForSeed(seed, 'OrdinalBin', 'binOnly');
      if (new Set(bands.map(valueKey)).size < bands.length) shared += 1;
    }

    expect(shared).toBeGreaterThan(100);
  });
});
