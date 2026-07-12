import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import EditValue from '../EditValue';

describe('EditValue', () => {
  it('renders saved categorical selections and preserves them when adding another', () => {
    const onChange = vi.fn();
    render(
      <EditValue
        variableType="categorical"
        value={['apple', 'banana']}
        options={[
          { value: 'apple', label: 'Apple' },
          { value: 'banana', label: 'Banana' },
          { value: 'cherry', label: 'Cherry' },
        ]}
        onChange={onChange}
        validation={{ required: true }}
      />,
    );

    expect(screen.getByRole('checkbox', { name: 'Apple' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Banana' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Cherry' })).not.toBeChecked();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Cherry' }));

    expect(onChange.mock.lastCall?.[1]).toEqual(['apple', 'banana', 'cherry']);
  });

  it('constrains selected-option counts to integers', () => {
    const onChange = vi.fn();
    render(
      <EditValue
        variableType="count"
        value={2}
        onChange={onChange}
        validation={{ requiredAcceptsZero: true }}
      />,
    );

    const input = screen.getByRole('spinbutton', { name: 'Attribute value' });
    expect(input).toHaveAttribute('type', 'number');
    expect(input).toHaveAttribute('step', '1');

    fireEvent.change(input, { target: { value: '4' } });
    expect(onChange.mock.lastCall?.[1]).toBe(4);

    // The integer step rejects a fractional count, so it is never committed.
    fireEvent.change(input, { target: { value: '3.5' } });
    expect(onChange.mock.lastCall?.[1]).toBeNull();
  });

  it('routes boolean operands through the fresco ToggleField', () => {
    const onChange = vi.fn();
    render(
      <EditValue
        variableType="boolean"
        value={false}
        onChange={onChange}
        validation={{ required: true }}
      />,
    );

    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(toggle);

    expect(onChange.mock.lastCall?.[1]).toBe(true);
  });
});
