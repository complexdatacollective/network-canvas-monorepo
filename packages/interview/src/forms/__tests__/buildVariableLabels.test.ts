import { describe, expect, it } from 'vitest';

import { testVariableId } from '../../__tests__/testIds';
import { buildVariableLabels } from '../buildVariableLabels';

const AGE = testVariableId('age');
const CLOSENESS = testVariableId('closeness');

describe('buildVariableLabels', () => {
  it('names a variable with the caption the researcher authored for it', () => {
    expect(
      buildVariableLabels([
        { variable: AGE, label: 'How old are they?' },
        { variable: CLOSENESS, label: 'How close are you?' },
      ]),
    ).toEqual({
      [AGE]: 'How old are they?',
      [CLOSENESS]: 'How close are you?',
    });
  });

  // A variable with nothing authored is left out so the validators fall back
  // to a complete label-free sentence.
  it('omits a variable with nothing authored, rather than naming it', () => {
    expect(buildVariableLabels([{ variable: AGE }])).toEqual({});
  });

  it('treats whitespace-only text as nothing authored', () => {
    expect(buildVariableLabels([{ variable: AGE, label: '   ' }])).toEqual({});
  });

  it('trims the authored text it does keep', () => {
    expect(
      buildVariableLabels([{ variable: AGE, label: '  How old?  ' }]),
    ).toEqual({ [AGE]: 'How old?' });
  });
});
