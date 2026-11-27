import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Popover, PopoverContent, PopoverTrigger } from '../../../Popover';
import {
  BlockDeleteButton,
  BlockSettingsButton,
} from '../richText/blockButtons';

describe("a block's settings button", () => {
  it('shows the selected colour while the settings it opens are open', async () => {
    const user = userEvent.setup();
    render(
      <Popover>
        <PopoverTrigger
          nativeButton
          render={<BlockSettingsButton name="Field settings" />}
        />
        <PopoverContent aria-label="Field settings">Settings</PopoverContent>
      </Popover>,
    );
    const button = screen.getByRole('button', { name: 'Field settings' });
    // Enter on the selected block presses it.
    expect(button).toHaveAttribute('data-block-action');
    expect(button).not.toHaveClass('bg-selected');

    await user.click(button);
    await screen.findByRole('dialog', { name: 'Field settings' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveClass('bg-selected');

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(button).toHaveAttribute('aria-expanded', 'false'),
    );
    expect(button).not.toHaveClass('bg-selected');
  });
});

describe("a block's delete button", () => {
  it('is a destructive button named by what it deletes', async () => {
    const remove = vi.fn();
    const user = userEvent.setup();
    render(
      <BlockDeleteButton onClick={remove}>Delete field</BlockDeleteButton>,
    );
    const button = screen.getByRole('button', { name: 'Delete field' });
    expect(button).toHaveAttribute('type', 'button');
    await user.click(button);
    expect(remove).toHaveBeenCalledOnce();
  });
});
