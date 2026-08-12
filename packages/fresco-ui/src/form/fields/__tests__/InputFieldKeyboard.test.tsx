import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import InputField from '../InputField';

function ControlledNumberInput({
  preventStep = false,
  step,
  onStep,
  stepperLabels,
}: {
  preventStep?: boolean;
  step?: number | 'any';
  onStep?: (value: string) => void;
  stepperLabels?: { increase: string; decrease: string };
}) {
  const [value, setValue] = useState('5');

  return (
    <InputField
      type="number"
      aria-label="Count"
      min={0}
      max={10}
      step={step}
      value={value}
      onChange={(nextValue) => setValue(nextValue ?? '')}
      onStep={onStep}
      stepperLabels={stepperLabels}
      onKeyDown={preventStep ? (event) => event.preventDefault() : undefined}
    />
  );
}

describe('InputField number keyboard stepping', () => {
  it('requests a decimal numeric keyboard by default', () => {
    render(<InputField type="number" aria-label="Count" />);

    expect(screen.getByRole('spinbutton', { name: 'Count' })).toHaveAttribute(
      'inputmode',
      'decimal',
    );
  });

  it('allows consumers to override the numeric keyboard mode', () => {
    render(<InputField type="number" inputMode="numeric" aria-label="Count" />);

    expect(screen.getByRole('spinbutton', { name: 'Count' })).toHaveAttribute(
      'inputmode',
      'numeric',
    );
  });

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

  it('leaves step-any arrow keys alone and disables discrete steppers', async () => {
    const user = userEvent.setup();
    render(<ControlledNumberInput step="any" />);
    const input = screen.getByRole('spinbutton', { name: 'Count' });

    await user.click(input);
    await user.keyboard('{ArrowUp}{ArrowDown}');

    expect(input).toHaveValue(5);
    expect(
      screen.getByRole('button', { name: 'Decrease value' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Increase value' }),
    ).toBeDisabled();
  });

  it('reports the settled value after a stepper button and an arrow key', async () => {
    const user = userEvent.setup();
    const stepped: string[] = [];
    render(<ControlledNumberInput onStep={(value) => stepped.push(value)} />);

    await user.click(screen.getByRole('button', { name: 'Increase value' }));
    expect(stepped).toEqual(['6']);

    await user.click(screen.getByRole('spinbutton', { name: 'Count' }));
    await user.keyboard('{ArrowDown}');
    expect(stepped).toEqual(['6', '5']);
  });

  it('does not report typed input as a step', async () => {
    const user = userEvent.setup();
    const stepped: string[] = [];
    render(<ControlledNumberInput onStep={(value) => stepped.push(value)} />);

    await user.click(screen.getByRole('spinbutton', { name: 'Count' }));
    await user.keyboard('7');

    expect(stepped).toEqual([]);
  });

  it('lets a consumer name the steppers after the field they change', () => {
    render(
      <ControlledNumberInput
        stepperLabels={{
          increase: 'Increase Count',
          decrease: 'Decrease Count',
        }}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Increase Count' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Decrease Count' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Increase value' }),
    ).not.toBeInTheDocument();
  });
});
