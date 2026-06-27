import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
