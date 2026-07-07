import { describe, expect, it } from 'vitest';

import { normalizeField } from '../helpers';

describe('normalizeField', () => {
  it('keeps id so the list item retains a stable, unique React key', () => {
    const out = normalizeField({
      id: 'stable-uuid',
      _createNewVariable: 'Age',
      variable: 'age',
      prompt: 'How old?',
      options: [{ label: 'a', value: 'a' }],
      parameters: { min: 0 },
      component: 'Number',
      validation: { required: true },
    });

    expect(out).toEqual({
      id: 'stable-uuid',
      variable: 'age',
      prompt: 'How old?',
    });
  });
});
