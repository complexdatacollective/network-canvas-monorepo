import { describe, expect, it } from 'vitest';

import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import { makeValidationFunction } from '@codaco/fresco-ui/form/validation/helpers';

import { type ArchitectValidation, splitValidation } from '../toZodValidation';

type FormValues = Record<string, FieldValue>;

/**
 * Runs a config's custom-routed rules and returns their messages, so exact
 * Architect copy can be asserted.
 */
async function runCustom(
  validation: ArchitectValidation,
  value: unknown,
  {
    fieldName = 'field',
    formValues = {},
  }: {
    fieldName?: string;
    formValues?: FormValues;
  } = {},
): Promise<string[]> {
  const { custom } = splitValidation(validation, fieldName);
  if (!custom) {
    throw new Error('expected the config to produce a custom validation');
  }

  const schema =
    typeof custom.schema === 'function'
      ? await custom.schema(formValues)
      : custom.schema;

  const result = await schema.safeParseAsync(value);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.message);
}

/**
 * Runs the WHOLE adapted config through fresco-ui's own field validation
 * pipeline — the same composition `useField` performs — so natively-mapped
 * rules are exercised by fresco-ui's implementation rather than re-asserted
 * here. Returns whether the value failed, not fresco-ui's message text.
 */
async function isRejected(
  validation: ArchitectValidation,
  value: unknown,
  {
    fieldName = 'field',
    formValues = {},
  }: {
    fieldName?: string;
    formValues?: FormValues;
  } = {},
): Promise<boolean> {
  const { nativeProps, custom } = splitValidation(validation, fieldName);
  const props: Record<string, unknown> = { ...nativeProps };
  if (custom) {
    props.custom = custom;
  }

  const schema = makeValidationFunction(props)(formValues);
  const result = await schema.safeParseAsync(value);
  return !result.success;
}

describe('splitValidation — native mapping', () => {
  it('maps required onto fresco-ui required', () => {
    expect(splitValidation({ required: true }, 'f')).toEqual({
      nativeProps: { required: 'Required' },
    });
  });

  it('carries an author-supplied required message onto the native prop', () => {
    expect(
      splitValidation({ required: 'Pick a colour' }, 'f').nativeProps,
    ).toEqual({ required: 'Pick a colour' });

    expect(
      splitValidation(
        { required: { value: true, message: 'Pick a colour' } },
        'f',
      ).nativeProps,
    ).toEqual({ required: 'Pick a colour' });
  });

  it('drops a disabled required rule entirely', () => {
    expect(splitValidation({ required: false }, 'f')).toEqual({
      nativeProps: {},
    });
  });

  it('maps requiredAcceptsZero onto required, keeping zero a valid answer', async () => {
    expect(
      splitValidation({ requiredAcceptsZero: true }, 'f').nativeProps,
    ).toEqual({ required: 'Required' });

    await expect(isRejected({ requiredAcceptsZero: true }, 0)).resolves.toBe(
      false,
    );
    await expect(
      isRejected({ requiredAcceptsZero: true }, undefined),
    ).resolves.toBe(true);
  });

  it('maps the numeric bounds straight across', () => {
    expect(
      splitValidation(
        {
          minLength: 2,
          maxLength: 10,
          minValue: 1,
          maxValue: 9,
          maxSelected: 3,
        },
        'f',
      ).nativeProps,
    ).toEqual({
      minLength: 2,
      maxLength: 10,
      minValue: 1,
      maxValue: 9,
      maxSelected: 3,
    });
  });

  it('pairs minSelected with required, because fresco-ui minSelected ignores an empty selection', async () => {
    expect(splitValidation({ minSelected: 1 }, 'f').nativeProps).toEqual({
      minSelected: 1,
      required: 'Required',
    });

    // Architect's minSelected rejected an empty/absent selection; the pairing
    // keeps that coverage.
    await expect(isRejected({ minSelected: 1 }, [])).resolves.toBe(true);
    await expect(isRejected({ minSelected: 1 }, undefined)).resolves.toBe(true);
    await expect(isRejected({ minSelected: 1 }, ['a'])).resolves.toBe(false);
    await expect(isRejected({ minSelected: 2 }, ['a'])).resolves.toBe(true);
  });

  it('does not synthesize required when the config states it, wherever it appears', () => {
    expect(
      splitValidation({ minSelected: 2, required: false }, 'f').nativeProps,
    ).toEqual({ minSelected: 2 });
  });

  it('maps positiveNumber onto minValue: 0', async () => {
    expect(splitValidation({ positiveNumber: true }, 'f').nativeProps).toEqual({
      minValue: 0,
    });

    await expect(isRejected({ positiveNumber: true }, -1)).resolves.toBe(true);
    await expect(isRejected({ positiveNumber: true }, 0)).resolves.toBe(false);
    await expect(isRejected({ positiveNumber: true }, 5)).resolves.toBe(false);
  });

  it('maps allowedVariableName onto pattern, preserving the exact message', async () => {
    const { nativeProps } = splitValidation(
      { allowedVariableName: 'option value' },
      'f',
    );

    expect(nativeProps.pattern).toEqual({
      regex: '^[a-zA-Z0-9._\\-:]+$',
      errorMessage:
        'Not a valid option value. Only letters, numbers and the symbols ._-: are supported',
      hint: 'Use only letters, numbers and the symbols ._-:',
    });

    await expect(
      isRejected({ allowedVariableName: 'option value' }, 'has spaces'),
    ).resolves.toBe(true);
    await expect(
      isRejected({ allowedVariableName: 'option value' }, 'a_valid-value.1'),
    ).resolves.toBe(false);
  });

  it('defaults the pattern subject name when allowedNMToken is passed a flag', () => {
    // `allowedNMToken: true` previously interpolated `true` into the message.
    expect(
      splitValidation({ allowedNMToken: true }, 'f').nativeProps.pattern
        ?.errorMessage,
    ).toBe(
      'Not a valid variable name. Only letters, numbers and the symbols ._-: are supported',
    );
  });

  it('routes a numeric bound with an author message through custom so the message survives', async () => {
    const validation = { maxValue: { value: 5, message: 'At most five' } };
    expect(splitValidation(validation, 'f').nativeProps).toEqual({});
    await expect(runCustom(validation, 9)).resolves.toEqual(['At most five']);
  });

  it('routes a rule whose parameter is a function through custom', async () => {
    const validation = {
      minValue: (value: unknown) =>
        typeof value === 'number' && value >= 1
          ? undefined
          : 'Must be at least 1',
    };

    expect(splitValidation(validation, 'f').nativeProps).toEqual({});
    await expect(runCustom(validation, 0)).resolves.toEqual([
      'Must be at least 1',
    ]);
  });

  it('routes the loser through custom when two rules claim the same native prop', async () => {
    const validation = { positiveNumber: true, minValue: 3 };
    expect(splitValidation(validation, 'f').nativeProps).toEqual({
      minValue: 0,
    });
    await expect(runCustom(validation, 1)).resolves.toEqual([
      'Must be at least 3',
    ]);
  });

  it('produces no custom entry when every rule maps natively', () => {
    expect(splitValidation({ required: true, maxLength: 3 }, 'f').custom).toBe(
      undefined,
    );
  });

  it('produces nothing at all for an empty config', () => {
    expect(splitValidation({}, 'f')).toEqual({ nativeProps: {} });
  });
});

describe('splitValidation — custom-routed Architect rules', () => {
  it('uniqueByList', async () => {
    const validation = { uniqueByList: ['Person', 'Place'] };
    await expect(runCustom(validation, 'person')).resolves.toEqual([
      '"person" is already in use',
    ]);
    await expect(runCustom(validation, 'Thing')).resolves.toEqual([]);
  });

  it('ISODate', async () => {
    const validation = { ISODate: 'YYYY-MM-DD' };
    await expect(runCustom(validation, '2020-13-45')).resolves.toEqual([
      'Date is not valid (YYYY-MM-DD)',
    ]);
    await expect(runCustom(validation, '2020-06-15')).resolves.toEqual([]);
  });

  it('minDate', async () => {
    const validation = {
      minDate: {
        value: '0001-01-01',
        message: 'Anchor date must use a year of 0001 or later',
      },
    };
    await expect(runCustom(validation, '0000-06-15')).resolves.toEqual([
      'Anchor date must use a year of 0001 or later',
    ]);
    await expect(runCustom(validation, '2020-06-15')).resolves.toEqual([]);
  });

  it('validRegExp', async () => {
    const validation = { validRegExp: true };
    await expect(runCustom(validation, '[unclosed')).resolves.toEqual([
      'Not a valid regular expression.',
    ]);
    await expect(runCustom(validation, '^a+$')).resolves.toEqual([]);
  });

  it('requiredAcceptsNull, which deliberately accepts null', async () => {
    const validation = { requiredAcceptsNull: true };
    await expect(runCustom(validation, null)).resolves.toEqual([]);
    await expect(runCustom(validation, undefined)).resolves.toEqual([
      'Required',
    ]);
  });

  it('greaterThan, reading the comparison field from the reassembled form values', async () => {
    const validation = {
      greaterThan: {
        value: 'parameters.min',
        message: 'End must be after start',
      },
    };
    const formValues = { parameters: { min: 5, max: 3 } };

    await expect(
      runCustom(validation, 3, { fieldName: 'parameters.max', formValues }),
    ).resolves.toEqual(['End must be after start']);
    await expect(
      runCustom(validation, 9, { fieldName: 'parameters.max', formValues }),
    ).resolves.toEqual([]);
  });

  it('greaterThanOrEqualTo permits equality', async () => {
    const validation = {
      greaterThanOrEqualTo: {
        value: 'parameters.min',
        message: 'End date must not be before start date',
      },
    };
    const formValues = { parameters: { min: '2020-06-15' } };

    await expect(
      runCustom(validation, '2020-06-15', { formValues }),
    ).resolves.toEqual([]);
    await expect(
      runCustom(validation, '2020-06-14', { formValues }),
    ).resolves.toEqual(['End date must not be before start date']);
  });

  it('bare validator functions, whatever the key is named', async () => {
    const notEmpty = (value: unknown) =>
      Array.isArray(value) && value.length > 0
        ? undefined
        : 'You must create at least one prompt';

    await expect(runCustom({ notEmpty }, [])).resolves.toEqual([
      'You must create at least one prompt',
    ]);
    await expect(runCustom({ notEmpty }, ['a'])).resolves.toEqual([]);
  });

  it('an unknown rule name, keeping the developer-facing message', async () => {
    await expect(runCustom({ notARule: true }, 'x')).resolves.toEqual([
      'Validation "notARule" not found',
    ]);
  });

  it('reports only the first failing rule', async () => {
    const validation = {
      validRegExp: true,
      uniqueByList: ['[unclosed'],
    };

    await expect(runCustom(validation, '[unclosed')).resolves.toEqual([
      'Not a valid regular expression.',
    ]);
  });
});

describe('uniqueArrayAttribute', () => {
  const validation = { uniqueArrayAttribute: true };

  // fresco-ui's getFormValues() reassembles bracket paths into real arrays,
  // which is exactly the shape uniqueArrayAttribute needs: it parses its
  // resolved field name for `<array>[n].<attribute>` and then reads
  // `allValues[<array>]`.
  const formValues = {
    options: [
      { label: 'Apple', value: 'apple' },
      { label: 'Banana', value: 'banana' },
      { label: 'Apple', value: 'apple_2' },
    ],
  };

  it('flags a duplicate against the reassembled array using the resolved bracket name', async () => {
    await expect(
      runCustom(validation, 'Apple', {
        fieldName: 'options[0].label',
        formValues,
      }),
    ).resolves.toEqual(['Labels must be unique']);
  });

  it('flags the other duplicate row too', async () => {
    await expect(
      runCustom(validation, 'Apple', {
        fieldName: 'options[2].label',
        formValues,
      }),
    ).resolves.toEqual(['Labels must be unique']);
  });

  it('passes a unique value in the same array', async () => {
    await expect(
      runCustom(validation, 'Banana', {
        fieldName: 'options[1].label',
        formValues,
      }),
    ).resolves.toEqual([]);
  });

  it('compares the named attribute only', async () => {
    await expect(
      runCustom(validation, 'apple', {
        fieldName: 'options[0].value',
        formValues,
      }),
    ).resolves.toEqual([]);
  });

  it('is case-insensitive for strings, as Architect always was', async () => {
    await expect(
      runCustom(validation, 'APPLE', {
        fieldName: 'options[3].label',
        formValues: {
          options: [...formValues.options, { label: 'APPLE', value: 'x' }],
        },
      }),
    ).resolves.toEqual(['Labels must be unique']);
  });

  it('no-ops for a field name without a bracket path', async () => {
    await expect(
      runCustom(validation, 'Apple', { fieldName: 'label', formValues }),
    ).resolves.toEqual([]);
  });

  it('reaches an array nested under another bracket path', async () => {
    await expect(
      runCustom(validation, 'Same', {
        fieldName: 'prompts[0].items[1].name',
        formValues: {
          prompts: [{ items: [{ name: 'Same' }, { name: 'Same' }] }],
        },
      }),
    ).resolves.toEqual(['Names must be unique']);
  });
});
