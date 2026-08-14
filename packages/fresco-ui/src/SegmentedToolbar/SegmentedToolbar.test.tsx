import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Grid3x3,
  List,
  Map as MapIcon,
  Pencil,
  Snowflake,
  Spline,
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

  it('renders a menu segment whose trigger opens single-select options', async () => {
    const onSelect = vi.fn();
    const items: ToolbarSegment[] = [
      {
        type: 'menu',
        id: 'edge',
        label: 'Draw edge',
        icon: <Spline />,
        value: 'friendship',
        options: [
          { value: 'friendship', label: 'Friendship' },
          { value: 'advice', label: 'Advice' },
        ],
        onSelect,
      },
    ];
    render(<SegmentedToolbar label="Tools" items={items} />);
    const trigger = screen.getByRole('button', { name: 'Draw edge' });
    // The trigger must advertise that it opens a menu, even though it renders a
    // custom Button component rather than a native <button>.
    expect(trigger).toHaveAttribute('aria-haspopup');
    await userEvent.click(trigger);
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: 'Advice' }),
    );
    expect(onSelect).toHaveBeenCalledWith('advice');
  });

  it('renders a popover segment that advertises a popup and shows its content when open', () => {
    const items: ToolbarSegment[] = [
      {
        type: 'popover',
        id: 'add',
        label: 'Add node',
        icon: <Pencil />,
        pressed: true,
        open: true,
        onOpenChange: vi.fn(),
        children: <input aria-label="Name" />,
      },
    ];
    render(<SegmentedToolbar label="Tools" items={items} />);
    const trigger = screen.getByRole('button', { name: 'Add node' });
    expect(trigger).toHaveAttribute('aria-haspopup');
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument();
  });

  it('calls onOpenChange when the popover trigger is clicked', async () => {
    const onOpenChange = vi.fn();
    const items: ToolbarSegment[] = [
      {
        type: 'popover',
        id: 'add',
        label: 'Add node',
        icon: <Pencil />,
        open: false,
        onOpenChange,
        children: <input aria-label="Name" />,
      },
    ];
    render(<SegmentedToolbar label="Tools" items={items} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add node' }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
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

  it('renders a caller-supplied component segment inside the toolbar', () => {
    const items: ToolbarSegment[] = [
      {
        type: 'component',
        id: 'preview',
        component: ({ orientation, size }) => (
          <button type="button">{`${orientation} ${size}`}</button>
        ),
      },
    ];

    render(
      <SegmentedToolbar
        label="Tools"
        items={items}
        orientation="vertical"
        size="lg"
      />,
    );

    expect(
      screen.getByRole('button', { name: 'vertical lg' }),
    ).toBeInTheDocument();
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
    expect(onPressedChange).toHaveBeenCalledWith(true, expect.anything());
  });

  // Regression: the toggle segment's onPressedChange used to be wrapped in
  // `(pressed) => segment.onPressedChange?.(pressed)`, which silently
  // dropped Base UI's second `eventDetails` argument (the object a consumer
  // needs to call `eventDetails.cancel()` and veto the change). Forwarding
  // the segment's callback directly — the same pattern already used for
  // button segments' `onClick` — passes through everything Base UI provides.
  it('forwards the eventDetails argument Base UI provides to onPressedChange', async () => {
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

    expect(onPressedChange).toHaveBeenCalledTimes(1);
    const [, eventDetails] = onPressedChange.mock.calls[0] as [
      boolean,
      { cancel: () => void },
    ];
    expect(eventDetails).toBeDefined();
    expect(typeof eventDetails.cancel).toBe('function');
  });

  it('disables a controlled toggle segment that omits its callback', async () => {
    // A controlled `pressed` prop with no `onPressedChange` is exactly the
    // hazard the audit flagged: Base UI cannot update `pressed` in response
    // to a click, so the toggle can never visually change state. Rather than
    // leave a live-looking control wired to nothing, it's disabled outright.
    const items: ToolbarSegment[] = [
      {
        type: 'toggle',
        id: 'freeze',
        label: 'Freeze',
        icon: <Snowflake />,
        pressed: false,
      },
    ];
    render(<SegmentedToolbar label="Tools" items={items} />);
    const button = screen.getByRole('button', { name: 'Freeze' });
    // Disabled segments stay focusable and say so with `aria-disabled` rather
    // than the native attribute — see the focus-retention tests below.
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('leaves an uncontrolled toggle segment (no pressed prop) enabled even without a callback', () => {
    // Only the controlled+callback-less combination is inert. Base UI
    // manages an uncontrolled toggle's state itself, so a tap still works
    // even when the consumer isn't listening for the change.
    const items: ToolbarSegment[] = [
      {
        type: 'toggle',
        id: 'freeze',
        label: 'Freeze',
        icon: <Snowflake />,
        defaultPressed: false,
      },
    ];
    render(<SegmentedToolbar label="Tools" items={items} />);
    expect(screen.getByRole('button', { name: 'Freeze' })).toBeEnabled();
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
  it('retains the text variant hover behavior when variant is omitted', () => {
    const items: ToolbarSegment[] = [
      {
        type: 'button',
        id: 'edit',
        label: 'Edit',
        icon: <Pencil />,
        onClick: vi.fn(),
      },
    ];
    render(<SegmentedToolbar label="Tools" items={items} />);

    expect(screen.getByRole('button', { name: 'Edit' })).toHaveClass(
      'hover:enabled:bg-(--component-text)',
    );
  });

  it('uses the supplied variant without a text-button hover override', () => {
    const items: ToolbarSegment[] = [
      {
        type: 'button',
        id: 'delete',
        label: 'Delete',
        icon: <Trash2 />,
        variant: 'default',
        className: 'bg-tomato text-white',
        onClick: vi.fn(),
      },
    ];
    render(<SegmentedToolbar label="Tools" items={items} />);

    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button).toHaveClass('bg-tomato');
    expect(button).toHaveClass('text-white');
    expect(button).not.toHaveClass('hover:enabled:bg-(--component-text)');
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
    expect(onValueChange).toHaveBeenCalledWith(['grid'], expect.anything());
  });

  // Regression: the group segment's onValueChange used to be wrapped in
  // `(value) => segment.onValueChange?.(value)`, which silently dropped Base
  // UI's second `eventDetails` argument. Forwarding the segment's callback
  // directly — the same pattern already used for button segments' `onClick`
  // — passes through everything Base UI provides.
  it('forwards the eventDetails argument Base UI provides to onValueChange', async () => {
    const onValueChange = vi.fn();
    render(<SegmentedToolbar label="View" items={groupItems(onValueChange)} />);
    await userEvent.click(screen.getByRole('button', { name: 'Grid' }));

    expect(onValueChange).toHaveBeenCalledTimes(1);
    const [, eventDetails] = onValueChange.mock.calls[0] as [
      string[],
      { cancel: () => void },
    ];
    expect(eventDetails).toBeDefined();
    expect(typeof eventDetails.cancel).toBe('function');
  });

  it('disables every option when a controlled group segment omits its callback', async () => {
    // Same hazard as a controlled toggle without onPressedChange: a
    // controlled `value` with no `onValueChange` can never change, so every
    // option in the group is disabled rather than left live-looking.
    const items: ToolbarSegment[] = [
      {
        type: 'group',
        id: 'view',
        mode: 'single',
        value: ['list'],
        options: [
          { value: 'list', label: 'List', icon: <List /> },
          { value: 'grid', label: 'Grid', icon: <Grid3x3 /> },
        ],
      },
    ];
    render(<SegmentedToolbar label="View" items={items} />);
    const grid = screen.getByRole('button', { name: 'Grid' });
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(grid).toHaveAttribute('aria-disabled', 'true');
    // `aria-disabled` alone would only be a claim; the option must actually be
    // inert, since it is no longer the browser enforcing that.
    await userEvent.click(grid);
    expect(grid).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('SegmentedToolbar — disabled segments', () => {
  // A disabled segment stays in the toolbar's roving focus (Base UI's
  // `focusableWhenDisabled`, the APG toolbar behaviour), so it must never be
  // natively disabled: browsers blur a focused element the moment it becomes
  // disabled, which would dump a keyboard user who exhausts an action — say,
  // pressing Undo until there is nothing left to undo — onto <body>.
  //
  // jsdom does not implement that blur, so these tests pin the *cause*: no
  // `disabled` attribute, ever, not even for the single commit Base UI takes
  // to delete it again. The focus outcome itself is pinned in the browser, in
  // SegmentedToolbar.stories.tsx.

  /** Records every mutation of the `disabled` attribute on `element`. */
  function watchDisabled(element: Element) {
    const observer = new MutationObserver(() => undefined);
    observer.observe(element, { attributes: true, attributeOldValue: true });
    return () => {
      const changes = observer
        .takeRecords()
        .filter((record) => record.attributeName === 'disabled')
        .map((record) => (record.oldValue === null ? 'added' : 'removed'));
      observer.disconnect();
      return changes;
    };
  }

  const disabledSegments: Array<
    [string, (disabled: boolean) => ToolbarSegment]
  > = [
    [
      'Undo',
      (disabled) => ({
        type: 'button',
        id: 'undo',
        label: 'Undo',
        icon: <Undo2 />,
        disabled,
        onClick: vi.fn(),
      }),
    ],
    [
      'Freeze',
      (disabled) => ({
        type: 'toggle',
        id: 'freeze',
        label: 'Freeze',
        icon: <Snowflake />,
        pressed: false,
        onPressedChange: vi.fn(),
        disabled,
      }),
    ],
    [
      'List',
      (disabled) => ({
        type: 'group',
        id: 'view',
        mode: 'single',
        value: [],
        onValueChange: vi.fn(),
        options: [{ value: 'list', label: 'List', icon: <List />, disabled }],
      }),
    ],
    [
      'Draw edge',
      (disabled) => ({
        type: 'menu',
        id: 'edge',
        label: 'Draw edge',
        icon: <Spline />,
        options: [{ value: 'friendship', label: 'Friendship' }],
        onSelect: vi.fn(),
        disabled,
      }),
    ],
    [
      'Add node',
      (disabled) => ({
        type: 'popover',
        id: 'add',
        label: 'Add node',
        icon: <Trash2 />,
        open: false,
        onOpenChange: vi.fn(),
        children: <input aria-label="Name" />,
        disabled,
      }),
    ],
  ];

  it.each(disabledSegments)(
    'never applies a native disabled attribute to a %s segment that becomes disabled',
    (name, makeSegment) => {
      const { rerender } = render(
        <SegmentedToolbar label="Tools" items={[makeSegment(false)]} />,
      );
      const button = screen.getByRole('button', { name });
      const readDisabledChanges = watchDisabled(button);

      rerender(<SegmentedToolbar label="Tools" items={[makeSegment(true)]} />);

      // Not "added then removed" — added at all is what loses focus.
      expect(readDisabledChanges()).toEqual([]);
      expect(button).not.toBeDisabled();
      // The segment stays reachable, and says it is unavailable.
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveAttribute('tabindex', '0');
    },
  );

  it('does not fire a disabled button segment that was activated while enabled', async () => {
    // The reported case: Undo is activated repeatedly until the history runs
    // out and the segment disables under the pointer/keyboard.
    const onClick = vi.fn();
    const items = (disabled: boolean): ToolbarSegment[] => [
      {
        type: 'button',
        id: 'undo',
        label: 'Undo',
        icon: <Undo2 />,
        disabled,
        onClick,
      },
    ];
    const { rerender } = render(
      <SegmentedToolbar label="Tools" items={items(false)} />,
    );
    const button = screen.getByRole('button', { name: 'Undo' });

    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(<SegmentedToolbar label="Tools" items={items(true)} />);
    await userEvent.click(button);
    await userEvent.type(button, '{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps an enabled segment free of the disabled affordances', () => {
    const items: ToolbarSegment[] = [
      {
        type: 'button',
        id: 'undo',
        label: 'Undo',
        icon: <Undo2 />,
        onClick: vi.fn(),
      },
    ];
    render(<SegmentedToolbar label="Tools" items={items} />);
    const button = screen.getByRole('button', { name: 'Undo' });
    expect(button).not.toHaveAttribute('aria-disabled');
    expect(button.className).not.toMatch(/aria-disabled:/);
  });
});

describe('SegmentedToolbar — add/remove', () => {
  it('adds and removes segments when items change', async () => {
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
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'B' }),
      ).not.toBeInTheDocument();
    });
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
    // Motion owns the live position, so keyboard nudges accumulate from the
    // current position just as pointer drags do.
    await userEvent.keyboard('{ArrowRight}');
    expect(onPositionChange).toHaveBeenLastCalledWith({ x: 8, y: 0 });
    await userEvent.keyboard('{ArrowDown}');
    expect(onPositionChange).toHaveBeenLastCalledWith({ x: 8, y: 8 });
  });

  it('announces movement via an aria-live region', async () => {
    render(<SegmentedToolbar label="Tools" items={items} draggable />);
    screen.getByRole('button', { name: 'Move toolbar' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('status')).toHaveTextContent(/moved/i);
  });
});
