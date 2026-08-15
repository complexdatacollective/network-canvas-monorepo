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

  // `VariableNameSchema` is `/^[a-zA-Z0-9._:-]+$/`, so `__proto__` is a valid
  // codebook variable id. Accumulating onto a plain object drops the caption on
  // `Object.prototype`'s setter, and the lookup then answers `Object.prototype`
  // — which a participant reads as `[object Object]` in the hint that is meant
  // to name their question.
  it('names a variable whose id is a prototype key like any other', () => {
    const labels = buildVariableLabels([
      { variable: '__proto__', prompt: 'How old are they?' },
    ]);

    expect(Object.keys(labels)).toEqual(['__proto__']);
    expect(labels.__proto__).toBe('How old are they?');
  });
});
