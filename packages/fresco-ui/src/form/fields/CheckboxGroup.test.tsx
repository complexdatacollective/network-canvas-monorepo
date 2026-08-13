import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import CheckboxGroupField from './CheckboxGroup';

const options = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
];

describe('CheckboxGroup readOnly', () => {
  it('marks every option pointer-inert', () => {
    render(
      <CheckboxGroupField
        name="options"
        options={options}
        value={['a']}
        readOnly
        onChange={() => undefined}
      />,
    );

    for (const option of options) {
      const checkbox = screen.getByRole('checkbox', { name: option.label });
      expect(checkbox.className).toContain('pointer-events-none');
    }
  });

  it('does not report a change when an option is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <CheckboxGroupField
        name="options"
        options={options}
        value={['a']}
        readOnly
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: 'Option B' }));

    expect(onChange).not.toHaveBeenCalled();
  });
});
