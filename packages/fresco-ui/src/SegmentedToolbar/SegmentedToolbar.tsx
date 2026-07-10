'use client';

import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { Toolbar } from '@base-ui/react/toolbar';
import { GripHorizontal, GripVertical } from 'lucide-react';
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useDragControls,
  useMotionValue,
  useReducedMotion,
} from 'motion/react';
import * as React from 'react';

import { Button } from '../Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../DropdownMenu';
import { MotionSurface } from '../layout/Surface';
import { Popover, PopoverContent, PopoverTrigger } from '../Popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '../Tooltip';
import { cva, cx } from '../utils/cva';

export type SegmentContent = {
  /** Accessible name. Always the aria-label; rendered as visible text when showLabel. */
  label: string;
  /** Optional Lucide icon (or any node). */
  icon?: React.ReactNode;
  /**
   * Render the label as visible text.
   * Default: false when an icon is present (icon-only + tooltip), true when no icon.
   */
  showLabel?: boolean;
  /**
   * Tailwind classes forwarded to the underlying control — e.g. to colour a
   * segment with named theme colours: `className="bg-tomato text-white"`.
   */
  className?: string;
};

export type ButtonSegment = {
  type: 'button';
  id: string;
  disabled?: boolean;
  onClick?: () => void;
  /**
   * Host the segment inside a caller-supplied element — e.g. a Popover or Menu
   * trigger. The element receives the styled toolbar button as its `render`, so
   * the overlay's trigger wiring (focus return, `aria-expanded`) composes with
   * the toolbar button and its roving focus. When set, the open/close behaviour
   * comes from the wrapper rather than `onClick`.
   */
  render?: React.ReactElement<{ render?: React.ReactElement }>;
} & SegmentContent;

export type ToggleSegment = {
  type: 'toggle';
  id: string;
  disabled?: boolean;
  pressed?: boolean;
  defaultPressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
} & SegmentContent;

export type GroupSegment = {
  type: 'group';
  id: string;
  mode: 'single' | 'multiple';
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
  options: Array<SegmentContent & { value: string; disabled?: boolean }>;
};

export type SeparatorSegment = {
  type: 'separator';
  id: string;
};

/**
 * A button that opens a single-select menu — for choosing among options that
 * would otherwise need one segment each (e.g. picking an edge type to draw).
 * The trigger shows `pressed` styling when a selection is active.
 */
export type MenuSegment = {
  type: 'menu';
  id: string;
  disabled?: boolean;
  pressed?: boolean;
  value?: string;
  options: Array<SegmentContent & { value: string; disabled?: boolean }>;
  onSelect: (value: string) => void;
} & SegmentContent;

/**
 * A pressed-able button that anchors a popover next to itself, rendering
 * arbitrary content (e.g. a text input). Open state is controlled by the
 * consumer so it can be tied to external state — for instance keeping the
 * button "pressed" for as long as the popover is open.
 */
export type PopoverSegment = {
  type: 'popover';
  id: string;
  disabled?: boolean;
  pressed?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which side of the trigger the popover opens on. @default 'right' */
  side?: 'top' | 'right' | 'bottom' | 'left';
  children: React.ReactNode;
} & SegmentContent;

export type SegmentSize = 'sm' | 'md' | 'lg';
export type ToolbarOrientation = 'horizontal' | 'vertical';

export type ComponentSegmentRenderProps = {
  size: SegmentSize;
  orientation: ToolbarOrientation;
};

/**
 * Renders a caller-supplied component as a segment inside the toolbar surface.
 * Use this for composite controls whose interaction model is larger than a
 * single toolbar button, such as a split button with its own popover trigger.
 */
export type ComponentSegment = {
  type: 'component';
  id: string;
  component: React.ComponentType<ComponentSegmentRenderProps>;
};

export type ToolbarSegment =
  | ButtonSegment
  | ToggleSegment
  | GroupSegment
  | SeparatorSegment
  | MenuSegment
  | PopoverSegment
  | ComponentSegment;

export type Position = { x: number; y: number };

export type SegmentedToolbarProps = {
  /** Accessible name for the toolbar (role="toolbar" requires a label). */
  label: string;
  items: ToolbarSegment[];
  /** @default 'horizontal' */
  orientation?: ToolbarOrientation;
  /** @default 'md' */
  size?: SegmentSize;
  className?: string;
  /** @default false */
  draggable?: boolean;
  /** Uncontrolled starting position (only when draggable). */
  defaultPosition?: Position;
  /** Controlled position (only when draggable). */
  position?: Position;
  onPositionChange?: (pos: Position) => void;
  /** Optional drag bounds. */
  dragConstraints?:
    | React.RefObject<Element | null>
    | { top: number; left: number; right: number; bottom: number };
  /** Accessible name for the drag handle. @default 'Move toolbar' */
  dragHandleLabel?: string;
};

// Layout only — the pill's surface colour and contrast come from `Surface`.
// A medium effect shadow keeps floating chrome elevated without a heavy halo.
const rootLayoutVariants = cva({
  base: 'effect-shadow-md flex w-fit items-center gap-1 rounded-full p-1.5',
  variants: {
    orientation: {
      horizontal: 'flex-row',
      vertical: 'flex-col',
    },
  },
  defaultVariants: { orientation: 'horizontal' },
});

/** Whether a segment's text should be visible (vs icon-only). */
function isLabelVisible(content: SegmentContent): boolean {
  return content.showLabel ?? !content.icon;
}

// Pressed-state highlight for toggle segments, via Base UI's data attribute.
// `!important` so the selected colours win over Button's text-variant hover.
const pressedClasses =
  'data-pressed:bg-selected! data-pressed:text-selected-contrast!';

/** A toolbar segment built on the shared Button component, styled flat + round. */
function segmentButton(
  content: SegmentContent,
  size: SegmentSize,
  extraClassName?: string,
) {
  const labelVisible = isLabelVisible(content);
  return (
    <Button
      variant="text"
      size={size}
      icon={content.icon}
      aria-label={labelVisible ? undefined : content.label}
      className={cx(
        'rounded-full',
        !labelVisible && 'aspect-square p-0',
        extraClassName,
        content.className,
      )}
    >
      {labelVisible ? content.label : null}
    </Button>
  );
}

// On a vertical toolbar, tooltips/menus/popovers open to the right (into the
// canvas) rather than overlapping the stacked buttons. Horizontal toolbars keep
// each overlay's own default side (tooltip top, menu/popover bottom).
function overlaySide(orientation: ToolbarOrientation): 'right' | undefined {
  return orientation === 'vertical' ? 'right' : undefined;
}

/** Wraps an icon-only control in a tooltip carrying its label. */
function withTooltip(
  control: React.ReactElement,
  label: string,
  labelVisible: boolean,
  side?: 'top' | 'right' | 'bottom' | 'left',
) {
  if (labelVisible) return control;
  return (
    <Tooltip>
      <TooltipTrigger render={control} />
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}

function ToolbarButtonSegment({
  segment,
  size,
  orientation,
}: {
  segment: ButtonSegment;
  size: SegmentSize;
  orientation: ToolbarOrientation;
}) {
  const styledButton = segmentButton(segment, size);
  // When a caller hosts the segment in their own element (e.g. a Popover
  // trigger), the styled button becomes that element's render target so the
  // overlay wiring composes with the toolbar button — mirroring the
  // Toolbar.Button → Toggle → Button nesting used for toggle segments.
  const control = segment.render
    ? React.cloneElement(segment.render, { render: styledButton })
    : styledButton;
  const button = (
    <Toolbar.Button
      disabled={segment.disabled}
      onClick={segment.onClick}
      render={control}
    />
  );
  return withTooltip(
    button,
    segment.label,
    isLabelVisible(segment),
    overlaySide(orientation),
  );
}

function ToolbarToggleSegment({
  segment,
  size,
  orientation,
}: {
  segment: ToggleSegment;
  size: SegmentSize;
  orientation: ToolbarOrientation;
}) {
  const toggle = (
    <Toolbar.Button
      render={
        <Toggle
          pressed={segment.pressed}
          defaultPressed={segment.defaultPressed}
          onPressedChange={(pressed) => segment.onPressedChange?.(pressed)}
          disabled={segment.disabled}
          render={segmentButton(segment, size, pressedClasses)}
        />
      }
    />
  );
  return withTooltip(
    toggle,
    segment.label,
    isLabelVisible(segment),
    overlaySide(orientation),
  );
}

function ToolbarGroupSegment({
  segment,
  size,
  orientation,
}: {
  segment: GroupSegment;
  size: SegmentSize;
  orientation: ToolbarOrientation;
}) {
  return (
    <ToggleGroup
      multiple={segment.mode === 'multiple'}
      value={segment.value}
      defaultValue={segment.defaultValue}
      onValueChange={(value) => segment.onValueChange?.(value)}
      orientation={orientation}
      className={cx(
        'flex items-center gap-1',
        orientation === 'vertical' && 'flex-col',
      )}
    >
      {segment.options.map((option) => {
        const toggle = (
          <Toolbar.Button
            render={
              <Toggle
                value={option.value}
                disabled={option.disabled}
                render={segmentButton(option, size, pressedClasses)}
              />
            }
          />
        );
        return (
          <React.Fragment key={option.value}>
            {withTooltip(
              toggle,
              option.label,
              isLabelVisible(option),
              overlaySide(orientation),
            )}
          </React.Fragment>
        );
      })}
    </ToggleGroup>
  );
}

// Active styling for a menu trigger. Unlike a Toggle it has no data-pressed
// state, so the selected highlight is applied directly when `pressed`.
const menuActiveClasses = 'bg-selected! text-selected-contrast!';

function ToolbarMenuSegment({
  segment,
  size,
  orientation,
}: {
  segment: MenuSegment;
  size: SegmentSize;
  orientation: ToolbarOrientation;
}) {
  // A consumer-supplied className (e.g. a named theme colour) takes precedence
  // over the default pressed highlight, so an active selection can be coloured
  // by its own meaning (e.g. an edge type's colour) rather than `bg-selected`.
  const activeClasses = segment.className
    ? undefined
    : segment.pressed
      ? menuActiveClasses
      : undefined;
  const trigger = (
    <Toolbar.Button
      render={
        <DropdownMenuTrigger
          disabled={segment.disabled}
          render={segmentButton(segment, size, activeClasses)}
        />
      }
    />
  );
  return (
    <DropdownMenu>
      {withTooltip(
        trigger,
        segment.label,
        isLabelVisible(segment),
        overlaySide(orientation),
      )}
      <DropdownMenuContent side={overlaySide(orientation)}>
        <DropdownMenuRadioGroup
          value={segment.value}
          onValueChange={(value) => segment.onSelect(String(value))}
        >
          {segment.options.map((option) => (
            // Base UI radio items keep the menu open by default; close on pick
            // so a single selection commits and returns focus to the page.
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              disabled={option.disabled}
              closeOnClick
            >
              {option.icon}
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ToolbarPopoverSegment({
  segment,
  size,
  orientation,
}: {
  segment: PopoverSegment;
  size: SegmentSize;
  orientation: ToolbarOrientation;
}) {
  // As with menu segments, a consumer-supplied className takes precedence over
  // the default pressed highlight, so an active state can be coloured by its
  // own meaning (e.g. a group tool adopting the active group's colour).
  const activeClasses = segment.className
    ? undefined
    : segment.pressed
      ? menuActiveClasses
      : undefined;
  const trigger = (
    <Toolbar.Button
      render={
        <PopoverTrigger
          disabled={segment.disabled}
          render={segmentButton(segment, size, activeClasses)}
        />
      }
    />
  );
  return (
    <Popover
      open={segment.open}
      onOpenChange={(open) => segment.onOpenChange(open)}
    >
      {withTooltip(
        trigger,
        segment.label,
        isLabelVisible(segment),
        overlaySide(orientation),
      )}
      <PopoverContent
        side={segment.side ?? overlaySide(orientation)}
        showArrow={false}
      >
        {segment.children}
      </PopoverContent>
    </Popover>
  );
}

function ToolbarComponentSegment({
  segment,
  size,
  orientation,
}: {
  segment: ComponentSegment;
  size: SegmentSize;
  orientation: ToolbarOrientation;
}) {
  const Component = segment.component;
  return <Component size={size} orientation={orientation} />;
}

const segmentSpring = { type: 'spring' as const, duration: 0.4, bounce: 0.2 };

const NUDGE_STEP = 8;

function SegmentMotion({
  reduce,
  children,
}: {
  reduce: boolean;
  children: React.ReactNode;
}) {
  const variants = reduce
    ? undefined
    : {
        initial: { opacity: 0, scale: 0.6 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.6 },
      };
  return (
    <motion.div
      layout
      className="flex items-center justify-center"
      initial={variants?.initial}
      animate={variants?.animate}
      exit={variants?.exit}
      transition={reduce ? { duration: 0 } : segmentSpring}
    >
      {children}
    </motion.div>
  );
}

// Grip sizing per toolbar size (kept as literal classes for Tailwind extraction).
const dragHandleSizes: Record<SegmentSize, string> = {
  sm: 'p-1 [&_svg]:size-4',
  md: 'p-1.5 [&_svg]:size-5',
  lg: 'p-2 [&_svg]:size-6',
};

/**
 * DragHandle is intentionally outside role="toolbar" so its arrow keys move
 * the toolbar rather than competing with the toolbar's roving-focus navigation.
 * It is deliberately not styled as a button (no fill, no hover state) — just a
 * muted grip affordance.
 */
function DragHandle({
  label,
  orientation,
  size,
  onPointerDown,
  onNudge,
}: {
  label: string;
  orientation: ToolbarOrientation;
  size: SegmentSize;
  onPointerDown: (event: React.PointerEvent) => void;
  onNudge: (delta: Position) => void;
}) {
  const handleKeyDown = (event: React.KeyboardEvent) => {
    const deltas: Record<string, Position> = {
      ArrowLeft: { x: -NUDGE_STEP, y: 0 },
      ArrowRight: { x: NUDGE_STEP, y: 0 },
      ArrowUp: { x: 0, y: -NUDGE_STEP },
      ArrowDown: { x: 0, y: NUDGE_STEP },
    };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    onNudge(delta);
  };

  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={onPointerDown}
      onKeyDown={handleKeyDown}
      className={cx(
        'inline-flex shrink-0 cursor-grab touch-none items-center justify-center self-center',
        'focusable rounded-full text-current/40 active:cursor-grabbing',
        dragHandleSizes[size],
      )}
    >
      <span aria-hidden className="contents">
        {orientation === 'horizontal' ? <GripVertical /> : <GripHorizontal />}
      </span>
    </button>
  );
}

function renderSegment(
  segment: ToolbarSegment,
  size: SegmentSize,
  orientation: ToolbarOrientation,
  reduce: boolean,
) {
  const inner = (() => {
    switch (segment.type) {
      case 'menu':
        return (
          <ToolbarMenuSegment
            segment={segment}
            size={size}
            orientation={orientation}
          />
        );
      case 'popover':
        return (
          <ToolbarPopoverSegment
            segment={segment}
            size={size}
            orientation={orientation}
          />
        );
      case 'separator':
        return (
          <Toolbar.Separator
            orientation={
              orientation === 'horizontal' ? 'vertical' : 'horizontal'
            }
            className={cx(
              'shrink-0 rounded-full bg-current/20',
              orientation === 'horizontal' ? 'mx-1 h-6 w-px' : 'my-1 h-px w-6',
            )}
          />
        );
      case 'group':
        return (
          <ToolbarGroupSegment
            segment={segment}
            size={size}
            orientation={orientation}
          />
        );
      case 'toggle':
        return (
          <ToolbarToggleSegment
            segment={segment}
            size={size}
            orientation={orientation}
          />
        );
      case 'button':
        return (
          <ToolbarButtonSegment
            segment={segment}
            size={size}
            orientation={orientation}
          />
        );
      case 'component':
        return (
          <ToolbarComponentSegment
            segment={segment}
            size={size}
            orientation={orientation}
          />
        );
      default:
        return null;
    }
  })();

  return (
    <SegmentMotion key={segment.id} reduce={reduce}>
      {inner}
    </SegmentMotion>
  );
}

export function SegmentedToolbar({
  label,
  items,
  orientation = 'horizontal',
  size = 'md',
  draggable = false,
  defaultPosition,
  position,
  onPositionChange,
  dragConstraints,
  dragHandleLabel = 'Move toolbar',
  className,
}: SegmentedToolbarProps) {
  const reduce = useReducedMotion() ?? false;
  const dragControls = useDragControls();
  const [announcement, setAnnouncement] = React.useState('');

  // Motion's `drag` owns the position via these motion values (the single
  // source of truth), so pointer drags and keyboard nudges stay in sync and
  // `dragConstraints` clamps both.
  const x = useMotionValue(position?.x ?? defaultPosition?.x ?? 0);
  const y = useMotionValue(position?.y ?? defaultPosition?.y ?? 0);

  React.useEffect(() => {
    if (position) {
      x.set(position.x);
      y.set(position.y);
    }
  }, [position, x, y]);

  const handleNudge = (delta: Position) => {
    const next = { x: x.get() + delta.x, y: y.get() + delta.y };
    // Pointer drags are clamped by motion, but keyboard nudges bypass it, so
    // honour the object-form bounds here. The RefObject form is left to motion's
    // drag clamping (we don't measure the ref element).
    if (dragConstraints && !('current' in dragConstraints)) {
      next.x = Math.min(
        Math.max(next.x, dragConstraints.left),
        dragConstraints.right,
      );
      next.y = Math.min(
        Math.max(next.y, dragConstraints.top),
        dragConstraints.bottom,
      );
    }
    x.set(next.x);
    y.set(next.y);
    onPositionChange?.(next);
    setAnnouncement(
      `Toolbar moved to ${Math.round(next.x)}, ${Math.round(next.y)}`,
    );
  };

  const segments = (
    <AnimatePresence initial={false} mode="popLayout">
      {items.map((segment) =>
        renderSegment(segment, size, orientation, reduce),
      )}
    </AnimatePresence>
  );

  const innerToolbar = (
    <Toolbar.Root
      orientation={orientation}
      aria-label={label}
      className={cx(
        'flex items-center gap-1',
        orientation === 'vertical' && 'flex-col',
      )}
    >
      {segments}
    </Toolbar.Root>
  );

  // The Surface is the "pill" container; the Toolbar.Root sits inside it so Base
  // UI's roving focus is never wrapped by motion/Surface. A shared LayoutGroup
  // keeps the container's resize in step with segment enter/exit.
  if (!draggable) {
    return (
      <LayoutGroup>
        <MotionSurface
          floating
          shadow="none"
          spacing="none"
          noContainer
          layout
          className={cx(rootLayoutVariants({ orientation }), className)}
        >
          {innerToolbar}
        </MotionSurface>
      </LayoutGroup>
    );
  }

  // When draggable, the Surface pill is also the drag container; the toolbar
  // sits inside it next to the drag handle.
  return (
    <LayoutGroup>
      <MotionSurface
        floating
        shadow="none"
        spacing="none"
        noContainer
        layout
        drag
        dragListener={false}
        dragControls={dragControls}
        dragMomentum={false}
        dragConstraints={dragConstraints}
        onDragEnd={() => onPositionChange?.({ x: x.get(), y: y.get() })}
        style={{ x, y }}
        transition={reduce ? { duration: 0 } : segmentSpring}
        className={cx(rootLayoutVariants({ orientation }), className)}
      >
        <DragHandle
          label={dragHandleLabel}
          orientation={orientation}
          size={size}
          onPointerDown={(event) => dragControls.start(event)}
          onNudge={handleNudge}
        />
        {innerToolbar}
        <output aria-live="polite" className="sr-only">
          {announcement}
        </output>
      </MotionSurface>
    </LayoutGroup>
  );
}
