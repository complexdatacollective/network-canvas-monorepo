import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ToggleButtonGroupField from './ToggleButtonGroup';

const options = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
];

describe('ToggleButtonGroup readOnly', () => {
  it('marks every option pointer-inert', () => {
    render(
      <ToggleButtonGroupField
        name="options"
        options={options}
        value={['a']}
        readOnly
        onChange={() => undefined}
      />,
    );

    for (const option of options) {
      const button = screen.getByRole('checkbox', { name: option.label });
      expect(button.className).toContain('pointer-events-none');
    }
  });

  it('does not report a change when an option is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <ToggleButtonGroupField
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

  it('does not apply pointer-events-none when interactive', () => {
    render(
      <ToggleButtonGroupField
        name="options"
        options={options}
        value={['a']}
        onChange={() => undefined}
      />,
    );

    const button = screen.getByRole('checkbox', { name: 'Option A' });
    expect(button.className).not.toContain('pointer-events-none');
  });
});
