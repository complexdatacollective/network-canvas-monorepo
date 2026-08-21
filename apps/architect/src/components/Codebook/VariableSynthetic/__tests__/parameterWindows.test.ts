import { describe, expect, it } from 'vitest';

import {
  NumberSyntheticSchema,
  ScalarSyntheticSchema,
} from '@codaco/protocol-validation';
import {
  describeDistributions,
  type SyntheticParameter,
} from '~/components/Synthetic/schemaIntrospection';
import { seedParameterValue } from '~/components/Synthetic/useNumericDraft';

import { syntheticIsAdmissible, type SyntheticVariableDraft } from '../draft';
import { parameterWindow } from '../parameterWindows';

const OPEN = { min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY };

const parameterOf = (
  schema: unknown,
  family: string,
  key: string,
): SyntheticParameter => {
  const parameter = describeDistributions(schema)
    .find((spec) => spec.family === family)
    ?.parameters.find((candidate) => candidate.key === key);
  if (!parameter)
    throw new Error(`No ${family}.${key} parameter in the schema`);
  return parameter;
};

describe('where a parameter’s window meets the variable’s', () => {
  it('narrows a value parameter to the variable’s validation range', () => {
    expect(
      parameterWindow(parameterOf(NumberSyntheticSchema, 'constant', 'value'), {
        min: 18,
        max: 80,
      }),
    ).toEqual({
      min: 18,
      max: 80,
      exclusiveMin: false,
      exclusiveMax: false,
      integer: false,
    });
  });

  it('leaves a spread parameter to its own window', () => {
    // A standard deviation of 30 is not a value of the variable, so an age
    // validated 18–80 does not bound it.
    expect(
      parameterWindow(parameterOf(NumberSyntheticSchema, 'normal', 'sd'), {
        min: 18,
        max: 80,
      }),
    ).toEqual({
      min: 0,
      exclusiveMin: false,
      exclusiveMax: false,
      integer: false,
    });
  });

  it('keeps the tighter of the two bounds', () => {
    // A scalar's own domain is narrower than this validation range.
    expect(
      parameterWindow(parameterOf(ScalarSyntheticSchema, 'constant', 'value'), {
        min: -3,
        max: 7,
      }),
    ).toMatchObject({ min: 0, max: 1 });
  });

  it('keeps a strict bound strict when both sides name it', () => {
    expect(
      parameterWindow(parameterOf(ScalarSyntheticSchema, 'beta', 'mean'), {
        min: 0,
        max: 1,
      }),
    ).toMatchObject({ exclusiveMin: true, exclusiveMax: true });
  });

  it('leaves a window open where nothing closes it', () => {
    expect(
      parameterWindow(
        parameterOf(NumberSyntheticSchema, 'constant', 'value'),
        OPEN,
      ),
    ).toEqual({ exclusiveMin: false, exclusiveMax: false, integer: false });
  });
});

describe('the value a parameter arrives with', () => {
  it('starts a bounded parameter in the middle of its window', () => {
    expect(
      seedParameterValue({
        min: 18,
        max: 80,
        exclusiveMin: false,
        exclusiveMax: false,
        integer: false,
      }),
    ).toBe(49);
  });

  it('starts an unbounded parameter at zero', () => {
    expect(
      seedParameterValue({
        exclusiveMin: false,
        exclusiveMax: false,
        integer: false,
      }),
    ).toBe(0);
  });

  it('starts a floored parameter at its floor', () => {
    expect(
      seedParameterValue({
        min: 0,
        exclusiveMin: false,
        exclusiveMax: false,
        integer: false,
      }),
    ).toBe(0);
  });

  it('steps inside a floor the schema excludes', () => {
    expect(
      seedParameterValue({
        min: 0,
        exclusiveMin: true,
        exclusiveMax: false,
        integer: false,
      }),
    ).toBe(1);
  });
});

/**
 * The oracle that matters most for seeding: a family the researcher selects
 * has to arrive carrying parameters the SCHEMA accepts, or the select would
 * appear to do nothing. Every family of every distribution-carrying type is
 * checked against the real schema.
 */
describe('every family a researcher can choose arrives admissible', () => {
  const cases: {
    label: string;
    schema: unknown;
    variable: SyntheticVariableDraft;
    valueWindow: { min: number; max: number };
  }[] = [
    {
      label: 'an unbounded number',
      schema: NumberSyntheticSchema,
      variable: { name: 'age', type: 'number' },
      valueWindow: OPEN,
    },
    {
      label: 'a number validated 18 to 80',
      schema: NumberSyntheticSchema,
      variable: {
        name: 'age',
        type: 'number',
        validation: { minValue: 18, maxValue: 80 },
      },
      valueWindow: { min: 18, max: 80 },
    },
    {
      label: 'a scalar',
      schema: ScalarSyntheticSchema,
      variable: { name: 'closeness', type: 'scalar' },
      valueWindow: { min: 0, max: 1 },
    },
  ];

  for (const { label, schema, variable, valueWindow } of cases) {
    for (const spec of describeDistributions(schema)) {
      it(`seeds ${spec.family} for ${label}`, () => {
        const proposal: Record<string, unknown> = {
          distribution: spec.family,
        };
        for (const parameter of spec.parameters) {
          if (parameter.optional) continue;
          proposal[parameter.key] = seedParameterValue(
            parameterWindow(parameter, valueWindow),
          );
        }
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        expect(syntheticIsAdmissible(variable, proposal as never)).toBe(true);
      });
    }
  }
});
