import { describe, expect, it } from 'vitest';

import { getValidations } from '~/utils/validations';

import { parseOptionValue } from '../Option';
import { completeOptions, minTwoOptions } from '../Options';

describe('Options validators', () => {
  it('requires at least two options', () => {
    expect(minTwoOptions(undefined)).toMatch(/minimum of two options/i);
    expect(minTwoOptions([])).toMatch(/minimum of two options/i);
    expect(minTwoOptions([{ label: 'One', value: 1 }])).toMatch(
      /minimum of two options/i,
    );
    expect(
      minTwoOptions([
        { label: 'One', value: 1 },
        { label: 'Two', value: 2 },
      ]),
    ).toBeUndefined();
  });

  it('requires every option to have a label and a value', () => {
    expect(
      completeOptions([
        { label: 'One', value: 1 },
        { label: 'Two', value: 2 },
      ]),
    ).toBeUndefined();
    expect(completeOptions([{ label: 'Zero', value: 0 }])).toBeUndefined();
    expect(completeOptions(undefined)).toBeUndefined();

    expect(completeOptions([{}])).toMatch(/label and a value/i);
    expect(completeOptions([{ label: 'One' }])).toMatch(/label and a value/i);
    expect(completeOptions([{ value: 1 }])).toMatch(/label and a value/i);
    expect(completeOptions([{ label: '  ', value: 1 }])).toMatch(
      /label and a value/i,
    );
    expect(completeOptions([{ label: 'One', value: '' }])).toMatch(
      /label and a value/i,
    );
  });

  it('normalizes integer-like input without collapsing other strings', () => {
    expect(parseOptionValue('1')).toBe(1);
    expect(parseOptionValue('-2')).toBe(-2);
    expect(parseOptionValue('01')).toBe('01');
    expect(parseOptionValue('1.5')).toBe('1.5');
    expect(parseOptionValue('one')).toBe('one');
  });

  it('validates unique values across string and number option values', () => {
    const [validateUnique] = getValidations({
      uniqueArrayAttribute: true,
    });
    expect(validateUnique).toBeDefined();

    expect(
      validateUnique?.(
        1,
        { options: [{ value: 1 }, { value: 1 }] },
        undefined,
        'options[0].value',
      ),
    ).toBe('Values must be unique');
    expect(
      validateUnique?.(
        'One',
        { options: [{ value: 'One' }, { value: 'one' }] },
        undefined,
        'options[0].value',
      ),
    ).toBe('Values must be unique');
    expect(
      validateUnique?.(
        1,
        { options: [{ value: 1 }, { value: '1' }] },
        undefined,
        'options[0].value',
      ),
    ).toBeUndefined();
  });
});
