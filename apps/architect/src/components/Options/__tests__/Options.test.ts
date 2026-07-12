import { describe, expect, it } from 'vitest';

import { getValidations } from '~/utils/validations';

import { parseOptionValue } from '../Option';
import { minTwoOptions } from '../Options';

describe('Options', () => {
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
