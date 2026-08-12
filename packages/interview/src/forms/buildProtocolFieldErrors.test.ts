import { describe, expect, it } from 'vitest';

import { buildProtocolFieldErrors } from './buildProtocolFieldErrors';

describe('buildProtocolFieldErrors', () => {
  it('maps canonical opaque paths back to protocol variable IDs', () => {
    expect(
      buildProtocolFieldErrors(
        {
          fieldErrors: {
            '["favorite.color"]': ['Choose another color'],
          },
        },
        [{ variable: 'favorite.color' }],
        { 'favorite.color': 'RadioGroup' },
        { '["favorite.color"]': 'favorite.color' },
      ),
    ).toEqual([
      {
        component: 'RadioGroup',
        field_index: 0,
        message: 'Choose another color',
      },
    ]);
  });
});
