import { describe, expect, it } from 'vitest';

import { createBaseProtocol } from '../../../utils/test-utils.ts';
import ProtocolSchemaV8 from '../schema.ts';

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

const withNodeSynthetic = (synthetic: unknown) => {
  const protocol = createBaseProtocol();
  (protocol.codebook.node.person as Loose).synthetic = synthetic;
  return protocol;
};

const withEdgeSynthetic = (synthetic: unknown) => {
  const protocol = createBaseProtocol();
  (protocol.codebook.edge.knows as Loose).synthetic = synthetic;
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
      expect(parse(withNodeSynthetic({ count })).success).toBe(true);
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
      expect(parse(withNodeSynthetic({ count })).success).toBe(false);
    });

    it('rejects unknown keys beside count', () => {
      const synthetic = {
        count: { distribution: 'poisson', mean: 3 },
        extra: true,
      };
      expect(parse(withNodeSynthetic(synthetic)).success).toBe(false);
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
      expect(parse(withEdgeSynthetic({ topology })).success).toBe(true);
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
      expect(parse(withEdgeSynthetic(synthetic)).success).toBe(false);
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
