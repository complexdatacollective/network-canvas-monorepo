import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SyntheticNumberField } from '../SyntheticNumberField';
import type { NumericWindow } from '../useNumericDraft';

/**
 * The steppers on a generation parameter, which every one of these fields
 * declares `step="any"` for: any value inside the window is one the schema
 * takes, and no single grid describes it. `InputField` disables its +/-
 * buttons under a native step of `any`, so the mean and standard deviation of
 * every distribution could be typed but not stepped until the field brought
 * its own arithmetic (`resolveStep`).
 */

const OPEN_MEAN: NumericWindow = {
  max: 1000,
  exclusiveMin: false,
  exclusiveMax: false,
  integer: false,
};

const SPREAD: NumericWindow = {
  min: 0,
  exclusiveMin: false,
  exclusiveMax: false,
  integer: false,
};

const POPULATION: NumericWindow = {
  min: 0,
  max: 1000,
  exclusiveMin: false,
  exclusiveMax: false,
  integer: true,
};

/** Holds the committed value the way the distribution editors do. */
const Harness = ({
  label,
  window,
  initial,
  onCommit,
}: {
  label: string;
  window: NumericWindow;
  initial: number | undefined;
  onCommit: (value: number | undefined) => void;
}) => {
  const [value, setValue] = useState(initial);

  return (
    <SyntheticNumberField
      name="parameter"
      label={label}
      value={value}
      window={window}
      onCommit={(next) => {
        setValue(next);
        onCommit(next);
      }}
    />
  );
};

const stepper = (direction: 'Increase' | 'Decrease', label: string) =>
  screen.getByRole('button', { name: `${direction} ${label}` });

describe('SyntheticNumberField steppers', () => {
  it('offers stepping wherever it offers typing', () => {
    render(
      <Harness
        label="Mean"
        window={OPEN_MEAN}
        initial={3}
        onCommit={vi.fn()}
      />,
    );

    expect(stepper('Increase', 'Mean')).toBeEnabled();
    expect(stepper('Decrease', 'Mean')).toBeEnabled();
    // Named after the parameter: a distribution editor puts several numeric
    // fields on one screen.
    expect(screen.queryByRole('button', { name: 'Increase value' })).toBeNull();
  });

  it('steps an open-window mean up and down', () => {
    const onCommit = vi.fn();
    render(
      <Harness
        label="Mean"
        window={OPEN_MEAN}
        initial={3}
        onCommit={onCommit}
      />,
    );
    const input = screen.getByRole('spinbutton', { name: 'Mean' });

    fireEvent.click(stepper('Increase', 'Mean'));
    expect(onCommit).toHaveBeenLastCalledWith(4);
    expect(input).toHaveValue(4);

    fireEvent.click(stepper('Decrease', 'Mean'));
    fireEvent.click(stepper('Decrease', 'Mean'));
    expect(onCommit).toHaveBeenLastCalledWith(2);
    expect(input).toHaveValue(2);
  });

  it('refuses to step a standard deviation below its floor', () => {
    const onCommit = vi.fn();
    render(
      <Harness
        label="Standard deviation"
        window={SPREAD}
        initial={0}
        onCommit={onCommit}
      />,
    );
    const input = screen.getByRole('spinbutton', {
      name: 'Standard deviation',
    });

    fireEvent.click(stepper('Decrease', 'Standard deviation'));

    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue(0);

    fireEvent.click(stepper('Increase', 'Standard deviation'));
    expect(onCommit).toHaveBeenLastCalledWith(1);
  });

  it('steps an integral parameter by one', () => {
    const onCommit = vi.fn();
    render(
      <Harness
        label="Value"
        window={POPULATION}
        initial={12}
        onCommit={onCommit}
      />,
    );

    fireEvent.click(stepper('Increase', 'Value'));
    expect(onCommit).toHaveBeenLastCalledWith(13);

    fireEvent.click(stepper('Decrease', 'Value'));
    expect(onCommit).toHaveBeenLastCalledWith(12);
  });

  it('carries on from what was typed rather than from the last commit', () => {
    const onCommit = vi.fn();
    render(
      <Harness
        label="Mean"
        window={OPEN_MEAN}
        initial={3}
        onCommit={onCommit}
      />,
    );
    const input = screen.getByRole('spinbutton', { name: 'Mean' });

    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.click(stepper('Increase', 'Mean'));

    expect(onCommit).toHaveBeenLastCalledWith(11);
  });
});
