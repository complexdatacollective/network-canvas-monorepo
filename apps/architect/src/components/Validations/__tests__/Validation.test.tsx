import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Validation, { summarizeValidation } from '../Validation';

const options = [
  { label: 'Minimum value', value: 'minValue' },
  { label: 'Required', value: 'required' },
];

describe('Validation', () => {
  it('renders a collapsed summary row with edit and delete actions', () => {
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

    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save validation rule' }),
    ).not.toBeInTheDocument();

    const remove = screen.getByRole('button', {
      name: 'Delete Required validation rule',
    });
    fireEvent.click(remove);

    expect(onDelete).toHaveBeenCalledWith('required');
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('reveals inline edit controls when the edit action is used', () => {
    const onEdit = vi.fn();

    render(
      <Validation
        itemKey="required"
        itemValue
        options={options}
        existingVariables={{}}
        onEdit={onEdit}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Edit Required validation rule' }),
    );

    expect(onEdit).toHaveBeenCalled();
  });

  it('only commits an integer changed value once the save action is used', () => {
    const onUpdate = vi.fn();
    const onCancel = vi.fn();

    render(
      <Validation
        itemKey="minValue"
        itemValue={1}
        options={options}
        existingVariables={{}}
        onUpdate={onUpdate}
        onCancel={onCancel}
        isBeingEdited
      />,
    );

    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: '3' },
    });

    // Editing the value alone must not write to the form field yet.
    expect(onUpdate).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: 'Save validation rule' }),
    );

    expect(onUpdate).toHaveBeenCalledWith('minValue', 3, 'minValue');
    expect(onCancel).toHaveBeenCalled();
  });

  it('uses integer input steps and refuses to save a fractional value', () => {
    const onUpdate = vi.fn();

    render(
      <Validation
        itemKey="minValue"
        itemValue={1}
        options={options}
        existingVariables={{}}
        onUpdate={onUpdate}
        isBeingEdited
      />,
    );

    const input = screen.getByRole('spinbutton');
    expect(input).toHaveAttribute('step', '1');
    fireEvent.change(input, { target: { value: '3.14' } });

    expect(screen.getByText('minValue must be a whole number')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Save validation rule' }),
    ).toBeDisabled();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('discards edits and exits editing mode when cancelled', () => {
    const onUpdate = vi.fn();
    const onCancel = vi.fn();

    render(
      <Validation
        itemKey="minValue"
        itemValue={1}
        options={options}
        existingVariables={{}}
        onUpdate={onUpdate}
        onCancel={onCancel}
        isBeingEdited
      />,
    );

    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: '3.14' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Cancel editing validation rule' }),
    );

    expect(onUpdate).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it('cancels editing on Escape', () => {
    const onCancel = vi.fn();

    render(
      <Validation
        itemKey="minValue"
        itemValue={1}
        options={options}
        existingVariables={{}}
        onCancel={onCancel}
        isBeingEdited
      />,
    );

    fireEvent.keyDown(screen.getByRole('spinbutton'), { key: 'Escape' });

    expect(onCancel).toHaveBeenCalled();
  });
});

describe('summarizeValidation', () => {
  it('summarizes a rule with no value', () => {
    expect(summarizeValidation('required', true, {})).toBe('Required');
  });

  it('summarizes a rule with a number value', () => {
    expect(summarizeValidation('minValue', 2, {})).toBe('Minimum value: 2');
  });

  it('summarizes a rule with a variable-reference value', () => {
    expect(
      summarizeValidation('sameAs', 'var-1', {
        'var-1': { name: 'Alex', type: 'text' },
      }),
    ).toBe('Same as: Alex');
  });
});
