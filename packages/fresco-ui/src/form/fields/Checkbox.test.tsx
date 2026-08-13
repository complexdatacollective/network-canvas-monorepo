import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import Checkbox from './Checkbox';

describe('Checkbox readOnly', () => {
  it('stops advertising press interactivity it cannot act on', () => {
    render(<Checkbox readOnly aria-label="Read-only checkbox" />);

    const checkbox = screen.getByRole('checkbox', {
      name: 'Read-only checkbox',
    });

    expect(checkbox.className).toContain('pointer-events-none');
  });

  it('does not report a change when clicked', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();

    render(
      <Checkbox
        readOnly
        checked={false}
        onCheckedChange={onCheckedChange}
        aria-label="Read-only checkbox"
      />,
    );

    await user.click(
      screen.getByRole('checkbox', { name: 'Read-only checkbox' }),
    );

    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('stays keyboard-focusable and announces its read-only state', () => {
    render(<Checkbox readOnly aria-label="Read-only checkbox" />);

    const checkbox = screen.getByRole('checkbox', {
      name: 'Read-only checkbox',
    });

    checkbox.focus();
    expect(checkbox).toHaveFocus();
    expect(checkbox).toHaveAttribute('aria-readonly', 'true');
  });

  it('does not apply pointer-events-none when interactive', () => {
    render(<Checkbox aria-label="Interactive checkbox" />);

    const checkbox = screen.getByRole('checkbox', {
      name: 'Interactive checkbox',
    });

    expect(checkbox.className).not.toContain('pointer-events-none');
  });
});
