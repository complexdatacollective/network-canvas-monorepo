import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Grid3x3,
  List,
  Map as MapIcon,
  Pencil,
  Snowflake,
  Trash2,
  Undo2,
} from 'lucide-react';
import { cloneElement, type ReactElement } from 'react';
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

describe('SegmentedToolbar — hosted (render) button', () => {
  it('hosts a button segment inside a caller-supplied element', async () => {
    // Mirrors the Narrative preset switcher, whose label button lives inside a
    // Popover trigger. The wrapper receives the styled toolbar button as its
    // `render`, and its behaviour (here, an onClick) composes with the segment.
    const onTriggerClick = vi.fn();
    // A wrapper that *becomes* the styled toolbar button (as Base UI triggers
    // do), attaching its own behaviour — here a click handler.
    function TriggerWrapper({
      render: target,
    }: {
      render?: ReactElement<{ onClick?: () => void }>;
    }) {
      return target ? cloneElement(target, { onClick: onTriggerClick }) : null;
    }

    const items: ToolbarSegment[] = [
      {
        type: 'button',
        id: 'label',
        label: 'Social Network',
        showLabel: true,
        render: <TriggerWrapper />,
      },
    ];
    render(<SegmentedToolbar label="Presets" items={items} />);

    const button = screen.getByRole('button', { name: 'Social Network' });
    expect(button).toBeInTheDocument();
    await userEvent.click(button);
    expect(onTriggerClick).toHaveBeenCalledOnce();
  });
});

describe('SegmentedToolbar — colour', () => {
  it('forwards a segment className (e.g. named theme colours) to the control', () => {
    const items: ToolbarSegment[] = [
      {
        type: 'button',
        id: 'delete',
        label: 'Delete',
        icon: <Trash2 />,
        className: 'bg-tomato text-white',
        onClick: vi.fn(),
      },
    ];
    render(<SegmentedToolbar label="Tools" items={items} />);
    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button).toHaveClass('bg-tomato');
    expect(button).toHaveClass('text-white');
  });
});

const groupItems = (onValueChange = vi.fn()): ToolbarSegment[] => [
  {
    type: 'group',
    id: 'view',
    mode: 'single',
    defaultValue: ['list'],
    onValueChange,
    options: [
      { value: 'list', label: 'List', icon: <List /> },
      { value: 'grid', label: 'Grid', icon: <Grid3x3 /> },
      { value: 'map', label: 'Map', icon: <MapIcon /> },
    ],
  },
];

describe('SegmentedToolbar — groups', () => {
  it('renders one button per option with the default pressed', () => {
    render(<SegmentedToolbar label="View" items={groupItems()} />);
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('single mode replaces selection on change', async () => {
    const onValueChange = vi.fn();
    render(<SegmentedToolbar label="View" items={groupItems(onValueChange)} />);
    await userEvent.click(screen.getByRole('button', { name: 'Grid' }));
    expect(onValueChange).toHaveBeenCalledWith(['grid']);
  });
});

describe('SegmentedToolbar — add/remove', () => {
  it('adds and removes segments when items change', () => {
    const base: ToolbarSegment[] = [
      { type: 'button', id: 'a', label: 'A', onClick: vi.fn() },
    ];
    const { rerender } = render(
      <SegmentedToolbar label="Tools" items={base} />,
    );
    expect(screen.queryByRole('button', { name: 'B' })).not.toBeInTheDocument();

    rerender(
      <SegmentedToolbar
        label="Tools"
        items={[
          ...base,
          { type: 'button', id: 'b', label: 'B', onClick: vi.fn() },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'B' })).toBeInTheDocument();

    rerender(<SegmentedToolbar label="Tools" items={base} />);
    expect(screen.queryByRole('button', { name: 'B' })).not.toBeInTheDocument();
  });
});

describe('SegmentedToolbar — draggable', () => {
  const items: ToolbarSegment[] = [
    { type: 'button', id: 'a', label: 'A', onClick: vi.fn() },
  ];

  it('renders no drag handle by default', () => {
    render(<SegmentedToolbar label="Tools" items={items} />);
    expect(
      screen.queryByRole('button', { name: 'Move toolbar' }),
    ).not.toBeInTheDocument();
  });

  it('renders a labelled drag handle when draggable', () => {
    render(<SegmentedToolbar label="Tools" items={items} draggable />);
    expect(
      screen.getByRole('button', { name: 'Move toolbar' }),
    ).toBeInTheDocument();
  });

  it('uses a custom drag handle label', () => {
    render(
      <SegmentedToolbar
        label="Tools"
        items={items}
        draggable
        dragHandleLabel="Reposition"
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Reposition' }),
    ).toBeInTheDocument();
  });

  it('reports a position change for each arrow-key nudge from the focused handle', async () => {
    const onPositionChange = vi.fn();
    render(
      <SegmentedToolbar
        label="Tools"
        items={items}
        draggable
        defaultPosition={{ x: 0, y: 0 }}
        onPositionChange={onPositionChange}
      />,
    );
    const handle = screen.getByRole('button', { name: 'Move toolbar' });
    handle.focus();
    // Motion owns the live position and is mocked in unit tests, so each nudge
    // reports its delta from the origin; cumulative motion is exercised visually
    // in Storybook.
    await userEvent.keyboard('{ArrowRight}');
    expect(onPositionChange).toHaveBeenLastCalledWith({ x: 8, y: 0 });
    await userEvent.keyboard('{ArrowDown}');
    expect(onPositionChange).toHaveBeenLastCalledWith({ x: 0, y: 8 });
  });

  it('announces movement via an aria-live region', async () => {
    render(<SegmentedToolbar label="Tools" items={items} draggable />);
    screen.getByRole('button', { name: 'Move toolbar' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('status')).toHaveTextContent(/moved/i);
  });
});
