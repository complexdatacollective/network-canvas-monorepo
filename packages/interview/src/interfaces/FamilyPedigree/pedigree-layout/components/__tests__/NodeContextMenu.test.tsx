import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import NodeContextMenu from '../NodeContextMenu';

const open = async () => userEvent.click(screen.getByRole('button'));

describe('NodeContextMenu — Add sibling discoverability', () => {
  it('renders Add sibling enabled when canAddSibling is true', async () => {
    const onAction = vi.fn();
    render(
      <NodeContextMenu
        isEgo={false}
        isFinalized={false}
        canAddSibling
        onAction={onAction}
      >
        <button>n</button>
      </NodeContextMenu>,
    );
    await open();
    await userEvent.click(await screen.findByText('Add sibling'));
    expect(onAction).toHaveBeenCalledWith('sibling');
  });

  it('renders Add sibling disabled with a hint when canAddSibling is false', async () => {
    const onAction = vi.fn();
    render(
      <NodeContextMenu
        isEgo={false}
        isFinalized={false}
        canAddSibling={false}
        onAction={onAction}
      >
        <button>n</button>
      </NodeContextMenu>,
    );
    await open();
    expect(await screen.findByText(/add a parent first/i)).toBeInTheDocument();
    await userEvent.click(screen.getByText('Add sibling'));
    expect(onAction).not.toHaveBeenCalledWith('sibling');
  });
});
