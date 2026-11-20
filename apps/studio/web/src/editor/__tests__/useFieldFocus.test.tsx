import { render, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useFieldFocus } from '../useFieldFocus.ts';

const ROW = '66666666-6666-4666-8666-666666666666';

/** A stage form holding a list field, whose rows are keyed by object id. */
function renderForm() {
  const root = createRef<HTMLDivElement>();
  const view = render(
    <div ref={root}>
      <div data-field-name="items">
        <button type="button">Create new item</button>
        <ul>
          <li data-item-id={ROW}>The item</li>
        </ul>
      </div>
    </div>,
  );
  const { result } = renderHook(() => useFieldFocus(root));
  return { ...view, focusField: result.current.focusField };
}

describe('focusing the place a problem is about', () => {
  it('lands on the row of the object, ahead of the list that holds it', () => {
    const { focusField, getByText } = renderForm();
    const fallback = vi.fn();

    focusField(
      { fieldNames: ['items[0].content', 'items[0]', 'items'], objectId: ROW },
      fallback,
    );

    expect(getByText('The item')).toHaveFocus();
    expect(fallback).not.toHaveBeenCalled();
  });

  it('lands on the field as before when the object has no row on screen', () => {
    const { focusField, getByRole } = renderForm();

    focusField(
      {
        fieldNames: ['items[0].content', 'items[0]', 'items'],
        objectId: '77777777-7777-4777-8777-777777777777',
      },
      vi.fn(),
    );

    expect(getByRole('button', { name: 'Create new item' })).toHaveFocus();
  });

  it('lands on the field as before when the problem names no object', () => {
    const { focusField, getByRole } = renderForm();

    focusField({ fieldNames: ['items[0]', 'items'] }, vi.fn());

    expect(getByRole('button', { name: 'Create new item' })).toHaveFocus();
  });

  it('leaves the row out of the tab order once focus has moved on', () => {
    const { focusField, getByText, getByRole } = renderForm();

    focusField({ fieldNames: ['items'], objectId: ROW }, vi.fn());
    getByRole('button', { name: 'Create new item' }).focus();

    expect(getByText('The item')).not.toHaveAttribute('tabindex');
  });
});
