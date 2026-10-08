import { describe, expect, it, vi } from 'vitest';

import { formValuesToAttributePatch } from './formValuesToAttributePatch';

describe('formValuesToAttributePatch', () => {
  it('preserves every defined variable value and unsets mounted fields the participant cleared', () => {
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
      { unanswered: 'an answer since cleared' },
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

    const result = formValuesToAttributePatch(
      values,
      ['recordArray', 'valid', 'richText'],
      {},
    );

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

  it('treats dangerous field names as own keys instead of prototype properties', () => {
    const values = Object.fromEntries([['__proto__', 'preserved']]);

    const result = formValuesToAttributePatch(
      values,
      ['__proto__', 'constructor'],
      Object.fromEntries([['constructor', 'an answer since cleared']]),
    );

    expect(result).toEqual({
      success: true,
      patch: {
        set: Object.fromEntries([['__proto__', 'preserved']]),
        unset: ['constructor'],
      },
    });
    if (result.success) {
      expect(Object.hasOwn(result.patch.set, '__proto__')).toBe(true);
    }
    expect(Object.getPrototypeOf(values)).toBe(Object.prototype);
  });

  it('leaves a stored value the form never showed as it is', () => {
    // Shown with no value, as an answer that cannot be decrypted is.
    const result = formValuesToAttributePatch(
      { name: undefined, age: 41 },
      ['name', 'age'],
      { age: 40 },
    );

    expect(result).toEqual({
      success: true,
      patch: { set: { age: 41 }, unset: [] },
    });
  });

  it('replaces a stored value the form never showed once the participant gives it one', () => {
    const result = formValuesToAttributePatch({ name: 'Alice' }, ['name'], {});

    expect(result).toEqual({
      success: true,
      patch: { set: { name: 'Alice' }, unset: [] },
    });
  });
});
