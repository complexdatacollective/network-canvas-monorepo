import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import InputField from '../InputField';

function ControlledNumberInput({ preventStep = false }) {
  const [value, setValue] = useState('5');

  return (
    <InputField
      type="number"
      aria-label="Count"
      min={0}
      max={10}
      value={value}
      onChange={(nextValue) => setValue(nextValue ?? '')}
      onKeyDown={preventStep ? (event) => event.preventDefault() : undefined}
    />
  );
}

describe('InputField number keyboard stepping', () => {
  it('keeps the controlled value in sync with ArrowUp and ArrowDown', async () => {
    const user = userEvent.setup();
    render(<ControlledNumberInput />);
    const input = screen.getByRole('spinbutton', { name: 'Count' });

    await user.click(input);
    await user.keyboard('{ArrowUp}');
    expect(input).toHaveValue(6);

    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(input).toHaveValue(4);
  });

  it('allows a consumer to prevent keyboard stepping', async () => {
    const user = userEvent.setup();
    render(<ControlledNumberInput preventStep />);
    const input = screen.getByRole('spinbutton', { name: 'Count' });

    await user.click(input);
    await user.keyboard('{ArrowUp}');

    expect(input).toHaveValue(5);
  });
});
