import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Validation from '../Validation';

const options = [
  { label: 'Minimum value', value: 'minValue' },
  { label: 'Required', value: 'required' },
];

describe('Validation', () => {
  it('uses a labeled semantic delete action without changing the rule', () => {
    const onDelete = vi.fn();
    const onUpdate = vi.fn();

    render(
      <Validation
        itemKey="required"
        itemValue
        options={options}
        existingVariables={{}}
        onDelete={onDelete}
        onUpdate={onUpdate}
      />,
    );

    const remove = screen.getByRole('button', {
      name: 'Delete validation rule',
    });
    expect(remove).toHaveClass('group-focus-within:opacity-100');

    fireEvent.click(remove);

    expect(onDelete).toHaveBeenCalledWith('required');
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('preserves decimal values for numeric validation rules', () => {
    const onUpdate = vi.fn();

    render(
      <Validation
        itemKey="minValue"
        itemValue={1}
        options={options}
        existingVariables={{}}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: '3.14' },
    });

    expect(onUpdate).toHaveBeenCalledWith('minValue', 3.14, 'minValue');
  });
});
