import { describe, expect, it } from 'vitest';

import { MAX_SYNTHETIC_OPTION_WEIGHT } from '@codaco/protocol-validation';

import {
  admissibleSelectionCounts,
  asSyntheticVariableDraft,
  effectiveVariableRules,
  normaliseSynthetic,
  summariseResolvedSynthetic,
  syntheticIsAdmissible,
  variableValueWindow,
  type SyntheticVariableDraft,
} from '../draft';

/**
 * The reading and writing of a variable's synthetic block, held against the
 * REAL schema rather than a mock of it — the guard's whole claim is that the
 * schema decides, so a stubbed schema would test nothing.
 */

const categorical = (
  overrides: Partial<SyntheticVariableDraft> = {},
): SyntheticVariableDraft => ({
  name: 'hobbies',
  type: 'categorical',
  options: [
    { label: 'Sport', value: 'sport' },
    { label: 'Music', value: 'music' },
    { label: 'Reading', value: 'reading' },
  ],
  ...overrides,
});

describe('normalising an authored block', () => {
  it('removes a key nobody stated', () => {
    expect(
      normaliseSynthetic({
        missingProbability: 0.2,
        probabilityTrue: undefined,
      }),
    ).toEqual({ missingProbability: 0.2 });
  });

  it('reads a block that declares nothing as no block at all', () => {
    expect(normaliseSynthetic({ generator: undefined })).toBeUndefined();
    expect(normaliseSynthetic({})).toBeUndefined();
    expect(normaliseSynthetic(undefined)).toBeUndefined();
  });

  it('drops an emptied weights table rather than storing an empty one', () => {
    expect(normaliseSynthetic({ optionWeights: [] })).toBeUndefined();
  });

  it('drops an emptied selection table', () => {
    expect(
      normaliseSynthetic({ selectionCount: { probabilities: [] } }),
    ).toBeUndefined();
  });

  it('keeps a zero, which states something', () => {
    expect(normaliseSynthetic({ missingProbability: 0 })).toEqual({
      missingProbability: 0,
    });
  });
});

describe('what the schema will accept', () => {
  it('refuses a weights table that zeroes every option', () => {
    expect(
      syntheticIsAdmissible(categorical(), {
        optionWeights: [
          { value: 'sport', weight: 0 },
          { value: 'music', weight: 0 },
          { value: 'reading', weight: 0 },
        ],
      }),
    ).toBe(false);
  });

  it('accepts a table that leaves one option positive', () => {
    expect(
      syntheticIsAdmissible(categorical(), {
        optionWeights: [
          { value: 'sport', weight: 0 },
          { value: 'music', weight: 3 },
        ],
      }),
    ).toBe(true);
  });

  it('refuses a weight above the schema’s ceiling', () => {
    expect(
      syntheticIsAdmissible(categorical(), {
        optionWeights: [
          { value: 'sport', weight: MAX_SYNTHETIC_OPTION_WEIGHT + 1 },
        ],
      }),
    ).toBe(false);
  });

  it('refuses missingness where an interface-implied rule requires an answer', () => {
    expect(
      syntheticIsAdmissible(
        categorical(),
        { missingProbability: 0.3 },
        { required: true },
      ),
    ).toBe(false);
  });

  it('accepts the same missingness where no rule requires an answer', () => {
    expect(
      syntheticIsAdmissible(categorical(), { missingProbability: 0.3 }),
    ).toBe(true);
  });

  it('cannot blame the block for a draft that does not parse without one', () => {
    // A variable being created has no options yet; its refusal is its own.
    const incomplete: SyntheticVariableDraft = {
      name: 'hobbies',
      type: 'categorical',
    };
    expect(
      syntheticIsAdmissible(incomplete, {
        optionWeights: [{ value: 'sport', weight: 0 }],
      }),
    ).toBe(true);
  });

  it('always accepts removing the block', () => {
    expect(syntheticIsAdmissible(categorical(), undefined)).toBe(true);
  });
});

describe('how many options may be chosen', () => {
  it('offers every size the option list can fill', () => {
    expect(admissibleSelectionCounts(categorical(), {})).toEqual([0, 1, 2, 3]);
  });

  it('withholds zero from a variable that must be answered', () => {
    expect(
      admissibleSelectionCounts(categorical(), { required: true }),
    ).toEqual([1, 2, 3]);
  });

  it('leaves a bin-written categorical exactly one size', () => {
    expect(
      admissibleSelectionCounts(categorical(), {
        required: true,
        maxSelected: 1,
      }),
    ).toEqual([1]);
  });

  it('honours a declared floor as well as an implied ceiling', () => {
    expect(
      admissibleSelectionCounts(categorical(), { minSelected: 2 }),
    ).toEqual([0, 2, 3]);
  });

  it('excludes a size no option is left to fill', () => {
    // Two of the three options are weighted zero, so only one can be drawn.
    const weighted = categorical({
      synthetic: {
        optionWeights: [
          { value: 'music', weight: 0 },
          { value: 'reading', weight: 0 },
        ],
      },
    });
    expect(admissibleSelectionCounts(weighted, {})).toEqual([0, 1]);
  });

  it('offers nothing for a variable the schema cannot parse at all', () => {
    expect(
      admissibleSelectionCounts({ name: 'hobbies', type: 'categorical' }, {}),
    ).toEqual([]);
  });
});

describe('the rules a variable is actually held to', () => {
  it('narrows a declared rule with an implied one', () => {
    const variable: SyntheticVariableDraft = {
      name: 'age',
      type: 'number',
      validation: { minValue: 18 },
    };
    expect(effectiveVariableRules(variable, { required: true })).toEqual({
      minValue: 18,
      required: true,
    });
  });

  it('drops declared rules for a variable only a bin drop writes', () => {
    const variable: SyntheticVariableDraft = {
      name: 'hobbies',
      type: 'categorical',
      validation: { minSelected: 2 },
    };
    expect(effectiveVariableRules(variable, { maxSelected: 1 }, true)).toEqual({
      maxSelected: 1,
    });
  });
});

describe('the window a value falls in', () => {
  it('is the variable’s own validation range where it has one', () => {
    expect(
      variableValueWindow(
        { name: 'age', type: 'number' },
        {
          minValue: 18,
          maxValue: 80,
        },
      ),
    ).toEqual({ min: 18, max: 80 });
  });

  it('is open on a side no rule closes', () => {
    expect(
      variableValueWindow({ name: 'age', type: 'number' }, { minValue: 18 }),
    ).toEqual({ min: 18, max: Number.POSITIVE_INFINITY });
  });

  it('never widens a scalar past the scale it is recorded on', () => {
    expect(
      variableValueWindow(
        { name: 'closeness', type: 'scalar' },
        {
          minValue: -5,
          maxValue: 5,
        },
      ),
    ).toEqual({ min: 0, max: 1 });
  });
});

describe('the collapsed summary', () => {
  it('names the generator a text variable resolves to', () => {
    expect(
      summariseResolvedSynthetic(
        { type: 'text', generator: 'personName', missingProbability: 0 },
        { min: 0, max: 1 },
      ),
    ).toBe('Person names');
  });

  it('appends a missingness that is actually stated', () => {
    expect(
      summariseResolvedSynthetic(
        { type: 'boolean', probabilityTrue: 0.5, missingProbability: 0.25 },
        { min: 0, max: 1 },
      ),
    ).toBe('true 50%, missing 25%');
  });

  it('describes a number by its resolved distribution', () => {
    expect(
      summariseResolvedSynthetic(
        {
          type: 'number',
          distribution: 'normal',
          mean: 8,
          sd: 3,
          missingProbability: 0,
        },
        { min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY },
      ),
    ).toBe('normal(mean 8, sd 3)');
  });

  it('says a layout variable generates nothing', () => {
    expect(summariseResolvedSynthetic(undefined, { min: 0, max: 1 })).toBe(
      'No values are generated for this type.',
    );
  });
});

describe('reading a variable out of a form value', () => {
  it('accepts a record that names a real variable type', () => {
    expect(asSyntheticVariableDraft({ name: 'age', type: 'number' })).toEqual({
      name: 'age',
      type: 'number',
    });
  });

  it('skips anything that is not a variable', () => {
    expect(asSyntheticVariableDraft({ name: 'age' })).toBeUndefined();
    expect(
      asSyntheticVariableDraft({ name: 'age', type: 'nonsense' }),
    ).toBeUndefined();
    expect(asSyntheticVariableDraft('age')).toBeUndefined();
  });
});
