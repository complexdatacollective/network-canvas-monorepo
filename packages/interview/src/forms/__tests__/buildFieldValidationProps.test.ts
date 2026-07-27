import { describe, expect, it } from 'vitest';

import { VARIABLE_REFERENCE_VALIDATIONS } from '@codaco/protocol-validation';

import { buildFieldValidationProps } from '../buildFieldValidationProps';

describe('buildFieldValidationProps', () => {
  it('returns an empty object when the field has no validation', () => {
    expect(buildFieldValidationProps({ type: 'text', variable: 'v1' })).toEqual(
      {},
    );
  });

  it('maps the scalar rules straight through', () => {
    expect(
      buildFieldValidationProps({
        type: 'text',
        variable: 'v1',
        validation: { required: true, minLength: 2, maxLength: 8 },
      }),
    ).toEqual({ required: true, minLength: 2, maxLength: 8 });
  });

  it('maps unique to the field name, because the validator needs the attribute', () => {
    expect(
      buildFieldValidationProps({
        type: 'text',
        variable: 'v1',
        validation: { unique: true },
      }),
    ).toEqual({ unique: 'v1' });
  });

  it('wraps comparator rules with the field type', () => {
    expect(
      buildFieldValidationProps({
        type: 'number',
        variable: 'v2',
        validation: { greaterThanVariable: 'v1' },
      }),
    ).toEqual({ greaterThanVariable: { attribute: 'v1', type: 'number' } });
  });

  it('maps every variable-reference rule the schema declares', () => {
    const validation = Object.fromEntries(
      VARIABLE_REFERENCE_VALIDATIONS.map((rule) => [rule, 'v1']),
    );

    const props = buildFieldValidationProps({
      type: 'number',
      variable: 'v2',
      validation,
    });

    expect(Object.keys(props).toSorted()).toEqual(
      [...VARIABLE_REFERENCE_VALIDATIONS].toSorted(),
    );
  });

  it('throws, naming the variable and rule, on a non-numeric bound', () => {
    expect(() =>
      buildFieldValidationProps({
        type: 'text',
        variable: 'v1',
        validation: { minLength: '24' },
      }),
    ).toThrow(/"v1".*"minLength".*string.*a number is required/);
  });

  it('throws on a NaN bound', () => {
    expect(() =>
      buildFieldValidationProps({
        type: 'number',
        variable: 'v1',
        validation: { maxValue: Number.NaN },
      }),
    ).toThrow(/"maxValue"/);
  });

  it('throws on a non-boolean required', () => {
    expect(() =>
      buildFieldValidationProps({
        type: 'text',
        variable: 'v1',
        validation: { required: 'yes' },
      }),
    ).toThrow(/"required"/);
  });

  it('throws on a non-string variable reference', () => {
    expect(() =>
      buildFieldValidationProps({
        type: 'text',
        variable: 'v2',
        validation: { sameAs: 42 },
      }),
    ).toThrow(/"sameAs"/);
  });
});
