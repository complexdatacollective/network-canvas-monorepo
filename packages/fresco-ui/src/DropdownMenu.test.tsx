import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from './DropdownMenu';

describe('DropdownMenuItem', () => {
  it('does not fire onClick for a disabled item', async () => {
    const onClick = vi.fn();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger render={<button>open</button>} />
        <DropdownMenuContent>
          <DropdownMenuItem disabled onClick={onClick}>
            Add sibling
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await userEvent.click(screen.getByText('open'));
    await userEvent.click(await screen.findByText('Add sibling'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('carries data-disabled attribute when disabled', async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger render={<button>open</button>} />
        <DropdownMenuContent>
          <DropdownMenuItem disabled>Add sibling</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await userEvent.click(screen.getByText('open'));
    expect(await screen.findByText('Add sibling')).toHaveAttribute(
      'data-disabled',
    );
  });
});

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
});
