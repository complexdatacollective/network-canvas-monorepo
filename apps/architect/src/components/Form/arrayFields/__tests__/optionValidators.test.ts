import { describe, expect, it } from 'vitest';

import { createAppIntl } from '@codaco/app-i18n/messages';
import { getValidations } from '~/utils/validations';

import { parseOptionValue } from '../Option';
import {
  allowedOptionValues,
  completeOptions,
  minimumOptionsMessage,
  minTwoOptions,
  minTwoPopulatedOptions,
  optionsValidation,
  uniqueOptionLabels,
  uniqueOptionValues,
} from '../Options';

const MINIMUM_OPTIONS_MESSAGE = createAppIntl({ locale: 'en' }).formatMessage(
  minimumOptionsMessage,
);
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

  it('leaves empty lists to native required before checking for a second option', () => {
    expect(minTwoPopulatedOptions(undefined)).toBeUndefined();
    expect(minTwoPopulatedOptions([])).toBeUndefined();
    expect(minTwoPopulatedOptions([{ label: 'One', value: 1 }])).toBe(
      MINIMUM_OPTIONS_MESSAGE,
    );
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
    ).toBe('This value is already in use. Enter a different value.');
    expect(
      validateUnique?.(
        'One',
        { options: [{ value: 'One' }, { value: 'one' }] },
        undefined,
        'options[0].value',
      ),
    ).toBe('This value is already in use. Enter a different value.');
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
    // `1` and `"1"` are stored differently but exported as the same text, so
    // the column `attribute_1` would be written twice.
    expect(
      uniqueOptionValues([
        { label: 'One', value: 1 },
        { label: 'Two', value: '1' },
      ]),
    ).toMatch(/unique value/i);
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

  // Issue #1383. `Café` written with the precomposed U+00E9 and `Café`
  // written as `e` + U+0301 are the same text: they render identically, so
  // they reach the participant as two choices nothing tells apart.
  describe('canonically equivalent labels and values', () => {
    const precomposed = 'Café';
    const decomposed = 'Cafe\u0301';

    it('are different strings that read identically', () => {
      expect(precomposed).not.toBe(decomposed);
      expect(precomposed.normalize('NFC')).toBe(decomposed.normalize('NFC'));
    });

    it('are rejected as duplicate labels', () => {
      expect(
        uniqueOptionLabels([
          { label: precomposed, value: 'cafe_a' },
          { label: decomposed, value: 'cafe_b' },
        ]),
      ).toMatch(/unique label/i);
    });

    it('are rejected as duplicate labels across case as well', () => {
      expect(
        uniqueOptionLabels([
          { label: precomposed, value: 'cafe_a' },
          { label: decomposed.toUpperCase(), value: 'cafe_b' },
        ]),
      ).toMatch(/unique label/i);
    });

    it('are rejected as duplicate values', () => {
      expect(
        uniqueOptionValues([
          { label: 'One', value: precomposed },
          { label: 'Two', value: decomposed },
        ]),
      ).toMatch(/unique value/i);
    });

    it('are rejected by the row-level rule too, so rows and array agree', () => {
      const [validateUnique] = getValidations({ uniqueArrayAttribute: true });
      expect(
        validateUnique?.(
          decomposed,
          { options: [{ label: precomposed }, { label: decomposed }] },
          undefined,
          'options[1].label',
        ),
      ).toBe('This value is already in use. Enter a different value.');
    });

    it('are stored in canonical composed form', () => {
      expect(parseOptionValue(decomposed)).toBe(precomposed);
    });

    // NFC, not NFKC: compatibility folding would rewrite text the researcher
    // deliberately typed into something else.
    it('leaves compatibility characters alone', () => {
      expect(parseOptionValue('ﬁve')).toBe('ﬁve');
      expect(
        uniqueOptionLabels([
          { label: 'ﬁve', value: 'a' },
          { label: 'five', value: 'b' },
        ]),
      ).toBeUndefined();
    });
  });

  // The rows show the same message through `codebookName`, but a row is not a
  // registered field — and collapsing it hides the message entirely while
  // keeping the value, which then becomes part of an export column header. Only
  // the array can refuse the save.
  it('accepts option values in any script, with spaces and punctuation', () => {
    expect(
      allowedOptionValues([
        { label: 'Close friend', value: 'amigo cercano' },
        { label: 'Colleague', value: 'Collègue' },
        { label: 'Friend', value: '友人' },
        { label: 'Percent', value: '100%' },
        { label: 'Slash', value: 'yes/no (maybe)' },
      ]),
    ).toBeUndefined();
    // `parseOptionValue` stores numeric-looking input as a number, so the rule
    // has to test the stringified value rather than the raw one.
    expect(
      allowedOptionValues([
        { label: 'One', value: 1 },
        { label: 'Minus one', value: -1 },
        { label: 'Point five', value: '1.5' },
        { label: 'Yes', value: true },
      ]),
    ).toBeUndefined();
  });

  it('rejects option values with control characters at the array level', () => {
    const message =
      'This can’t contain tabs, line breaks or other control characters';
    expect(
      allowedOptionValues([
        { label: 'Has a tab', value: 'bad\tvalue' },
        { label: 'Fine', value: 'fine' },
      ]),
    ).toBe(message);
    expect(
      allowedOptionValues([
        { label: 'Fine', value: 'fine' },
        { label: 'Has a line break', value: 'two\nlines' },
      ]),
    ).toBe(message);
    // Empty values are `completeOptions`' business — flagging them here would
    // raise a syntax error against a row that is merely unfinished.
    expect(
      allowedOptionValues([{ label: 'One' }, { label: 'Two', value: '' }]),
    ).toBeUndefined();
    expect(
      allowedOptionValues([{ label: 'One' }, { label: 'Two', value: '   ' }]),
    ).toBeUndefined();
    expect(allowedOptionValues(undefined)).toBeUndefined();
    expect(allowedOptionValues([])).toBeUndefined();
  });

  it('bundles every array-level rule so a call site cannot keep only some', () => {
    const rules = optionsValidation();
    expect(rules.required).toBe(MINIMUM_OPTIONS_MESSAGE);
    expect(rules.minTwoOptions([{ label: 'One', value: 1 }])).toBe(
      MINIMUM_OPTIONS_MESSAGE,
    );
    expect(rules.completeOptions([{ label: 'One' }])).toBe(
      'Every option needs both a label and a value.',
    );
    expect(
      rules.uniqueOptionValues([
        { label: 'One', value: 1 },
        { label: 'Two', value: 1 },
      ]),
    ).toBe('Every option needs a unique value.');
    expect(
      rules.uniqueOptionLabels([
        { label: 'One', value: 1 },
        { label: 'One', value: 2 },
      ]),
    ).toBe('Every option needs a unique label.');
    expect(
      rules.allowedOptionValues([{ label: 'One', value: 'bad\tvalue' }]),
    ).toBe('This can’t contain tabs, line breaks or other control characters');
    expect(
      rules.allowedOptionValues([{ label: 'One', value: 'not valid' }]),
    ).toBeUndefined();
  });

  // Only the first failing rule is reported per field (see toZodValidation).
  // An unfinished row must explain the missing value before its syntax.
  it('reports completeness before syntax when a row is both', () => {
    const rows = [
      { label: '', value: 'bad\tvalue' },
      { label: 'Two', value: 2 },
    ];
    const firstError = getValidations(optionsValidation())
      .map((validate) => validate(rows))
      .find((error) => error !== undefined);
    expect(firstError).toBe('Every option needs both a label and a value.');
  });

  it('compares option values as the text they are exported as, in the rows and in the array', () => {
    const [validateUnique] = getValidations({ uniqueArrayName: true });
    const message = 'This value is already in use. Enter a different value.';
    expect(
      validateUnique?.(
        1,
        { options: [{ value: 1 }, { value: '1' }] },
        undefined,
        'options[0].value',
      ),
    ).toBe(message);
    expect(
      validateUnique?.(
        'Amigo cercano',
        { options: [{ value: 'amigo cercano' }, { value: 'Amigo cercano' }] },
        undefined,
        'options[1].value',
      ),
    ).toBe(message);
    expect(
      validateUnique?.(
        '友人',
        { options: [{ value: '友人' }, { value: '同僚' }] },
        undefined,
        'options[0].value',
      ),
    ).toBeUndefined();
  });

  describe('export column conflicts', () => {
    const intl = createAppIntl({ locale: 'en' });
    const conflicts = (
      siblings: { name: string; type: string; options?: { value: string }[] }[],
      allValues: Record<string, unknown>,
      options: { label: string; value: string | number }[],
      entity: 'node' | 'ego' = 'node',
    ) =>
      optionsValidation(intl, { entity, siblings }).exportColumnConflicts(
        options,
        allValues,
      );

    it('refuses an option whose column is another attribute’s name', () => {
      expect(
        conflicts(
          [{ name: 'foo_bar', type: 'text' }],
          { name: 'foo', type: 'categorical' },
          [
            { label: 'Bar', value: 'bar' },
            { label: 'Baz', value: 'baz' },
          ],
        ),
      ).toMatch(/The option “bar” would be exported to the column “foo_bar”/);
    });

    it('refuses an option whose column is another categorical attribute’s option column', () => {
      expect(
        conflicts(
          [
            {
              name: 'foo_bar',
              type: 'categorical',
              options: [{ value: 'baz' }, { value: 'qux' }],
            },
          ],
          { name: 'foo', type: 'categorical' },
          [
            { label: 'One', value: 'bar_baz' },
            { label: 'Two', value: 'other' },
          ],
        ),
      ).toMatch(
        /The option “bar_baz” would be exported to the column “foo_bar_baz”, which the option “baz” of the attribute “foo_bar”/,
      );
    });

    it('refuses an option whose column is a layout attribute’s coordinate column', () => {
      expect(
        conflicts(
          [{ name: 'a_b', type: 'layout' }],
          { name: 'a', type: 'categorical' },
          [
            { label: 'One', value: 'b_x' },
            { label: 'Two', value: 'other' },
          ],
        ),
      ).toMatch(/the layout attribute “a_b” already uses for its position/);
    });

    it('refuses an option whose column is a built-in column', () => {
      expect(
        conflicts(
          [],
          { name: 'app', type: 'categorical' },
          [
            { label: 'Version', value: 'version' },
            { label: 'Other', value: 'other' },
          ],
          'ego',
        ),
      ).toBe(
        'The option “version” would be exported to a column named “app_version”, which is a built-in column in exported data. Change the option’s value or the attribute’s name.',
      );
      expect(
        conflicts(
          [],
          { name: 'app', type: 'categorical' },
          [
            { label: 'Version', value: 'version' },
            { label: 'Other', value: 'other' },
          ],
          'node',
        ),
      ).toBeUndefined();
    });

    it('waits for a name before judging the options', () => {
      expect(
        conflicts(
          [{ name: '_a', type: 'text' }],
          { name: '  ', type: 'categorical' },
          [
            { label: 'One', value: 'a' },
            { label: 'Two', value: 'b' },
          ],
        ),
      ).toBeUndefined();
    });

    it('reads a number option as the text it is exported as', () => {
      expect(
        conflicts(
          [{ name: 'foo_1', type: 'text' }],
          { name: 'foo', type: 'categorical' },
          [
            { label: 'One', value: 1 },
            { label: 'Two', value: 2 },
          ],
        ),
      ).toMatch(/The option “1” would be exported/);
    });

    it('stays quiet about the attribute’s own columns, which the name field reports', () => {
      expect(
        conflicts(
          [{ name: 'foo_x', type: 'text' }],
          { name: 'foo', type: 'layout' },
          [
            { label: 'One', value: 'a' },
            { label: 'Two', value: 'b' },
          ],
        ),
      ).toBeUndefined();
    });

    it('passes when no export context was given', () => {
      expect(
        optionsValidation(intl).exportColumnConflicts(
          [{ label: 'Bar', value: 'bar' }],
          { name: 'foo', type: 'categorical' },
        ),
      ).toBeUndefined();
    });
  });
});
