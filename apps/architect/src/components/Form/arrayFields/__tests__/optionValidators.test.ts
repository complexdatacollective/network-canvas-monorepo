import { describe, expect, it } from 'vitest';

import { getValidations } from '~/utils/validations';

import { parseOptionValue } from '../Option';
import {
  completeOptions,
  minTwoOptions,
  optionsValidation,
  uniqueOptionLabels,
  uniqueOptionValues,
} from '../Options';

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

  // The rows already run `uniqueArrayAttribute`, but a row is not a
  // registered field — its error is display-only. Without an equivalent
  // whole-array rule the owning form stays valid and the duplicate saves.
  it('rejects duplicate option values at the array level', () => {
    expect(
      uniqueOptionValues([
        { label: 'One', value: 'a' },
        { label: 'Two', value: 'b' },
      ]),
    ).toBeUndefined();
    expect(
      uniqueOptionValues([
        { label: 'One', value: 'a' },
        { label: 'Two', value: 'a' },
      ]),
    ).toMatch(/unique value/i);
    // Matches `uniqueArrayAttribute`'s case-insensitive string comparison, so
    // the array and its rows never disagree about which entries clash.
    expect(
      uniqueOptionValues([
        { label: 'One', value: 'One' },
        { label: 'Two', value: 'one' },
      ]),
    ).toMatch(/unique value/i);
    expect(
      uniqueOptionValues([
        { label: 'One', value: 1 },
        { label: 'Two', value: '1' },
      ]),
    ).toBeUndefined();
    // Empty values are `completeOptions`' business.
    expect(
      uniqueOptionValues([{ label: 'One' }, { label: 'Two', value: '' }]),
    ).toBeUndefined();
    expect(uniqueOptionValues(undefined)).toBeUndefined();
  });

  it('rejects duplicate option labels at the array level', () => {
    expect(
      uniqueOptionLabels([
        { label: 'One', value: 'a' },
        { label: 'Two', value: 'b' },
      ]),
    ).toBeUndefined();
    expect(
      uniqueOptionLabels([
        { label: 'One', value: 'a' },
        { label: 'one', value: 'b' },
      ]),
    ).toMatch(/unique label/i);
    expect(
      uniqueOptionLabels([{ value: 'a' }, { label: '  ', value: 'b' }]),
    ).toBeUndefined();
  });

  it('bundles every array-level rule so a call site cannot keep only some', () => {
    expect(optionsValidation).toEqual({
      minTwoOptions,
      completeOptions,
      uniqueOptionValues,
      uniqueOptionLabels,
    });
  });
});
