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

import { Button, type ButtonProps } from '../Button';
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
  /** Fresco Button variant. @default 'text' */
  variant?: ButtonProps['variant'];
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
  onPressedChange?: (
    pressed: boolean,
    eventDetails: Toggle.ChangeEventDetails,
  ) => void;
} & SegmentContent;

export type GroupSegment = {
  type: 'group';
  id: string;
  mode: 'single' | 'multiple';
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (
    value: string[],
    eventDetails: ToggleGroup.ChangeEventDetails,
  ) => void;
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

/**
 * A disabled toolbar segment stays focusable — the APG toolbar behaviour Base
 * UI's roving focus already implements via `focusableWhenDisabled`, so a
 * keyboard user can still reach a segment to learn it is unavailable.
 *
 * A native `disabled` attribute is incompatible with that: browsers blur a
 * focused element the instant it becomes disabled, so a keyboard user who
 * exhausts an action — pressing Undo until there is nothing left to undo —
 * loses focus to the document body. Base UI does delete the attribute again,
 * but only in a layout effect, one commit after React has written it to the
 * DOM and the browser has already taken focus away.
 *
 * So swallow `disabled` before it reaches the DOM and let `aria-disabled`
 * carry the state (it is what Base UI converges on anyway). Activation is
 * already blocked in Base UI's own click/keydown/pointerdown handlers, which
 * close over the disabled state rather than reading the attribute.
 */
const SegmentControl = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function SegmentControl({ disabled, ...props }, ref) {
    // The composite item and the inner trigger each contribute a signal, and
    // whichever renders last wins the merge — so treat either as disabled.
    const isDisabled =
      disabled === true ||
      props['aria-disabled'] === true ||
      props['aria-disabled'] === 'true';
    return (
      <Button ref={ref} {...props} aria-disabled={isDisabled || undefined} />
    );
  },
);

// Button expresses its disabled appearance with `:disabled`, and inverts the
// flat variants' colours on `hover:enabled:` — neither of which can match a
// segment that is never natively disabled. Restate both on `aria-disabled` so
// a disabled segment reads as unavailable and never lights up under the
// pointer. It stays hoverable on purpose: for an icon-only segment the tooltip
// is the only visible label, and it is most needed when the segment is dimmed.
const disabledSegmentClasses =
  'aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:active:translate-none!';

// The variants that invert this token pair on hover, mapped to the background
// each one rests at. Restoring the resting background rather than blanking it
// matters for `glass`, whose `control-glass` treatment rests on a translucent
// `bg-surface/50` fill — forcing transparency would strip that fill on hover
// instead of leaving the segment looking untouched. Variants that paint their
// own background (`default`, `raised`) have no hover flip to undo.
const HOVER_RESET_BACKGROUND: Partial<
  Record<NonNullable<ButtonProps['variant']>, string>
> = {
  text: 'aria-disabled:hover:bg-transparent!',
  outline: 'aria-disabled:hover:bg-transparent!',
  dashed: 'aria-disabled:hover:bg-transparent!',
  glass: 'aria-disabled:hover:bg-surface/50!',
};
const hoverResetForeground = 'aria-disabled:hover:text-(--component-text)!';

/** Classes carrying the disabled appearance for a segment, if it is disabled. */
function disabledClasses(content: SegmentContent, disabled?: boolean) {
  if (!disabled) return undefined;
  const background = HOVER_RESET_BACKGROUND[content.variant ?? 'text'];
  return cx(
    disabledSegmentClasses,
    // A caller-supplied `className` is painting the segment itself, so leave
    // its colours alone rather than resetting them out from under it.
    background && !content.className && cx(background, hoverResetForeground),
  );
}

// Pressed-state highlight for toggle segments, via Base UI's data attribute.
// `!important` so the selected colours win over Button's text-variant hover.
const pressedClasses =
  'data-pressed:bg-selected! data-pressed:text-selected-contrast!';

/** A toolbar segment built on the shared Button component, styled flat + round. */
function segmentButton(
  content: SegmentContent,
  size: SegmentSize,
  { disabled, extraClassName }: { disabled?: boolean; extraClassName?: string },
) {
  const labelVisible = isLabelVisible(content);
  return (
    <SegmentControl
      variant={content.variant ?? 'text'}
      size={size}
      icon={content.icon}
      aria-label={labelVisible ? undefined : content.label}
      className={cx(
        'rounded-full',
        !labelVisible && 'aspect-square p-0',
        extraClassName,
        content.className,
        disabledClasses(content, disabled),
      )}
    >
      {labelVisible ? content.label : null}
    </SegmentControl>
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
  const styledButton = segmentButton(segment, size, {
    disabled: segment.disabled,
  });
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
  // A controlled `pressed` with no `onPressedChange` can never change state —
  // Base UI won't manage it internally once it's controlled, so a tap would
  // advertise an activation that does nothing. Disable that combination
  // rather than leave a live-looking control wired to nothing; an
  // uncontrolled toggle (no `pressed`) is unaffected, since Base UI manages
  // its own state regardless of whether a callback is supplied.
  const isUncontrollable =
    segment.pressed !== undefined && !segment.onPressedChange;
  const disabled = segment.disabled || isUncontrollable;
  // `disabled` also goes on the composite item, not just the inner Toggle:
  // that is what tells Base UI's roving focus the segment is disabled-but-
  // focusable, and keeps its `aria-disabled` in step with the Toggle's.
  const toggle = (
    <Toolbar.Button
      disabled={disabled}
      render={
        <Toggle
          pressed={segment.pressed}
          defaultPressed={segment.defaultPressed}
          onPressedChange={segment.onPressedChange}
          disabled={disabled}
          render={segmentButton(segment, size, {
            disabled,
            extraClassName: pressedClasses,
          })}
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
  // Same rationale as the toggle segment above: a controlled `value` with no
  // `onValueChange` can never change, since Base UI won't manage selection
  // internally once the group is controlled.
  const isUncontrollable =
    segment.value !== undefined && !segment.onValueChange;
  return (
    <ToggleGroup
      multiple={segment.mode === 'multiple'}
      value={segment.value}
      defaultValue={segment.defaultValue}
      onValueChange={segment.onValueChange}
      disabled={isUncontrollable}
      orientation={orientation}
      className={cx(
        'flex items-center gap-1',
        orientation === 'vertical' && 'flex-col',
      )}
    >
      {segment.options.map((option) => {
        // The group's own `disabled` reaches each Toggle through context, so
        // fold it in here too — the composite item is outside that context and
        // would otherwise treat the option as enabled.
        const disabled = option.disabled || isUncontrollable;
        const toggle = (
          <Toolbar.Button
            disabled={disabled}
            render={
              <Toggle
                value={option.value}
                disabled={disabled}
                render={segmentButton(option, size, {
                  disabled,
                  extraClassName: pressedClasses,
                })}
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
      disabled={segment.disabled}
      render={
        <DropdownMenuTrigger
          disabled={segment.disabled}
          render={segmentButton(segment, size, {
            disabled: segment.disabled,
            extraClassName: activeClasses,
          })}
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
      disabled={segment.disabled}
      render={
        <PopoverTrigger
          disabled={segment.disabled}
          render={segmentButton(segment, size, {
            disabled: segment.disabled,
            extraClassName: activeClasses,
          })}
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
        data-motion-drag-container="segmented-toolbar"
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
