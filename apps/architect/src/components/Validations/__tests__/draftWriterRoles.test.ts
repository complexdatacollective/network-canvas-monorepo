import { describe, expect, it } from 'vitest';

import {
  draftAdditionalAttributeVariableIds,
  draftFormFieldVariableIds,
} from '../draftWriterRoles';

describe('draft writer roles', () => {
  it('collects variables from live form fields', () => {
    expect(
      draftFormFieldVariableIds([
        { variable: 'validated' },
        { variable: null },
        { prompt: 'Not assigned' },
      ]),
    ).toEqual(new Set(['validated']));
  });

  it('collects additional-attribute variables across live prompt drafts', () => {
    expect(
      draftAdditionalAttributeVariableIds([
        {
          additionalAttributes: [
            { variable: 'first', value: true },
            { variable: null },
          ],
        },
        { additionalAttributes: [{ variable: 'second', value: false }] },
        { text: 'No assignments' },
      ]),
    ).toEqual(new Set(['first', 'second']));
  });

  it('returns empty sets for incomplete draft values', () => {
    expect(draftFormFieldVariableIds(undefined)).toEqual(new Set());
    expect(draftAdditionalAttributeVariableIds(null)).toEqual(new Set());
  });
});
