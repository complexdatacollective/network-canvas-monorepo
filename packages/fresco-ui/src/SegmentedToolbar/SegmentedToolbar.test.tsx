import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pencil, Snowflake, Undo2 } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import { SegmentedToolbar, type ToolbarSegment } from './SegmentedToolbar';

describe('SegmentedToolbar — buttons & separators', () => {
  it('renders a labelled toolbar with its button segments', () => {
    const items: ToolbarSegment[] = [
      {
        type: 'button',
        id: 'edit',
        label: 'Edit',
        icon: <Pencil />,
        onClick: vi.fn(),
      },
      { type: 'separator', id: 'sep-1' },
      {
        type: 'button',
        id: 'undo',
        label: 'Undo',
        icon: <Undo2 />,
        onClick: vi.fn(),
      },
    ];
    render(<SegmentedToolbar label="Drawing tools" items={items} />);

    const toolbar = screen.getByRole('toolbar', { name: 'Drawing tools' });
    expect(toolbar).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('fires onClick for a button segment', async () => {
    const onClick = vi.fn();
    const items: ToolbarSegment[] = [
      {
        type: 'button',
        id: 'freeze',
        label: 'Freeze',
        icon: <Snowflake />,
        onClick,
      },
    ];
    render(<SegmentedToolbar label="Tools" items={items} />);

    await userEvent.click(screen.getByRole('button', { name: 'Freeze' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('renders visible text when there is no icon', () => {
    const items: ToolbarSegment[] = [
      { type: 'button', id: 'done', label: 'Done', onClick: vi.fn() },
    ];
    render(<SegmentedToolbar label="Tools" items={items} />);
    // Label is visible text, not only an accessible name.
    expect(screen.getByText('Done')).toBeVisible();
  });

  it('moves focus between segments with the arrow keys (roving focus)', async () => {
    const items: ToolbarSegment[] = [
      { type: 'button', id: 'a', label: 'A', onClick: vi.fn() },
      { type: 'button', id: 'b', label: 'B', onClick: vi.fn() },
    ];
    render(<SegmentedToolbar label="Tools" items={items} />);

    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'A' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'B' })).toHaveFocus();
  });
});

describe('SegmentedToolbar — toggles', () => {
  it('reflects controlled pressed state via aria-pressed', () => {
    const items: ToolbarSegment[] = [
      {
        type: 'toggle',
        id: 'freeze',
        label: 'Freeze',
        icon: <Snowflake />,
        pressed: true,
      },
    ];
    render(<SegmentedToolbar label="Tools" items={items} />);
    expect(screen.getByRole('button', { name: 'Freeze' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('calls onPressedChange when toggled', async () => {
    const onPressedChange = vi.fn();
    const items: ToolbarSegment[] = [
      {
        type: 'toggle',
        id: 'freeze',
        label: 'Freeze',
        icon: <Snowflake />,
        defaultPressed: false,
        onPressedChange,
      },
    ];
    render(<SegmentedToolbar label="Tools" items={items} />);
    await userEvent.click(screen.getByRole('button', { name: 'Freeze' }));
    expect(onPressedChange).toHaveBeenCalledWith(true);
  });
});
