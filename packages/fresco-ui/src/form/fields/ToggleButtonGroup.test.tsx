import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ToggleButtonGroupField from './ToggleButtonGroup';

const options = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
];

describe('ToggleButtonGroup readOnly', () => {
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
});

describe('ToggleButtonGroup option labels', () => {
  it('names each option by its label as read, not by its markdown', () => {
    render(
      <ToggleButtonGroupField
        name="options"
        options={[
          { value: 'in_person', label: '**In person**' },
          { value: 'call', label: 'Phone &amp; video' },
        ]}
        value={[]}
        onChange={() => undefined}
      />,
    );

    expect(
      screen.getByRole('checkbox', { name: 'In person' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Phone & video' }),
    ).toBeInTheDocument();
    expect(screen.getByText('In person').tagName).toBe('STRONG');
  });
});
