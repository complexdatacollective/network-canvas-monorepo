import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from './DropdownMenu';

describe('DropdownMenuRadioItem', () => {
  it('marks only the checked item’s tick as shown', async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger render={<button>open</button>} />
        <DropdownMenuContent>
          <DropdownMenuRadioGroup value="bottom">
            <DropdownMenuRadioItem value="top">Top</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="bottom">Bottom</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await userEvent.click(screen.getByText('open'));

    const indicator = async (name: string) => {
      const item = await screen.findByRole('menuitemradio', { name });
      const tick = item.querySelector('svg');
      return tick?.parentElement;
    };
    // Both ticks stay mounted to reserve their space; the unchecked one is
    // hidden through its data attribute.
    const top = await indicator('Top');
    const bottom = await indicator('Bottom');
    expect(top).toHaveAttribute('data-unchecked');
    expect(top).toHaveClass('data-unchecked:invisible');
    expect(bottom).toHaveAttribute('data-checked');
    expect(bottom).not.toHaveAttribute('data-unchecked');
  });

  it('shows a custom icon on every item, checked or not', async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger render={<button>open</button>} />
        <DropdownMenuContent>
          <DropdownMenuRadioGroup value="asc">
            <DropdownMenuRadioItem value="asc" icon={<svg />}>
              Ascending
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="desc" icon={<svg />}>
              Descending
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await userEvent.click(screen.getByText('open'));

    const item = await screen.findByRole('menuitemradio', {
      name: 'Descending',
    });
    const indicator = item.querySelector('svg')?.parentElement;
    expect(indicator).toHaveAttribute('data-unchecked');
    expect(indicator).not.toHaveClass('data-unchecked:invisible');
  });
});
