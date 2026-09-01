import { describe, expect, it, vi } from 'vitest';

import { flushFocusedField } from '../focusedField';

describe('flushFocusedField', () => {
  it.each(['input', 'textarea', 'select'] as const)(
    'blurs a focused %s before a canvas gesture captures state',
    (tagName) => {
      const field = document.createElement(tagName);
      const onBlur = vi.fn();
      field.addEventListener('blur', onBlur);
      document.body.appendChild(field);
      field.focus();

      flushFocusedField();

      expect(onBlur).toHaveBeenCalledOnce();
      expect(document.activeElement).not.toBe(field);
      field.remove();
    },
  );

  it('leaves a focused non-field control alone', () => {
    const button = document.createElement('button');
    const onBlur = vi.fn();
    button.addEventListener('blur', onBlur);
    document.body.appendChild(button);
    button.focus();

    flushFocusedField();

    expect(onBlur).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
    button.remove();
  });
});
