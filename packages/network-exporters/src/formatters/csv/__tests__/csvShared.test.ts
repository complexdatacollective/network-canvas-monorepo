import { describe, expect, it } from 'vitest';

import { sanitizeCellValue } from '../csvShared';

describe('sanitizeCellValue', () => {
  describe('formula injection neutralization', () => {
    it.each([
      ['=', '=1+1'],
      ['+', '+1+2'],
      ['-', '-1+2'],
      ['@', '@SUM(A1:A2)'],
      ['tab', '\tleading-tab'],
    ])(
      'prefixes a leading single quote when the value starts with %s',
      (_label, value) => {
        expect(sanitizeCellValue(value)).toBe(`'${value}`);
      },
    );

    it('both prefixes and quotes a CR-leading value (CR is also a difficult char)', () => {
      expect(sanitizeCellValue('\rleading-cr')).toBe('"\'\rleading-cr"');
    });

    it('both prefixes and quotes a formula-leading value that also needs quoting', () => {
      expect(sanitizeCellValue('=a,b')).toBe('"\'=a,b"');
    });

    it('does not neutralize a formula char that is not at position 0', () => {
      expect(sanitizeCellValue('a=b+c')).toBe('a=b+c');
    });
  });

  describe('existing behavior is preserved', () => {
    it('leaves ordinary strings unchanged', () => {
      expect(sanitizeCellValue('Jane Doe')).toBe('Jane Doe');
    });

    it('leaves empty strings unchanged', () => {
      expect(sanitizeCellValue('')).toBe('');
    });

    it('wraps values containing difficult characters in double quotes', () => {
      expect(sanitizeCellValue('a,b')).toBe('"a,b"');
      expect(sanitizeCellValue('a\nb')).toBe('"a\nb"');
      expect(sanitizeCellValue('a\r\nb')).toBe('"a\r\nb"');
    });

    it('doubles internal double quotes', () => {
      expect(sanitizeCellValue('say "hi"')).toBe('"say ""hi"""');
    });

    it('passes through numbers, booleans, null and undefined unchanged', () => {
      expect(sanitizeCellValue(42)).toBe(42);
      expect(sanitizeCellValue(0)).toBe(0);
      expect(sanitizeCellValue(true)).toBe(true);
      expect(sanitizeCellValue(false)).toBe(false);
      expect(sanitizeCellValue(null)).toBeNull();
      expect(sanitizeCellValue(undefined)).toBeUndefined();
    });
  });
});
