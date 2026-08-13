import { describe, expect, it } from 'vitest';

import {
  extractCustomAttributes,
  runFamilyPedigreeTransform,
} from '../personAttributes';

describe('extractCustomAttributes', () => {
  it('validates custom values while preserving defined empty values', () => {
    expect(
      extractCustomAttributes({
        name: 'Person',
        biologicalSex: 'female',
        emptyText: '',
        emptySelection: [],
      }),
    ).toEqual({ emptyText: '', emptySelection: [] });
  });

  it('rejects the complete custom attribute record when a defined value is invalid', () => {
    expect(() =>
      extractCustomAttributes({
        valid: 'answer',
        invalid: { nested: true },
      }),
    ).toThrow('Invalid custom attribute value for "invalid".');
  });

  it('converts invalid custom attributes to a failed form submission result', () => {
    expect(
      runFamilyPedigreeTransform(() =>
        extractCustomAttributes({ invalid: { nested: true } }),
      ),
    ).toEqual({
      success: false,
      formErrors: ['An error occurred while submitting the form.'],
    });
  });

  it('omits undefined custom values', () => {
    expect(
      extractCustomAttributes({ defined: false, cleared: undefined }),
    ).toEqual({ defined: false });
  });
});
