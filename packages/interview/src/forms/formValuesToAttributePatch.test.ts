import { describe, expect, it, vi } from 'vitest';

import { formValuesToAttributePatch } from './formValuesToAttributePatch';

/** Every one of `fields`, each shown. */
const allShown = (fields: readonly string[]) => ({
  fields,
  shown: new Set(fields),
});

describe('formValuesToAttributePatch', () => {
  it('saves every answer and unsets every shown field without one', () => {
    const result = formValuesToAttributePatch(
      {
        text: 'Sam',
        boolean: false,
        number: 0,
        encrypted: [1, 2, 3],
        categorical: ['one', 2, true],
        layout: { x: 0, y: 1 },
        unanswered: undefined,
        unmounted: 'ignored',
      },
      allShown([
        'text',
        'boolean',
        'number',
        'encrypted',
        'categorical',
        'layout',
        'unanswered',
      ]),
    );

    expect(result).toEqual({
      success: true,
      patch: {
        set: {
          text: 'Sam',
          boolean: false,
          number: 0,
          encrypted: [1, 2, 3],
          categorical: ['one', 2, true],
          layout: { x: 0, y: 1 },
        },
        unset: ['unanswered'],
      },
    });
  });

  /**
   * An answer typed and then deleted is no answer, by the same test as the
   * required check (`isUnanswered`), so it is unset rather than stored as ''.
   * Rules read "exists" by the same test.
   */
  it('unsets a cleared answer instead of storing it', () => {
    const result = formValuesToAttributePatch(
      {
        cleared: '',
        spaces: '   ',
        noOptions: [],
        partialNumber: Number.NaN,
        zero: 0,
        no: false,
      },
      allShown([
        'cleared',
        'spaces',
        'noOptions',
        'partialNumber',
        'zero',
        'no',
      ]),
    );

    expect(result).toEqual({
      success: true,
      patch: {
        set: { zero: 0, no: false },
        unset: ['cleared', 'spaces', 'noOptions', 'partialNumber'],
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
      allShown(['recordArray', 'valid', 'richText']),
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

  it('leaves a field it was told to keep as stored until it is given a new answer', () => {
    const keepWhenUnanswered = ['missing', 'blank', 'emptied', 'replaced'];

    const result = formValuesToAttributePatch(
      { blank: '   ', emptied: undefined, replaced: 'Alicia', cleared: '' },
      {
        ...allShown([
          'missing',
          'blank',
          'emptied',
          'replaced',
          'cleared',
          'gone',
        ]),
        keepWhenUnanswered,
      },
    );

    expect(result).toEqual({
      success: true,
      patch: { set: { replaced: 'Alicia' }, unset: ['cleared', 'gone'] },
    });
  });

  it('clears the answer to a field that logic hides, whatever the form holds for it', () => {
    const result = formValuesToAttributePatch(
      // A hidden field is not mounted, but the form may still hold a value
      // for it: neither is saved.
      { employed: 'yes', employer: 'Acme' },
      {
        fields: ['employed', 'employer', 'start'],
        shown: new Set(['employed']),
      },
    );

    expect(result).toEqual({
      success: true,
      patch: { set: { employed: 'yes' }, unset: ['employer', 'start'] },
    });
  });

  it('clears a hidden field even when its stored answer could not be shown', () => {
    const result = formValuesToAttributePatch(
      {},
      {
        fields: ['shownSecret', 'hiddenSecret'],
        shown: new Set(['shownSecret']),
        keepWhenUnanswered: ['shownSecret', 'hiddenSecret'],
      },
    );

    expect(result).toEqual({
      success: true,
      patch: { set: {}, unset: ['hiddenSecret'] },
    });
  });

  it('leaves alone a variable that only another language’s form asks', () => {
    const result = formValuesToAttributePatch(
      { name: 'Amara', employer: 'Acme' },
      // `employer` is in the form, but not in the document of the language
      // shown, so it is not among the fields this submission asks.
      { fields: ['name'], shown: new Set(['name']) },
    );

    expect(result).toEqual({
      success: true,
      patch: { set: { name: 'Amara' }, unset: [] },
    });
  });
});
