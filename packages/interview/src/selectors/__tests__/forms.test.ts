import { describe, expect, it } from 'vitest';

import { testVariableId } from '../../__tests__/testIds';
import { selectFieldMetadataFromVariables } from '../forms';

const CLOSENESS = testVariableId('closeness');
const AGE = testVariableId('age');

describe('selectFieldMetadataFromVariables', () => {
  it('prefers the field-level component over the codebook (control on stage)', () => {
    const variables = {
      // no codebook component
      [CLOSENESS]: {
        name: 'closeness',
        type: 'scalar' as const,
      },
    };
    const fields = [
      {
        id: 'field-L15',
        variable: CLOSENESS,
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
      [AGE]: {
        name: 'age',
        type: 'number' as const,
        component: 'Number',
      },
    };
    const fields = [{ variable: AGE, prompt: { en: 'How old are you?' } }];
    const [meta] = selectFieldMetadataFromVariables(
      variables as never,
      fields as never,
    );
    expect(meta?.component).toBe('Number');
    expect(meta?.label).toEqual({ en: 'How old are you?' });
  });
});
