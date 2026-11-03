import { render, screen } from '@testing-library/react';
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
});
