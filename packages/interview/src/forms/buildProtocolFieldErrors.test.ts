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
      },
    ]);
  });

  it('carries no rendered message, which can hold protocol-authored text', () => {
    const entries = buildProtocolFieldErrors(
      {
        fieldErrors: {
          colour: ['PROTOCOL_AUTHORED_MESSAGE', 'ANOTHER_AUTHORED_MESSAGE'],
        },
      },
      [{ variable: 'colour' }],
      { colour: 'Text' },
      {},
    );
    expect(JSON.stringify(entries)).not.toContain('AUTHORED_MESSAGE');
    expect(entries).toEqual([{ field_index: 0, component: 'Text' }]);
  });
});
