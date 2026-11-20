import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import UnconnectedField from '../form/Field/UnconnectedField';
import SegmentedSwitcherField from './SegmentedSwitcherField';

const SIZES = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
];

function SizeField({
  initial,
  onChange = vi.fn(),
  disabled,
  readOnly,
}: {
  initial?: string;
  onChange?: (value: string | undefined) => void;
  disabled?: boolean;
  readOnly?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <UnconnectedField
      name="size"
      component={SegmentedSwitcherField}
      label="Display size"
      hint="How tall it is shown."
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      options={SIZES}
      disabled={disabled}
      readOnly={readOnly}
    />
  );
}

const pressed = () =>
  screen
    .getAllByRole('button')
    .filter((button) => button.getAttribute('aria-pressed') === 'true')
    .map((button) => button.textContent);

describe('SegmentedSwitcherField', () => {
  it('is named by its field’s label and described by its hint', () => {
    render(<SizeField initial="small" />);

    const group = screen.getByRole('group', { name: 'Display size' });
    expect(group).toHaveAccessibleDescription('How tall it is shown.');
    expect(group).toContainElement(
      screen.getByRole('button', { name: 'Medium' }),
    );
  });

  it('presses the segment that is its value, and none without one', () => {
    const { unmount } = render(<SizeField initial="medium" />);
    expect(pressed()).toEqual(['Medium']);
    unmount();

    render(<SizeField />);
    expect(pressed()).toEqual([]);
  });

  it('answers with the segment chosen, and shows it chosen', async () => {
    const onChange = vi.fn();
    render(<SizeField initial="small" onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Large' }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith('large');
    expect(pressed()).toEqual(['Large']);
  });

  it('is chosen from with the keyboard', async () => {
    const onChange = vi.fn();
    render(<SizeField initial="small" onChange={onChange} />);

    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Small' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}{Enter}');

    expect(onChange).toHaveBeenCalledExactlyOnceWith('medium');
  });

  it('ignores every segment when disabled', async () => {
    const onChange = vi.fn();
    render(<SizeField initial="small" onChange={onChange} disabled />);

    for (const { label } of SIZES) {
      expect(screen.getByRole('button', { name: label })).toBeDisabled();
    }
    await userEvent.click(screen.getByRole('button', { name: 'Large' }));

    expect(onChange).not.toHaveBeenCalled();
    expect(pressed()).toEqual(['Small']);
  });

  it('keeps its value when read-only', async () => {
    const onChange = vi.fn();
    render(<SizeField initial="small" onChange={onChange} readOnly />);

    await userEvent.click(screen.getByRole('button', { name: 'Large' }));

    expect(onChange).not.toHaveBeenCalled();
    expect(pressed()).toEqual(['Small']);
  });

  it('is named by its own label outside a field', () => {
    render(
      <SegmentedSwitcherField
        aria-label="Display size"
        value="small"
        onChange={vi.fn()}
        options={SIZES}
      />,
    );

    expect(
      screen.getByRole('group', { name: 'Display size' }),
    ).toBeInTheDocument();
  });
});
