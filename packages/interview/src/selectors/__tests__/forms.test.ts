import { describe, expect, it } from 'vitest';

import { selectFieldMetadataFromVariables } from '../forms';

describe('selectFieldMetadataFromVariables', () => {
  it('prefers the field-level component over the codebook (control on stage)', () => {
    const variables = {
      closeness: { name: 'closeness', type: 'scalar' as const }, // no codebook component
    };
    const fields = [
      {
        variable: 'closeness',
        component: 'VisualAnalogScale',
        prompt: 'How close?',
      },
    ];
    const [meta] = selectFieldMetadataFromVariables(
      variables as never,
      fields as never,
    );
    expect(meta.component).toBe('VisualAnalogScale');
    expect(meta.label).toBe('How close?');
  });

  it('falls back to the codebook component when the field has none (other stages)', () => {
    const variables = {
      age: { name: 'age', type: 'number' as const, component: 'Number' },
    };
    const fields = [{ variable: 'age', prompt: 'Age' }];
    const [meta] = selectFieldMetadataFromVariables(
      variables as never,
      fields as never,
    );
    expect(meta.component).toBe('Number');
  });
});
