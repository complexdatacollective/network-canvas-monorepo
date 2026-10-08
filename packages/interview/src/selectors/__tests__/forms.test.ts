import { describe, expect, it } from 'vitest';

import { selectFieldMetadataFromVariables } from '../forms';

describe('selectFieldMetadataFromVariables', () => {
  it('prefers the field-level component over the codebook (control on stage)', () => {
    const variables = {
      // no codebook component
      closeness: {
        name: 'closeness',
        label: 'Closeness',
        type: 'scalar' as const,
      },
    };
    const fields = [
      {
        variable: 'closeness',
        component: 'VisualAnalogScale',
        label: { en: 'How close?' },
      },
    ];
    const [meta] = selectFieldMetadataFromVariables(
      variables as never,
      fields as never,
    );
    expect(meta?.component).toBe('VisualAnalogScale');
    expect(meta?.label).toEqual({ en: 'How close?' });
  });

  it('falls back to the codebook component when the field has none (other stages)', () => {
    const variables = {
      age: {
        name: 'age',
        label: 'Age',
        type: 'number' as const,
        component: 'Number',
      },
    };
    const fields = [{ variable: 'age', prompt: { en: 'How old are you?' } }];
    const [meta] = selectFieldMetadataFromVariables(
      variables as never,
      fields as never,
    );
    expect(meta?.component).toBe('Number');
    expect(meta?.label).toEqual({ en: 'How old are you?' });
  });
});
