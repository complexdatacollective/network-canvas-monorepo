import { describe, expect, it } from 'vitest';

import { excludeNodeLabelVariable } from '../nodeUtils';

describe('excludeNodeLabelVariable', () => {
  it('removes the pedigree label variable from the additional node form', () => {
    expect(
      excludeNodeLabelVariable(
        [
          { variable: 'name', prompt: 'Duplicate name' },
          { variable: 'birthYear', prompt: 'Birth year' },
        ],
        'name',
      ),
    ).toEqual([{ variable: 'birthYear', prompt: 'Birth year' }]);
  });

  it('preserves an absent form', () => {
    expect(excludeNodeLabelVariable(undefined, 'name')).toBeUndefined();
  });
});
