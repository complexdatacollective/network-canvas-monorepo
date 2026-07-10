import { describe, expect, it } from 'vitest';

import { getAssignableVariableOptions } from '../AssignAttributes';

describe('getAssignableVariableOptions', () => {
  it('keeps boolean variables and disables variables already assigned', () => {
    expect(
      getAssignableVariableOptions(
        [
          { label: 'Used boolean', value: 'used', type: 'boolean' },
          { label: 'Unused boolean', value: 'unused', type: 'boolean' },
          { label: 'Text', value: 'text', type: 'text' },
          { label: 'Unknown', value: 'unknown' },
        ],
        ['used'],
      ),
    ).toEqual([
      {
        label: 'Used boolean',
        value: 'used',
        type: 'boolean',
        disabled: true,
      },
      {
        label: 'Unused boolean',
        value: 'unused',
        type: 'boolean',
        disabled: false,
      },
    ]);
  });
});
