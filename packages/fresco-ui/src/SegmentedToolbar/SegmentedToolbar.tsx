'use client';

import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { Toolbar } from '@base-ui/react/toolbar';
import { GripHorizontal, GripVertical } from 'lucide-react';
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  type MotionProps,
  type Transition,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  type Variants,
} from 'motion/react';
import * as React from 'react';

import { Button, type ButtonProps, IconButton } from '../Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '../DropdownMenu';
import { MotionSurface } from '../layout/Surface';
import { Popover, PopoverContent, PopoverTrigger } from '../Popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '../Tooltip';
import { cva, cx } from '../utils/cva';

export type SegmentSize = 'sm' | 'md' | 'lg';
export type ToolbarOrientation = 'horizontal' | 'vertical';
export type Position = { x: number; y: number };

const TOOLBAR_MOTION_CHILD = Symbol('ToolbarMotionChild');

type MissingToolbarChildRef = {
  readonly __toolbarChildMustDeclareARefProp: unique symbol;
};

/**
 * Registers a custom direct toolbar child for presence/layout animation.
 *
 * Motion's `popLayout` mode injects a ref into each direct child so it can
 * remove that child's DOM element from layout while its exit animation runs.
 * The ref prop is therefore part of this helper's type contract: custom
 * wrappers must declare it and forward it to their single toolbar primitive.
 */
export function defineToolbarChild<C extends React.ElementType>(
  component: C &
    ('ref' extends keyof React.ComponentProps<C>
      ? unknown
      : MissingToolbarChildRef),
): C {
  Object.defineProperty(component, TOOLBAR_MOTION_CHILD, {
    configurable: false,
    enumerable: false,
    value: true,
  });
  return component;
}

type DisabledFocusBehavior = {
  /**
   * Keep the control in the toolbar's roving focus when disabled.
   *
   * A toolbar is a single tab stop, so a control that leaves the roving focus
   * the moment it becomes unavailable drops keyboard focus to `<body>` — which
   * is exactly what happens to every self-disabling command (undo, redo,
   * next/previous, zoom in/out). WAI-ARIA's toolbar pattern therefore
   * recommends keeping disabled items focusable, so that is the default here.
   *
   * Pass `focusableWhenDisabled={false}` for the rare control that must be
   * genuinely unfocusable — e.g. one that is never the focused element when it
   * becomes unavailable and whose presence in the roving focus would only add
   * noise.
   * @default true
   */
  focusableWhenDisabled?: boolean;
};

type ToggleBehavior = {
  /** Required for a button rendered inside `ToolbarToggleGroup`. */
  value?: string;
  pressed?: boolean;
  defaultPressed?: boolean;
  onPressedChange?: Toggle.Props['onPressedChange'];
};

// Motion owns these event names on animated controls. Excluding the native DOM
// variants keeps the public props unambiguous while every other Button prop is
// forwarded to the underlying Fresco control.
type MotionEventConflict =
  | 'onAnimationStart'
  | 'onDrag'
  | 'onDragStart'
  | 'onDragEnd';

type MotionSafeButtonProps = Omit<ButtonProps, MotionEventConflict>;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

export type ToolbarButtonProps = MotionSafeButtonProps &
  DisabledFocusBehavior &
  ToggleBehavior & {
    ref?: React.Ref<HTMLButtonElement>;
    size?: SegmentSize;
  };

type FrescoIconButtonProps = DistributiveOmit<
  React.ComponentProps<typeof IconButton>,
  MotionEventConflict
>;

export type ToolbarIconButtonProps = FrescoIconButtonProps &
  DisabledFocusBehavior &
  ToggleBehavior & {
    size?: SegmentSize;
    /** Tooltip content. Pass `false` to suppress the automatic aria-label tooltip. */
    tooltip?: React.ReactNode | false;
    tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
  };

export type ToolbarGroupProps = Omit<
  Toolbar.Group.Props,
  'aria-label' | 'children' | 'className' | 'render'
> & {
  /** Accessible name required by Base UI for each toolbar group. */
  'aria-label': string;
  'children'?: React.ReactNode;
  'className'?: string;
  'ref'?: React.Ref<HTMLDivElement>;
};

export type ToolbarToggleGroupProps = Omit<
  ToggleGroup.Props,
  'aria-label' | 'children' | 'className' | 'orientation' | 'render'
> & {
  /** Accessible name required for the group of toggle buttons. */
  'aria-label': string;
  'children'?: React.ReactNode;
  'className'?: string;
  /** Defaults to the containing toolbar's orientation. */
  'orientation'?: ToolbarOrientation;
  'ref'?: React.Ref<HTMLDivElement>;
};

export type ToolbarSeparatorProps = Omit<
  Toolbar.Separator.Props,
  'className' | 'orientation' | 'render'
> & {
  className?: string;
  ref?: React.Ref<HTMLDivElement>;
};

type ToolbarOverlayTrigger = React.ReactElement<
  (ToolbarButtonProps | ToolbarIconButtonProps) & {
    ref?: React.Ref<HTMLButtonElement>;
  }
>;

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') {
    ref(value);
  } else if (ref) {
    ref.current = value;
  }
}

function useMergedButtonRef(
  forwardedRef: React.Ref<HTMLButtonElement> | undefined,
  triggerRef: React.Ref<HTMLButtonElement> | undefined,
) {
  return React.useCallback(
    (button: HTMLButtonElement | null) => {
      assignRef(forwardedRef, button);
      assignRef(triggerRef, button);
    },
    [forwardedRef, triggerRef],
  );
}

export type ToolbarMenuProps = Omit<
  React.ComponentProps<typeof DropdownMenu>,
  'children'
> & {
  /** Animated toolbar control that opens the menu. */
  trigger: ToolbarOverlayTrigger;
  children: React.ReactNode;
  ref?: React.Ref<HTMLButtonElement>;
  /** Props forwarded to Fresco's DropdownMenuContent. */
  contentProps?: Omit<
    React.ComponentProps<typeof DropdownMenuContent>,
    'children'
  >;
};

export type ToolbarPopoverProps = Omit<
  React.ComponentProps<typeof Popover>,
  'children'
> & {
  /** Animated toolbar control that opens the popover. */
  trigger: ToolbarOverlayTrigger;
  children: React.ReactNode;
  ref?: React.Ref<HTMLButtonElement>;
  /** Props forwarded to Fresco's PopoverContent. */
  contentProps?: Omit<React.ComponentProps<typeof PopoverContent>, 'children'>;
};

export type SegmentedToolbarProps = Omit<
  Toolbar.Root.Props,
  'aria-label' | 'children' | 'className' | 'orientation' | 'render'
> & {
  /** Accessible name for the toolbar. */
  'aria-label': string;
  'children'?: React.ReactNode;
  /** @default 'horizontal' */
  'orientation'?: ToolbarOrientation;
  /** @default 'md' */
  'size'?: SegmentSize;
  'className'?: string;
  /** @default false */
  'draggable'?: boolean;
  /** Uncontrolled starting position (only when draggable). */
  'defaultPosition'?: Position;
  /** Controlled position (only when draggable). */
  'position'?: Position;
  'onPositionChange'?: (position: Position) => void;
  /** Optional drag bounds. */
  'dragConstraints'?:
    | React.RefObject<Element | null>
    | { top: number; left: number; right: number; bottom: number };
  /** Accessible name for the drag handle. @default 'Move toolbar' */
  'dragHandleLabel'?: string;
};

type ToolbarContextValue = {
  orientation: ToolbarOrientation;
  size: SegmentSize;
  reduceMotion: boolean;
};

const ToolbarContext = React.createContext<ToolbarContextValue | null>(null);
const GroupDisabledContext = React.createContext(false);
const ToggleGroupItemContext = React.createContext(false);

function useToolbarContext(componentName: string): ToolbarContextValue {
  const context = React.useContext(ToolbarContext);
  if (!context) {
    throw new Error(
      `${componentName} must be rendered inside SegmentedToolbar.`,
    );
  }
  return context;
}

// Layout only — the pill's surface colour and contrast come from `Surface`.
// The inner Toolbar.Root owns overflow so the rounded, layout-animated shell
// never clips focus rings or exiting controls.
const rootLayoutVariants = cva({
  base: 'effect-shadow-md flex w-fit max-w-full min-w-0 items-center gap-1 p-1.5',
  variants: {
    orientation: {
      horizontal: 'flex-row',
      vertical: 'flex-col',
    },
  },
  defaultVariants: { orientation: 'horizontal' },
});

const layoutSpring: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 34,
  mass: 0.7,
};

// Controls are 40/48/64px high and the surface adds 6px padding on each side.
// Keep the animated pill radius as a numeric style so Motion can scale-correct
// it while the surface changes size. A class-derived radius briefly distorts
// during layout interpolation because Motion cannot preserve its geometry.
const surfaceRadius: Record<SegmentSize, number> = {
  sm: 26,
  md: 30,
  lg: 38,
};

const itemVariants: Variants = {
  initial: {
    scale: 0.72,
    filter: 'blur(3px) opacity(0%)',
  },
  animate: {
    scale: 1,
    filter: 'blur(0px) opacity(100%)',
    transition: {
      type: 'spring',
      stiffness: 520,
      damping: 30,
      mass: 0.6,
    },
  },
  exit: {
    scale: 0.72,
    filter: 'blur(3px) opacity(0%)',
    transition: {
      type: 'spring',
      stiffness: 620,
      damping: 42,
      mass: 0.5,
    },
  },
};

function motionItemProps(reduceMotion: boolean): MotionProps {
  if (reduceMotion) {
    return {
      layout: 'position',
      initial: false,
      transition: { duration: 0 },
    };
  }

  return {
    layout: 'position',
    variants: itemVariants,
    initial: 'initial',
    animate: 'animate',
    exit: 'exit',
    transition: { layout: layoutSpring },
  };
}

/**
 * Matches Base UI Toolbar.Button's own default: a disabled toolbar control
 * stays in the roving focus and announces its state through `aria-disabled`
 * rather than the native `disabled` attribute, so becoming unavailable never
 * ejects keyboard focus from the toolbar. `focusableWhenDisabled={false}`
 * opts a control back into native `disabled` semantics.
 */
type DisabledAwareButtonProps = MotionSafeButtonProps &
  DisabledFocusBehavior & { ref?: React.Ref<HTMLButtonElement> };

/**
 * Activation guard for the `aria-disabled` branch.
 *
 * `aria-disabled` is an ANNOUNCEMENT, not a behaviour: unlike the native
 * `disabled` attribute it does not stop a pointer activating the control. Base
 * UI suppresses the keyboard path (`useFocusableWhenDisabled` preventDefaults
 * non-Tab keydown) and its own toggle path, but a raw `onClick` reaching the
 * rendered element through `mergeProps` is chained, not blocked — Base UI's own
 * docs say event handlers returned by those functions are not automatically
 * prevented.
 *
 * So the moment this component stopped emitting native `disabled`, every
 * caller's `onClick` became reachable on a disabled control. That is not a
 * cosmetic gap: `disabled` was load-bearing as a re-entrancy guard (Architect's
 * Download and Save-to-source buttons hold no flag of their own) and as a range
 * guard (Narrative's preset arrows compute `activePreset - 1` unclamped, so a
 * click at index 0 unmounts the whole preset toolbar).
 *
 * Swallowing the click keeps the accessibility win — focus stays in the roving
 * toolbar and the state is announced — without making `disabled` advisory.
 */
const swallowActivation = (event: React.MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

function DisabledAwareButton({
  ref,
  disabled,
  focusableWhenDisabled = true,
  'aria-disabled': ariaDisabled,
  ...props
}: DisabledAwareButtonProps) {
  const isDisabled =
    disabled === true || ariaDisabled === true || ariaDisabled === 'true';

  if (focusableWhenDisabled) {
    return (
      <Button
        ref={ref}
        {...props}
        aria-disabled={isDisabled || undefined}
        onClick={isDisabled ? swallowActivation : props.onClick}
      />
    );
  }

  return <Button ref={ref} {...props} disabled={isDisabled || undefined} />;
}

type DisabledAwareIconButtonProps = FrescoIconButtonProps &
  DisabledFocusBehavior;

function DisabledAwareIconButton({
  ref,
  disabled,
  focusableWhenDisabled = true,
  'aria-disabled': ariaDisabled,
  ...props
}: DisabledAwareIconButtonProps) {
  const isDisabled =
    disabled === true || ariaDisabled === true || ariaDisabled === 'true';

  if (focusableWhenDisabled) {
    // See `swallowActivation`: `aria-disabled` announces but does not prevent,
    // so the caller's `onClick` must be withheld or `disabled` becomes advisory.
    return (
      <IconButton
        ref={ref}
        {...props}
        aria-disabled={isDisabled || undefined}
        onClick={isDisabled ? swallowActivation : props.onClick}
      />
    );
  }

  return <IconButton ref={ref} {...props} disabled={isDisabled || undefined} />;
}

const MotionToolbarButtonControl = motion.create(DisabledAwareButton);
const MotionToolbarIconButtonControl = motion.create(DisabledAwareIconButton);

type ToolbarControlBehavior = ToggleBehavior & DisabledFocusBehavior;

function useToolbarControlBehavior({
  disabled,
  focusableWhenDisabled = true,
  value,
  pressed,
  defaultPressed,
  onPressedChange,
}: ToolbarControlBehavior & { disabled?: boolean }) {
  const inheritedDisabled = React.useContext(GroupDisabledContext);
  const inToggleGroup = React.useContext(ToggleGroupItemContext);
  const isUncontrollable = pressed !== undefined && !onPressedChange;
  const effectiveDisabled =
    disabled === true || inheritedDisabled || isUncontrollable;
  const isToggle =
    inToggleGroup ||
    value !== undefined ||
    pressed !== undefined ||
    defaultPressed !== undefined ||
    onPressedChange !== undefined;

  if (inToggleGroup && value === undefined) {
    throw new Error(
      'ToolbarButton and ToolbarIconButton require a value inside ToolbarToggleGroup.',
    );
  }

  return {
    defaultPressed,
    effectiveDisabled,
    focusableWhenDisabled,
    isToggle,
    onPressedChange,
    pressed,
    value,
  };
}

function renderToolbarControl(
  control: React.ReactElement,
  behavior: ReturnType<typeof useToolbarControlBehavior>,
) {
  const renderedControl = behavior.isToggle ? (
    <Toggle
      value={behavior.value}
      pressed={behavior.pressed}
      defaultPressed={behavior.defaultPressed}
      onPressedChange={behavior.onPressedChange}
      disabled={behavior.effectiveDisabled}
      render={control}
    />
  ) : (
    control
  );

  return (
    <Toolbar.Button
      disabled={behavior.effectiveDisabled}
      focusableWhenDisabled={behavior.focusableWhenDisabled}
      render={renderedControl}
    />
  );
}

export function ToolbarButton({
  ref,
  className,
  disabled,
  focusableWhenDisabled = true,
  value,
  pressed,
  defaultPressed,
  onPressedChange,
  size: sizeProp,
  variant = 'text',
  ...props
}: ToolbarButtonProps) {
  const { size, reduceMotion } = useToolbarContext('ToolbarButton');
  const behavior = useToolbarControlBehavior({
    disabled,
    focusableWhenDisabled,
    value,
    pressed,
    defaultPressed,
    onPressedChange,
  });

  return renderToolbarControl(
    <MotionToolbarButtonControl
      ref={ref}
      {...motionItemProps(reduceMotion)}
      {...props}
      disabled={behavior.effectiveDisabled}
      focusableWhenDisabled={focusableWhenDisabled}
      size={sizeProp ?? size}
      variant={variant}
      className={cx('shrink-0 rounded-full', className)}
    />,
    behavior,
  );
}

export function ToolbarIconButton({
  ref,
  className,
  disabled,
  focusableWhenDisabled = true,
  value,
  pressed,
  defaultPressed,
  onPressedChange,
  size: sizeProp,
  variant = 'text',
  tooltip,
  tooltipSide,
  ...props
}: ToolbarIconButtonProps) {
  const { orientation, size, reduceMotion } =
    useToolbarContext('ToolbarIconButton');
  const behavior = useToolbarControlBehavior({
    disabled,
    focusableWhenDisabled,
    value,
    pressed,
    defaultPressed,
    onPressedChange,
  });
  const control = renderToolbarControl(
    <MotionToolbarIconButtonControl
      ref={ref}
      {...motionItemProps(reduceMotion)}
      {...props}
      disabled={behavior.effectiveDisabled}
      focusableWhenDisabled={focusableWhenDisabled}
      size={sizeProp ?? size}
      variant={variant}
      className={cx('shrink-0', className)}
    />,
    behavior,
  );
  const automaticTooltip =
    'aria-label' in props ? props['aria-label'] : undefined;
  const tooltipContent =
    tooltip === false ? undefined : (tooltip ?? automaticTooltip);

  if (!tooltipContent) return control;

  return (
    <Tooltip>
      <TooltipTrigger render={control} />
      <TooltipContent
        side={tooltipSide ?? (orientation === 'vertical' ? 'right' : undefined)}
      >
        {tooltipContent}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Composes an animated toolbar control with Fresco's accessible dropdown menu.
 * The popup defaults to the right of a vertical toolbar and below a horizontal
 * toolbar, while callers can override the side through `contentProps`.
 */
export function ToolbarMenu({
  ref,
  trigger,
  children,
  contentProps,
  ...props
}: ToolbarMenuProps) {
  const { orientation } = useToolbarContext('ToolbarMenu');
  const mergedRef = useMergedButtonRef(ref, trigger.props.ref);
  const triggerWithRef = React.cloneElement(trigger, { ref: mergedRef });

  return (
    <DropdownMenu {...props}>
      <DropdownMenuTrigger render={triggerWithRef} />
      <DropdownMenuContent
        {...contentProps}
        side={
          contentProps?.side ??
          (orientation === 'vertical' ? 'right' : 'bottom')
        }
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Composes an animated toolbar control with Fresco's accessible popover.
 * The popup defaults to the right of a vertical toolbar and below a horizontal
 * toolbar, while callers can override the side through `contentProps`.
 */
export function ToolbarPopover({
  ref,
  trigger,
  children,
  contentProps,
  ...props
}: ToolbarPopoverProps) {
  const { orientation } = useToolbarContext('ToolbarPopover');
  const mergedRef = useMergedButtonRef(ref, trigger.props.ref);
  const triggerWithRef = React.cloneElement(trigger, { ref: mergedRef });

  return (
    <Popover {...props}>
      <PopoverTrigger render={triggerWithRef} />
      <PopoverContent
        {...contentProps}
        side={
          contentProps?.side ??
          (orientation === 'vertical' ? 'right' : 'bottom')
        }
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

function AnimatedChildren({ children }: { children?: React.ReactNode }) {
  const motionChildren = React.Children.toArray(children);

  for (const child of motionChildren) {
    const component = React.isValidElement(child) ? child.type : null;
    const isObjectLike =
      typeof component === 'function' ||
      (typeof component === 'object' && component !== null);

    if (
      !isObjectLike ||
      Reflect.get(component, TOOLBAR_MOTION_CHILD) !== true
    ) {
      throw new Error(
        'SegmentedToolbar only accepts its Toolbar* components as direct children. Custom wrappers must declare and forward a ref, then be registered with defineToolbarChild().',
      );
    }
  }

  return (
    <AnimatePresence initial={false} mode="popLayout">
      {motionChildren}
    </AnimatePresence>
  );
}

export function ToolbarGroup({
  ref,
  children,
  className,
  disabled = false,
  ...props
}: ToolbarGroupProps) {
  const { orientation, reduceMotion } = useToolbarContext('ToolbarGroup');
  const inheritedDisabled = React.useContext(GroupDisabledContext);
  const effectiveDisabled = inheritedDisabled || disabled;

  return (
    <Toolbar.Group
      ref={ref}
      {...props}
      disabled={effectiveDisabled}
      render={
        <motion.div
          {...motionItemProps(reduceMotion)}
          className={cx(
            'relative flex items-center gap-1',
            orientation === 'vertical' && 'flex-col',
            className,
          )}
        />
      }
    >
      <GroupDisabledContext.Provider value={effectiveDisabled}>
        <AnimatedChildren>{children}</AnimatedChildren>
      </GroupDisabledContext.Provider>
    </Toolbar.Group>
  );
}

export function ToolbarToggleGroup({
  ref,
  children,
  className,
  disabled = false,
  orientation: orientationProp,
  value,
  onValueChange,
  ...props
}: ToolbarToggleGroupProps) {
  const { orientation, reduceMotion } = useToolbarContext('ToolbarToggleGroup');
  const inheritedDisabled = React.useContext(GroupDisabledContext);
  const isUncontrollable = value !== undefined && !onValueChange;
  const effectiveDisabled = inheritedDisabled || disabled || isUncontrollable;

  return (
    <ToggleGroup
      ref={ref}
      {...props}
      value={value}
      onValueChange={onValueChange}
      disabled={effectiveDisabled}
      orientation={orientationProp ?? orientation}
      render={
        <motion.div
          {...motionItemProps(reduceMotion)}
          className={cx(
            'relative flex items-center gap-1',
            (orientationProp ?? orientation) === 'vertical' && 'flex-col',
            className,
          )}
        />
      }
    >
      <GroupDisabledContext.Provider value={effectiveDisabled}>
        <ToggleGroupItemContext.Provider value>
          <AnimatedChildren>{children}</AnimatedChildren>
        </ToggleGroupItemContext.Provider>
      </GroupDisabledContext.Provider>
    </ToggleGroup>
  );
}

export function ToolbarSeparator({
  ref,
  className,
  ...props
}: ToolbarSeparatorProps) {
  const { orientation, reduceMotion } = useToolbarContext('ToolbarSeparator');
  const separatorOrientation =
    orientation === 'horizontal' ? 'vertical' : 'horizontal';

  return (
    <Toolbar.Separator
      ref={ref}
      {...props}
      orientation={separatorOrientation}
      render={
        <motion.div
          {...motionItemProps(reduceMotion)}
          className={cx(
            'shrink-0 rounded-full bg-current/20',
            orientation === 'horizontal' ? 'mx-1 h-6 w-px' : 'my-1 h-px w-6',
            className,
          )}
        />
      }
    />
  );
}

// `AnimatedChildren` checks this registry at runtime, while
// `defineToolbarChild` checks at compile time that every registered component
// exposes the React 19 ref prop required by Motion's `popLayout` mode.
defineToolbarChild(ToolbarButton);
defineToolbarChild(ToolbarIconButton);
defineToolbarChild(ToolbarMenu);
defineToolbarChild(ToolbarPopover);
defineToolbarChild(ToolbarGroup);
defineToolbarChild(ToolbarToggleGroup);
defineToolbarChild(ToolbarSeparator);

const NUDGE_STEP = 8;

const dragHandleSizes: Record<SegmentSize, string> = {
  sm: 'p-1 [&_svg]:size-4',
  md: 'p-1.5 [&_svg]:size-5',
  lg: 'p-2 [&_svg]:size-6',
};

/**
 * The drag handle sits outside role="toolbar" so its arrow keys move the
 * complete toolbar rather than competing with the toolbar's roving focus.
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

export function SegmentedToolbar({
  children,
  orientation = 'horizontal',
  size = 'md',
  draggable = false,
  defaultPosition,
  position,
  onPositionChange,
  dragConstraints,
  dragHandleLabel = 'Move toolbar',
  className,
  disabled = false,
  ...props
}: SegmentedToolbarProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const layoutGroupId = React.useId();
  const dragControls = useDragControls();
  const [announcement, setAnnouncement] = React.useState('');
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

  const context = React.useMemo<ToolbarContextValue>(
    () => ({ orientation, size, reduceMotion }),
    [orientation, reduceMotion, size],
  );

  const innerToolbar = (
    <ToolbarContext.Provider value={context}>
      <Toolbar.Root
        {...props}
        disabled={disabled}
        orientation={orientation}
        className={cx(
          'relative flex min-w-0 items-center gap-1',
          orientation === 'vertical'
            ? 'flex-col'
            : 'm-[-5px] overflow-x-auto overscroll-x-contain p-[5px]',
        )}
      >
        <GroupDisabledContext.Provider value={disabled}>
          <AnimatedChildren>{children}</AnimatedChildren>
        </GroupDisabledContext.Provider>
      </Toolbar.Root>
    </ToolbarContext.Provider>
  );

  const surfaceTransition: Transition = reduceMotion
    ? { duration: 0 }
    : { layout: layoutSpring };

  if (!draggable) {
    return (
      <LayoutGroup id={layoutGroupId} inherit={false}>
        <MotionSurface
          floating
          shadow="none"
          spacing="none"
          noContainer
          layout
          style={{ borderRadius: surfaceRadius[size] }}
          transition={surfaceTransition}
          className={cx(rootLayoutVariants({ orientation }), className)}
        >
          {innerToolbar}
        </MotionSurface>
      </LayoutGroup>
    );
  }

  return (
    <LayoutGroup id={layoutGroupId} inherit={false}>
      <MotionSurface
        data-motion-drag-container="segmented-toolbar"
        floating
        shadow="none"
        spacing="none"
        noContainer
        layout="size"
        drag
        dragListener={false}
        dragControls={dragControls}
        dragMomentum={false}
        dragConstraints={dragConstraints}
        onDragEnd={() => onPositionChange?.({ x: x.get(), y: y.get() })}
        style={{ x, y, borderRadius: surfaceRadius[size] }}
        transition={surfaceTransition}
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
