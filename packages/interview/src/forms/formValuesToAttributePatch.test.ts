import { describe, expect, it, vi } from 'vitest';

import { formValuesToAttributePatch } from './formValuesToAttributePatch';

describe('formValuesToAttributePatch', () => {
  it('preserves every defined variable value and unsets unanswered mounted fields', () => {
    const result = formValuesToAttributePatch(
      {
        text: '',
        boolean: false,
        number: 0,
        encrypted: [1, 2, 3],
        categorical: ['one', 2, true],
        emptyArray: [],
        layout: { x: 0, y: 1 },
        unanswered: undefined,
        unmounted: 'ignored',
      },
      [
        'text',
        'boolean',
        'number',
        'encrypted',
        'categorical',
        'emptyArray',
        'layout',
        'unanswered',
      ],
    );

    expect(result).toEqual({
      success: true,
      patch: {
        set: {
          text: '',
          boolean: false,
          number: 0,
          encrypted: [1, 2, 3],
          categorical: ['one', 2, true],
          emptyArray: [],
          layout: { x: 0, y: 1 },
        },
        unset: ['unanswered'],
      },
    });
  });

  it('rejects JSON content and record arrays without returning or dispatching a partial patch', () => {
    const dispatch = vi.fn();
    const values = {
      valid: 'kept only on success',
      richText: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'x' }] },
        ],
      },
      recordArray: [{ nested: 'invalid' }],
    };

    const result = formValuesToAttributePatch(values, [
      'recordArray',
      'valid',
      'richText',
    ]);

    if (result.success) {
      dispatch(result.patch);
    }

    expect(result).toEqual({
      success: false,
      error: {
        code: 'invalid-variable-value',
        fieldNames: ['recordArray', 'richText'],
      },
    });
    expect(dispatch).not.toHaveBeenCalled();
    expect(values).toEqual({
      valid: 'kept only on success',
      richText: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'x' }] },
        ],
      },
      recordArray: [{ nested: 'invalid' }],
    });
  });
});
