import { describe, expect, it } from 'vitest';

import { buildVariableLabels } from '../buildVariableLabels';

describe('buildVariableLabels', () => {
  it('names a variable with the prompt the researcher authored for it', () => {
    expect(
      buildVariableLabels([
        { variable: 'age', prompt: 'How old are they?' },
        { variable: 'closeness', label: 'How close are you?' },
      ]),
    ).toEqual({
      age: 'How old are they?',
      closeness: 'How close are you?',
    });
  });

  // The codebook variable's `name` is the researcher's identifier for a column
  // of data. A variable with nothing authored is left out so the validators
  // fall back to a complete label-free sentence, rather than reaching for it.
  it('omits a variable with nothing authored, rather than naming it', () => {
    expect(buildVariableLabels([{ variable: 'age' }])).toEqual({});
  });

  it('treats whitespace-only text as nothing authored', () => {
    expect(buildVariableLabels([{ variable: 'age', prompt: '   ' }])).toEqual(
      {},
    );
  });

  it('trims the authored text it does keep', () => {
    expect(
      buildVariableLabels([{ variable: 'age', prompt: '  How old?  ' }]),
    ).toEqual({ age: 'How old?' });
  });

  it('prefers an explicit label over a prompt when a field carries both', () => {
    expect(
      buildVariableLabels([
        { variable: 'age', label: 'Age', prompt: 'How old are they?' },
      ]),
    ).toEqual({ age: 'Age' });
  });
});
