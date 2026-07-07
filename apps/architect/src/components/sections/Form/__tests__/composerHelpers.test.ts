import { describe, expect, it } from 'vitest';

import { composerNormalizeField } from '../composerHelpers';

describe('composerNormalizeField', () => {
  it('keeps id, component and parameters on the field but strips codebook + scaffolding props', () => {
    const out = composerNormalizeField({
      id: 'x',
      _createNewVariable: 'Age',
      variable: 'age',
      component: 'Number',
      parameters: { min: 0 },
      label: 'Age',
      options: [{ label: 'a', value: 'a' }],
      validation: { required: true },
    });
    expect(out).toEqual({
      id: 'x',
      variable: 'age',
      component: 'Number',
      parameters: { min: 0 },
      label: 'Age',
    });
  });

  it('omits a blank label so the variable-name caption fallback applies', () => {
    const out = composerNormalizeField({
      id: 'x',
      variable: 'age',
      component: 'Number',
      label: '   ',
    });
    expect(out).toEqual({
      id: 'x',
      variable: 'age',
      component: 'Number',
    });
  });
});
