import { describe, expect, it } from 'vitest';

import { composerNormalizeField } from '../composerHelpers';

describe('composerNormalizeField', () => {
  it('keeps component and parameters on the field but strips codebook + scaffolding props', () => {
    const out = composerNormalizeField({
      id: 'x',
      _createNewVariable: 'Age',
      variable: 'age',
      component: 'Number',
      parameters: { min: 0 },
      prompt: 'Age',
      options: [{ label: 'a', value: 'a' }],
      validation: { required: true },
    });
    expect(out).toEqual({
      variable: 'age',
      component: 'Number',
      parameters: { min: 0 },
      prompt: 'Age',
    });
  });
});
