import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createPortal } from 'react-dom';
import { describe, expect, it, vi } from 'vitest';

import { useFocusWithin } from '../useFocusWithin';

function Area({ onLeave }: { onLeave: (next: Element | null) => void }) {
  const { focusWithin, onFocus, onBlur } = useFocusWithin(onLeave);
  return (
    <>
      <div
        data-testid="area"
        data-within={focusWithin}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        <button type="button">Inside</button>
        {createPortal(<button type="button">In a popup</button>, document.body)}
      </div>
      <button type="button">Outside</button>
    </>
  );
}

describe('useFocusWithin', () => {
  it('counts focus in a portal that the element rendered as within it', async () => {
    const user = userEvent.setup();
    const onLeave = vi.fn();
    render(<Area onLeave={onLeave} />);

    await user.click(screen.getByRole('button', { name: 'Inside' }));
    await user.click(screen.getByRole('button', { name: 'In a popup' }));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(screen.getByTestId('area')).toHaveAttribute('data-within', 'true');
    expect(onLeave).not.toHaveBeenCalled();
  });

  it('settles leaving a task later, telling what focus went to', async () => {
    const user = userEvent.setup();
    const onLeave = vi.fn();
    render(<Area onLeave={onLeave} />);

    await user.click(screen.getByRole('button', { name: 'In a popup' }));
    const outside = screen.getByRole('button', { name: 'Outside' });
    await user.click(outside);

    await waitFor(() => expect(onLeave).toHaveBeenCalledTimes(1));
    expect(onLeave).toHaveBeenCalledWith(outside);
    expect(screen.getByTestId('area')).toHaveAttribute('data-within', 'false');
  });
});
