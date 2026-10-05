import { describe, expect, it } from 'vitest';

import { selectFieldMetadataFromVariables } from '../forms';

describe('selectFieldMetadataFromVariables', () => {
  it('prefers the field-level component over the codebook (control on stage)', () => {
    const variables = {
      // no codebook component
      closeness: {
        name: 'closeness',
        label: { en: 'Closeness' },
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
    expect(meta?.authoredLabel).toEqual({ en: 'How close?' });
  });

  it('falls back to the codebook component when the field has none (other stages)', () => {
    const variables = {
      age: {
        name: 'age',
        label: { en: 'Age' },
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
    expect(meta?.authoredLabel).toEqual({ en: 'How old are you?' });
  });

  it('captions an unlabelled composer field with the codebook label, not its id or name', () => {
    const variables = {
      'var-uuid-1': {
        name: 'age_years',
        label: { en: 'Age' },
        type: 'number' as const,
      },
    };
    const fields = [{ variable: 'var-uuid-1', component: 'Number' }];
    const [meta] = selectFieldMetadataFromVariables(
      variables as never,
      fields as never,
    );
    expect(meta?.label).toEqual({ en: 'Age' });
    expect(meta?.authoredLabel).toBeUndefined();
  });
});
