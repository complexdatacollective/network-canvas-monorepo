import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import SegmentedSwitcher from './SegmentedSwitcher';

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Bravo' },
  { value: 'c', label: 'Charlie' },
] as const;

function setup(value: 'a' | 'b' | 'c', onValueChange = vi.fn()) {
  render(
    <SegmentedSwitcher
      aria-label="Test switcher"
      value={value}
      onValueChange={onValueChange}
      options={[...OPTIONS]}
    />,
  );
  return { onValueChange };
}

describe('SegmentedSwitcher', () => {
  it('renders one pressed segment matching value', () => {
    setup('b');
    expect(screen.getByRole('button', { name: 'Bravo' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Alpha' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('fires onValueChange with the picked value when another segment is clicked', async () => {
    const { onValueChange } = setup('a');
    await userEvent.click(screen.getByRole('button', { name: 'Charlie' }));
    expect(onValueChange).toHaveBeenCalledWith('c');
  });

  it('does not deselect: clicking the active segment keeps it active (no empty emit)', async () => {
    const { onValueChange } = setup('a');
    await userEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    // Either not called, or called again with 'a' — never with an empty/undefined value.
    for (const call of onValueChange.mock.calls) {
      expect(call[0]).toBe('a');
    }
  });

  it('does not fire for a disabled segment', async () => {
    const onValueChange = vi.fn();
    render(
      <SegmentedSwitcher
        aria-label="Test switcher"
        value="a"
        onValueChange={onValueChange}
        options={[
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'Bravo', disabled: true },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Bravo' }));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('renders a render-swapped segment as its non-button element without a nativeButton warning', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <SegmentedSwitcher
        aria-label="Test switcher"
        value="a"
        onValueChange={vi.fn()}
        options={[
          { value: 'a', label: 'Alpha' },
          {
            value: 'b',
            label: 'Bravo',
            render: <a href="#seg" aria-label="Bravo" />,
          },
        ]}
      />,
    );

    const link = screen.getByRole('button', { name: 'Bravo' });
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '#seg');

    for (const call of [...errorSpy.mock.calls, ...warnSpy.mock.calls]) {
      expect(call.join(' ')).not.toMatch(/nativeButton/);
    }

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
