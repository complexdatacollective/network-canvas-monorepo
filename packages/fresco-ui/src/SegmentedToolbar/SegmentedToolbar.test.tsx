import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Grid3x3, List, Pencil, Redo2, Undo2 } from 'lucide-react';
import { createRef, type Ref, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { DropdownMenuItem } from '../DropdownMenu';
import {
  defineToolbarChild,
  SegmentedToolbar,
  ToolbarButton,
  ToolbarGroup,
  ToolbarIconButton,
  ToolbarMenu,
  ToolbarPopover,
  ToolbarSeparator,
  ToolbarToggleGroup,
} from './SegmentedToolbar';

describe('SegmentedToolbar — composition', () => {
  it('renders composable styled buttons inside an accessible toolbar', () => {
    render(
      <SegmentedToolbar aria-label="Editing tools">
        <ToolbarButton icon={<Pencil />}>Edit</ToolbarButton>
        <ToolbarIconButton aria-label="Undo" icon={<Undo2 />} />
      </SegmentedToolbar>,
    );

    expect(
      screen.getByRole('toolbar', { name: 'Editing tools' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveClass(
      'font-heading',
      'rounded-full',
    );
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveClass(
      'aspect-square',
      'rounded-full',
    );
  });

  it('renders named Base UI groups and explicit separators', () => {
    render(
      <SegmentedToolbar aria-label="Editing tools">
        <ToolbarGroup aria-label="History">
          <ToolbarIconButton aria-label="Undo" icon={<Undo2 />} />
        </ToolbarGroup>
        <ToolbarSeparator />
        <ToolbarGroup aria-label="Editing">
          <ToolbarIconButton aria-label="Edit" icon={<Pencil />} />
        </ToolbarGroup>
      </SegmentedToolbar>,
    );

    expect(screen.getByRole('group', { name: 'History' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Editing' })).toBeInTheDocument();
    expect(screen.getByRole('separator')).toHaveAttribute(
      'aria-orientation',
      'vertical',
    );
  });

  it('turns separators horizontal in a vertical toolbar', () => {
    render(
      <SegmentedToolbar aria-label="Editing tools" orientation="vertical">
        <ToolbarIconButton aria-label="Undo" icon={<Undo2 />} />
        <ToolbarSeparator />
        <ToolbarIconButton aria-label="Redo" icon={<Redo2 />} />
      </SegmentedToolbar>,
    );

    expect(screen.getByRole('separator')).toHaveAttribute(
      'aria-orientation',
      'horizontal',
    );
  });

  it('inherits the toolbar size unless a control overrides it', () => {
    render(
      <SegmentedToolbar aria-label="Editing tools" size="lg">
        <ToolbarButton>Inherited</ToolbarButton>
        <ToolbarButton size="sm">Overridden</ToolbarButton>
      </SegmentedToolbar>,
    );

    expect(screen.getByRole('button', { name: 'Inherited' })).toHaveClass(
      'h-16',
    );
    expect(screen.getByRole('button', { name: 'Overridden' })).toHaveClass(
      'h-10',
    );
  });

  it.each([
    ['sm', '26px'],
    ['md', '30px'],
    ['lg', '38px'],
  ] as const)(
    'publishes the %s surface radius as a numeric style for Motion scale correction',
    (size, radius) => {
      render(
        <SegmentedToolbar aria-label={`${size} tools`} size={size}>
          <ToolbarButton>Save</ToolbarButton>
        </SegmentedToolbar>,
      );

      expect(
        screen.getByRole('toolbar', { name: `${size} tools` }).parentElement,
      ).toHaveStyle({ borderRadius: radius });
    },
  );

  it('moves focus between controls with the arrow keys', async () => {
    render(
      <SegmentedToolbar aria-label="Editing tools">
        <ToolbarIconButton aria-label="Undo" icon={<Undo2 />} />
        <ToolbarIconButton aria-label="Redo" icon={<Redo2 />} />
      </SegmentedToolbar>,
    );

    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'Redo' })).toHaveFocus();
  });

  it('throws when a child component is rendered outside the toolbar', () => {
    expect(() => render(<ToolbarButton>Save</ToolbarButton>)).toThrow(
      'ToolbarButton must be rendered inside SegmentedToolbar.',
    );
  });

  it('rejects unregistered wrapper components that cannot receive the presence ref', () => {
    function BrokenWrapper() {
      return <ToolbarButton>Save</ToolbarButton>;
    }

    expect(() =>
      render(
        <SegmentedToolbar aria-label="Editing tools">
          <BrokenWrapper />
        </SegmentedToolbar>,
      ),
    ).toThrow(
      'Custom wrappers must declare and forward a ref, then be registered with defineToolbarChild().',
    );
  });

  it('registers a typed custom wrapper whose ref reaches its DOM control', () => {
    type WrappedButtonProps = { ref?: Ref<HTMLButtonElement> };
    const WrappedButton = defineToolbarChild(function WrappedButton({
      ref,
    }: WrappedButtonProps) {
      return <ToolbarButton ref={ref}>Save</ToolbarButton>;
    });
    const ref = createRef<HTMLButtonElement>();

    render(
      <SegmentedToolbar aria-label="Editing tools">
        <WrappedButton ref={ref} />
      </SegmentedToolbar>,
    );

    expect(ref.current).toBe(screen.getByRole('button', { name: 'Save' }));
  });

  it('requires custom wrappers to declare a ref prop at compile time', () => {
    function MissingRefProp() {
      return <ToolbarButton>Save</ToolbarButton>;
    }
    const compileOnly = () => {
      // @ts-expect-error Motion popLayout children must declare a ref prop.
      defineToolbarChild(MissingRefProp);
    };

    expect(compileOnly).toBeTypeOf('function');
  });
});

describe('SegmentedToolbar — overlays', () => {
  it('passes React 19 ref props through to the trigger DOM nodes', () => {
    const menuRef = createRef<HTMLButtonElement>();
    const popoverRef = createRef<HTMLButtonElement>();
    const triggerRef = createRef<HTMLButtonElement>();

    render(
      <SegmentedToolbar aria-label="Editing tools">
        <ToolbarMenu
          ref={menuRef}
          trigger={
            <ToolbarIconButton
              ref={triggerRef}
              aria-label="More actions"
              icon={<Pencil />}
            />
          }
        >
          <DropdownMenuItem>Duplicate</DropdownMenuItem>
        </ToolbarMenu>
        <ToolbarPopover
          ref={popoverRef}
          trigger={
            <ToolbarIconButton aria-label="Canvas settings" icon={<Pencil />} />
          }
        >
          <p>Canvas settings</p>
        </ToolbarPopover>
      </SegmentedToolbar>,
    );

    expect(menuRef.current).toBe(
      screen.getByRole('button', { name: 'More actions' }),
    );
    expect(triggerRef.current).toBe(menuRef.current);
    expect(popoverRef.current).toBe(
      screen.getByRole('button', { name: 'Canvas settings' }),
    );
  });

  it('composes an animated toolbar control with a dropdown menu', async () => {
    const onDuplicate = vi.fn();
    render(
      <SegmentedToolbar aria-label="Editing tools">
        <ToolbarMenu
          trigger={
            <ToolbarIconButton aria-label="More actions" icon={<Pencil />} />
          }
        >
          <DropdownMenuItem onClick={onDuplicate}>Duplicate</DropdownMenuItem>
        </ToolbarMenu>
      </SegmentedToolbar>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    const duplicate = await screen.findByRole('menuitem', {
      name: 'Duplicate',
    });
    await userEvent.click(duplicate);
    expect(onDuplicate).toHaveBeenCalledOnce();
  });

  it('composes an animated toolbar control with a popover', async () => {
    render(
      <SegmentedToolbar aria-label="Editing tools">
        <ToolbarPopover
          trigger={
            <ToolbarIconButton aria-label="Canvas settings" icon={<Pencil />} />
          }
        >
          <p>Adjust how the canvas is displayed.</p>
        </ToolbarPopover>
      </SegmentedToolbar>,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Canvas settings' }),
    );
    expect(
      await screen.findByText('Adjust how the canvas is displayed.'),
    ).toBeInTheDocument();
  });
});

describe('SegmentedToolbar — toggle groups', () => {
  it('renders toolbar controls as toggles and changes selection', async () => {
    const onValueChange = vi.fn();
    render(
      <SegmentedToolbar aria-label="View tools">
        <ToolbarToggleGroup
          aria-label="View"
          defaultValue={['list']}
          onValueChange={onValueChange}
        >
          <ToolbarIconButton value="list" aria-label="List" icon={<List />} />
          <ToolbarIconButton
            value="grid"
            aria-label="Grid"
            icon={<Grid3x3 />}
          />
        </ToolbarToggleGroup>
      </SegmentedToolbar>,
    );

    const list = screen.getByRole('button', { name: 'List' });
    const grid = screen.getByRole('button', { name: 'Grid' });
    expect(list).toHaveAttribute('aria-pressed', 'true');
    expect(grid).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(grid);
    expect(list).toHaveAttribute('aria-pressed', 'false');
    expect(grid).toHaveAttribute('aria-pressed', 'true');
    expect(onValueChange).toHaveBeenCalledWith(['grid'], expect.anything());
  });

  it('supports a standalone toggle button', async () => {
    render(
      <SegmentedToolbar aria-label="Editing tools">
        <ToolbarButton defaultPressed={false}>Freeze layout</ToolbarButton>
      </SegmentedToolbar>,
    );

    const toggle = screen.getByRole('button', { name: 'Freeze layout' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  it('requires values on controls inside a toggle group', () => {
    expect(() =>
      render(
        <SegmentedToolbar aria-label="View tools">
          <ToolbarToggleGroup aria-label="View">
            <ToolbarIconButton aria-label="List" icon={<List />} />
          </ToolbarToggleGroup>
        </SegmentedToolbar>,
      ),
    ).toThrow(
      'ToolbarButton and ToolbarIconButton require a value inside ToolbarToggleGroup.',
    );
  });

  it('disables a controlled toggle group without an onValueChange callback', () => {
    render(
      <SegmentedToolbar aria-label="View tools">
        <ToolbarToggleGroup aria-label="View" value={['list']}>
          <ToolbarIconButton value="list" aria-label="List" icon={<List />} />
          <ToolbarIconButton
            value="grid"
            aria-label="Grid"
            icon={<Grid3x3 />}
          />
        </ToolbarToggleGroup>
      </SegmentedToolbar>,
    );

    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});

describe('SegmentedToolbar — disabled behavior', () => {
  it('keeps a disabled control in the roving focus by default', async () => {
    const onClick = vi.fn();
    render(
      <SegmentedToolbar aria-label="Editing tools">
        <ToolbarIconButton
          aria-label="Undo"
          icon={<Undo2 />}
          disabled
          onClick={onClick}
        />
      </SegmentedToolbar>,
    );

    const undo = screen.getByRole('button', { name: 'Undo' });
    expect(undo).not.toBeDisabled();
    expect(undo).toHaveAttribute('aria-disabled', 'true');
    undo.focus();
    await userEvent.keyboard('{Enter}');
    expect(undo).toHaveFocus();
    expect(onClick).not.toHaveBeenCalled();
  });

  // The regression this default exists to prevent: a toolbar is a single tab
  // stop, so a self-disabling command that leaves the roving focus takes the
  // user's keyboard position to `<body>` the moment they activate it.
  it('retains keyboard focus when a control disables itself on activation', async () => {
    function SelfDisablingUndo() {
      const [canUndo, setCanUndo] = useState(true);
      return (
        <SegmentedToolbar aria-label="Editing tools">
          <ToolbarIconButton
            aria-label="Undo"
            icon={<Undo2 />}
            disabled={!canUndo}
            onClick={() => setCanUndo(false)}
          />
          <ToolbarIconButton aria-label="Redo" icon={<Redo2 />} />
        </SegmentedToolbar>
      );
    }

    render(<SelfDisablingUndo />);

    const undo = screen.getByRole('button', { name: 'Undo' });
    undo.focus();
    await userEvent.keyboard('{Enter}');

    await waitFor(() => expect(undo).toHaveAttribute('aria-disabled', 'true'));
    expect(undo).toHaveFocus();
    expect(document.body).not.toHaveFocus();

    // Focus is still inside the toolbar, so roving navigation still works.
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'Redo' })).toHaveFocus();
  });

  it('opts out of the roving focus with focusableWhenDisabled={false}', async () => {
    const onClick = vi.fn();
    render(
      <SegmentedToolbar aria-label="Editing tools">
        <ToolbarIconButton
          aria-label="Undo"
          icon={<Undo2 />}
          disabled
          focusableWhenDisabled={false}
          onClick={onClick}
        />
      </SegmentedToolbar>,
    );

    const undo = screen.getByRole('button', { name: 'Undo' });
    expect(undo).toBeDisabled();
    expect(undo).not.toHaveAttribute('aria-disabled');
    await userEvent.click(undo);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('disables every control in a regular group', () => {
    render(
      <SegmentedToolbar aria-label="Editing tools">
        <ToolbarGroup aria-label="History" disabled>
          <ToolbarButton>Save</ToolbarButton>
          <ToolbarIconButton aria-label="Undo" icon={<Undo2 />} />
        </ToolbarGroup>
      </SegmentedToolbar>,
    );

    expect(screen.getByRole('group', { name: 'History' })).toHaveAttribute(
      'data-disabled',
    );
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('disables every control in a toggle group', () => {
    render(
      <SegmentedToolbar aria-label="View tools">
        <ToolbarToggleGroup aria-label="View" disabled defaultValue={['list']}>
          <ToolbarIconButton value="list" aria-label="List" icon={<List />} />
          <ToolbarIconButton
            value="grid"
            aria-label="Grid"
            icon={<Grid3x3 />}
          />
        </ToolbarToggleGroup>
      </SegmentedToolbar>,
    );

    expect(screen.getByRole('group', { name: 'View' })).toHaveAttribute(
      'data-disabled',
    );
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('propagates disabled state from the complete toolbar', () => {
    render(
      <SegmentedToolbar aria-label="Editing tools" disabled>
        <ToolbarButton>Save</ToolbarButton>
        <ToolbarIconButton aria-label="Undo" icon={<Undo2 />} />
      </SegmentedToolbar>,
    );

    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('still marks every disabled control with data-disabled for styling', () => {
    render(
      <SegmentedToolbar aria-label="Editing tools">
        <ToolbarIconButton aria-label="Undo" icon={<Undo2 />} disabled />
      </SegmentedToolbar>,
    );

    expect(screen.getByRole('button', { name: 'Undo' })).toHaveAttribute(
      'data-disabled',
    );
  });
});

describe('SegmentedToolbar — conditional motion', () => {
  function ConditionalToolbar() {
    const [showFavorite, setShowFavorite] = useState(true);
    const [showView, setShowView] = useState(true);
    return (
      <SegmentedToolbar aria-label="Editing tools">
        <ToolbarGroup aria-label="Editing">
          <ToolbarButton onClick={() => setShowFavorite((shown) => !shown)}>
            Toggle favorite
          </ToolbarButton>
          {showFavorite ? (
            <ToolbarIconButton
              key="favorite"
              aria-label="Favorite"
              icon={<Pencil />}
            />
          ) : null}
          <ToolbarButton onClick={() => setShowView((shown) => !shown)}>
            Toggle view
          </ToolbarButton>
        </ToolbarGroup>
        {showView ? <ToolbarSeparator key="view-separator" /> : null}
        {showView ? (
          <ToolbarGroup key="view" aria-label="View">
            <ToolbarIconButton aria-label="List" icon={<List />} />
          </ToolbarGroup>
        ) : null}
      </SegmentedToolbar>
    );
  }

  it('removes and restores a conditional child through AnimatePresence', async () => {
    render(<ConditionalToolbar />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Toggle favorite' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Favorite' }),
      ).not.toBeInTheDocument(),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Toggle favorite' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Favorite' }),
    ).toBeInTheDocument();
  });

  it('removes a separator and complete group in one update', async () => {
    render(<ConditionalToolbar />);

    await userEvent.click(screen.getByRole('button', { name: 'Toggle view' }));
    await waitFor(() => {
      expect(
        screen.queryByRole('group', { name: 'View' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('separator')).not.toBeInTheDocument();
    });
  });
});

describe('SegmentedToolbar — dragging', () => {
  it('does not render a drag handle by default', () => {
    render(
      <SegmentedToolbar aria-label="Editing tools">
        <ToolbarIconButton aria-label="Undo" icon={<Undo2 />} />
      </SegmentedToolbar>,
    );

    expect(
      screen.queryByRole('button', { name: 'Move toolbar' }),
    ).not.toBeInTheDocument();
  });

  it('nudges a draggable toolbar with the keyboard and announces its position', async () => {
    const onPositionChange = vi.fn();
    render(
      <SegmentedToolbar
        aria-label="Editing tools"
        draggable
        onPositionChange={onPositionChange}
      >
        <ToolbarIconButton aria-label="Undo" icon={<Undo2 />} />
      </SegmentedToolbar>,
    );

    const handle = screen.getByRole('button', { name: 'Move toolbar' });
    handle.focus();
    await userEvent.keyboard('{ArrowRight}{ArrowDown}');

    expect(onPositionChange).toHaveBeenNthCalledWith(1, { x: 8, y: 0 });
    expect(onPositionChange).toHaveBeenNthCalledWith(2, { x: 8, y: 8 });
    expect(screen.getByText('Toolbar moved to 8, 8')).toBeInTheDocument();
  });

  it('clamps keyboard nudges to object-form drag constraints', async () => {
    const onPositionChange = vi.fn();
    render(
      <SegmentedToolbar
        aria-label="Editing tools"
        draggable
        dragConstraints={{ top: -4, left: -4, right: 4, bottom: 4 }}
        onPositionChange={onPositionChange}
      >
        <ToolbarIconButton aria-label="Undo" icon={<Undo2 />} />
      </SegmentedToolbar>,
    );

    screen.getByRole('button', { name: 'Move toolbar' }).focus();
    await userEvent.keyboard('{ArrowRight}{ArrowDown}');

    expect(onPositionChange).toHaveBeenLastCalledWith({ x: 4, y: 4 });
  });

  /**
   * `aria-disabled` announces but does not prevent. When the default flipped to
   * focus-retaining, these controls stopped emitting native `disabled`, and the
   * caller's `onClick` became reachable by pointer — keyboard activation was
   * still blocked by Base UI, which is why the existing `{Enter}` coverage did
   * not notice. `disabled` is load-bearing as a re-entrancy and range guard, so
   * a pointer click must not activate.
   */
  it('does not activate a disabled ToolbarIconButton on a mouse click', async () => {
    const onClick = vi.fn();
    render(
      <SegmentedToolbar aria-label="Editing tools">
        <ToolbarIconButton
          aria-label="Undo"
          disabled
          icon={<Undo2 />}
          onClick={onClick}
        />
      </SegmentedToolbar>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not activate a disabled ToolbarButton on a mouse click', async () => {
    const onClick = vi.fn();
    render(
      <SegmentedToolbar aria-label="Editing tools">
        <ToolbarButton disabled onClick={onClick}>
          Download
        </ToolbarButton>
      </SegmentedToolbar>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not activate a disabled control nested in a ToolbarGroup', async () => {
    const onClick = vi.fn();
    render(
      <SegmentedToolbar aria-label="Editing tools">
        <ToolbarGroup aria-label="History tools">
          <ToolbarIconButton
            aria-label="Redo"
            disabled
            icon={<Redo2 />}
            onClick={onClick}
          />
        </ToolbarGroup>
      </SegmentedToolbar>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('still activates an ENABLED control on a mouse click', async () => {
    const onClick = vi.fn();
    render(
      <SegmentedToolbar aria-label="Editing tools">
        <ToolbarIconButton
          aria-label="Undo"
          icon={<Undo2 />}
          onClick={onClick}
        />
      </SegmentedToolbar>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
