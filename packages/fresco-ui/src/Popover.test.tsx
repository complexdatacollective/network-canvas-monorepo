import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from './Popover';

describe('Popover', () => {
  /** The popup is a `role="dialog"`, and one with no name is announced as nothing. */
  it('names the popup after its PopoverTitle', async () => {
    render(
      <Popover>
        <PopoverTrigger>Open filters</PopoverTrigger>
        <PopoverContent>
          <PopoverTitle>Filter sessions</PopoverTitle>
          <p>Narrow the list.</p>
        </PopoverContent>
      </Popover>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Open filters' }));

    expect(
      await screen.findByRole('dialog', { name: 'Filter sessions' }),
    ).toBeInTheDocument();
  });

  it('names the popup from aria-label when there is no heading to point at', async () => {
    render(
      <Popover>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent aria-label="Anchored bottom">Anchored</PopoverContent>
      </Popover>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Open' }));

    expect(
      await screen.findByRole('dialog', { name: 'Anchored bottom' }),
    ).toBeInTheDocument();
  });

  /**
   * Prose and forms get the roomy padding; a popup that holds a list of
   * options asks for the padding menus and comboboxes use.
   */
  it('pads the popup for prose unless a smaller spacing is asked for', async () => {
    render(
      <>
        <Popover>
          <PopoverTrigger>Open help</PopoverTrigger>
          <PopoverContent aria-label="Help">Some prose.</PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger>Open list</PopoverTrigger>
          <PopoverContent aria-label="List" spacing="xs">
            A list of options.
          </PopoverContent>
        </Popover>
      </>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Open help' }));
    const help = await screen.findByRole('dialog', { name: 'Help' });
    // The padding is on the surface inside the dialog, which holds the content.
    const helpSurface = within(help).getByText('Some prose.');
    expect(helpSurface).toHaveClass('px-8', 'py-6');

    await userEvent.click(screen.getByRole('button', { name: 'Open list' }));
    const list = await screen.findByRole('dialog', { name: 'List' });
    const listSurface = within(list).getByText('A list of options.');
    expect(listSurface).toHaveClass('px-4', 'py-3');
    expect(listSurface).not.toHaveClass('px-8', 'py-6');
  });
});
