'use client';

import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { Toolbar } from '@base-ui/react/toolbar';
import { GripHorizontal, GripVertical } from 'lucide-react';
import {
  AnimatePresence,
  motion,
  useDragControls,
  useReducedMotion,
} from 'motion/react';
import * as React from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '../Tooltip';
import { cva, cx, type VariantProps } from '../utils/cva';

export type ButtonColor =
  | 'default'
  | 'dynamic'
  | 'primary'
  | 'secondary'
  | 'warning'
  | 'info'
  | 'destructive'
  | 'success';

export type SegmentContent = {
  /** Accessible name. Always the aria-label; rendered as visible text when showLabel. */
  label: string;
  /** Optional Lucide icon (or any node). Rendered aria-hidden. */
  icon?: React.ReactNode;
  /**
   * Render the label as visible text.
   * Default: false when an icon is present (icon-only + tooltip), true when no icon.
   */
  showLabel?: boolean;
  /** Optional colour token passthrough. */
  color?: ButtonColor;
};

export type ButtonSegment = {
  type: 'button';
  id: string;
  disabled?: boolean;
  onClick: () => void;
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

export type ToolbarSegment =
  | ButtonSegment
  | ToggleSegment
  | GroupSegment
  | SeparatorSegment;

export type Position = { x: number; y: number };

export type SegmentedToolbarProps = {
  /** Accessible name for the toolbar (role="toolbar" requires a label). */
  label: string;
  items: ToolbarSegment[];
  /** @default 'horizontal' */
  orientation?: 'horizontal' | 'vertical';
  /** @default 'md' */
  size?: 'sm' | 'md' | 'lg';
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
    | React.RefObject<Element>
    | { top: number; left: number; right: number; bottom: number };
  /** Accessible name for the drag handle. @default 'Move toolbar' */
  dragHandleLabel?: string;
};

const rootVariants = cva({
  base: cx(
    'flex w-fit items-center gap-1 rounded-full p-1.5',
    'bg-surface-1 text-surface-1-contrast elevation-medium',
  ),
  variants: {
    orientation: {
      horizontal: 'flex-row',
      vertical: 'flex-col',
    },
  },
  defaultVariants: { orientation: 'horizontal' },
});

const segmentVariants = cva({
  base: cx(
    'relative inline-flex shrink-0 cursor-pointer items-center justify-center select-none',
    'font-heading font-bold tracking-wide whitespace-nowrap text-current',
    'rounded-full border-0 bg-transparent',
    'focusable',
    'spring-medium transition-colors',
    'hover:enabled:bg-current/10',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'data-pressed:bg-selected data-pressed:text-selected-contrast',
  ),
  variants: {
    size: {
      sm: 'h-9 gap-1.5 text-sm',
      md: 'h-11 gap-2 text-base',
      lg: 'h-14 gap-2.5 text-lg',
    },
    iconOnly: {
      true: 'aspect-square p-0',
      false: 'px-4',
    },
  },
  defaultVariants: { size: 'md', iconOnly: false },
});

type SegmentSize = NonNullable<VariantProps<typeof segmentVariants>['size']>;

/** Whether a segment's text should be visible (vs icon-only). */
function isLabelVisible(content: SegmentContent): boolean {
  return content.showLabel ?? !content.icon;
}

function SegmentContentInner({ icon, label, showLabel }: SegmentContent) {
  const labelVisible = showLabel ?? !icon;
  return (
    <>
      {icon ? (
        <span aria-hidden className="contents">
          {icon}
        </span>
      ) : null}
      {labelVisible ? <span>{label}</span> : null}
    </>
  );
}

function ToolbarButtonSegment({
  segment,
  size,
}: {
  segment: ButtonSegment;
  size: SegmentSize;
}) {
  const labelVisible = isLabelVisible(segment);
  const button = (
    <Toolbar.Button
      disabled={segment.disabled}
      onClick={segment.onClick}
      aria-label={labelVisible ? undefined : segment.label}
      className={segmentVariants({ size, iconOnly: !labelVisible })}
    >
      <SegmentContentInner {...segment} />
    </Toolbar.Button>
  );

  // Icon-only: expose the label via a tooltip on hover/focus.
  if (!labelVisible) {
    return (
      <Tooltip>
        <TooltipTrigger render={button} />
        <TooltipContent>{segment.label}</TooltipContent>
      </Tooltip>
    );
  }
  return button;
}

function ToolbarToggleSegment({
  segment,
  size,
}: {
  segment: ToggleSegment;
  size: SegmentSize;
}) {
  const labelVisible = isLabelVisible(segment);
  const toggle = (
    <Toolbar.Button
      render={
        <Toggle
          pressed={segment.pressed}
          defaultPressed={segment.defaultPressed}
          onPressedChange={(pressed) => segment.onPressedChange?.(pressed)}
          disabled={segment.disabled}
          aria-label={labelVisible ? undefined : segment.label}
          className={segmentVariants({ size, iconOnly: !labelVisible })}
        />
      }
    >
      <SegmentContentInner {...segment} />
    </Toolbar.Button>
  );

  if (!labelVisible) {
    return (
      <Tooltip>
        <TooltipTrigger render={toggle} />
        <TooltipContent>{segment.label}</TooltipContent>
      </Tooltip>
    );
  }
  return toggle;
}

function ToolbarGroupSegment({
  segment,
  size,
}: {
  segment: GroupSegment;
  size: SegmentSize;
}) {
  return (
    <ToggleGroup
      multiple={segment.mode === 'multiple'}
      value={segment.value}
      defaultValue={segment.defaultValue}
      onValueChange={(value) => segment.onValueChange?.(value)}
      className="flex items-center gap-1"
    >
      {segment.options.map((option) => {
        const labelVisible = option.showLabel ?? !option.icon;
        const toggle = (
          <Toolbar.Button
            render={
              <Toggle
                value={option.value}
                disabled={option.disabled}
                aria-label={labelVisible ? undefined : option.label}
                className={segmentVariants({ size, iconOnly: !labelVisible })}
              />
            }
          >
            <SegmentContentInner {...option} />
          </Toolbar.Button>
        );
        if (!labelVisible) {
          return (
            <Tooltip key={option.value}>
              <TooltipTrigger render={toggle} />
              <TooltipContent>{option.label}</TooltipContent>
            </Tooltip>
          );
        }
        return <React.Fragment key={option.value}>{toggle}</React.Fragment>;
      })}
    </ToggleGroup>
  );
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

/**
 * DragHandle is intentionally outside role="toolbar" so its arrow keys move
 * the toolbar rather than competing with the toolbar's roving-focus navigation.
 */
function DragHandle({
  label,
  orientation,
  size,
  onPointerDown,
  onNudge,
}: {
  label: string;
  orientation: 'horizontal' | 'vertical';
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
        segmentVariants({ size, iconOnly: true }),
        'cursor-grab touch-none active:cursor-grabbing',
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
  orientation: 'horizontal' | 'vertical',
  reduce: boolean,
) {
  const inner = (() => {
    switch (segment.type) {
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
        return <ToolbarGroupSegment segment={segment} size={size} />;
      case 'toggle':
        return <ToolbarToggleSegment segment={segment} size={size} />;
      case 'button':
        return <ToolbarButtonSegment segment={segment} size={size} />;
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
  const isControlled = position !== undefined;
  const [internalPos, setInternalPos] = React.useState<Position>(
    defaultPosition ?? { x: 0, y: 0 },
  );
  const [announcement, setAnnouncement] = React.useState('');
  const pos = isControlled ? position : internalPos;

  const commitPosition = (next: Position) => {
    if (!isControlled) setInternalPos(next);
    onPositionChange?.(next);
  };

  const handleNudge = (delta: Position) => {
    const next = { x: pos.x + delta.x, y: pos.y + delta.y };
    commitPosition(next);
    setAnnouncement(
      `Toolbar moved to ${Math.round(next.x)}, ${Math.round(next.y)}`,
    );
  };

  const toolbar = (
    <Toolbar.Root
      orientation={orientation}
      aria-label={label}
      render={draggable ? <div /> : <motion.div layout />}
      className={cx(
        draggable ? 'flex items-center gap-1' : rootVariants({ orientation }),
        draggable && orientation === 'vertical' && 'flex-col',
        className,
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {items.map((segment) =>
          renderSegment(segment, size, orientation, reduce),
        )}
      </AnimatePresence>
    </Toolbar.Root>
  );

  if (!draggable) {
    return toolbar;
  }

  return (
    <motion.div
      layout
      drag
      dragListener={false}
      dragControls={dragControls}
      dragMomentum={false}
      dragConstraints={dragConstraints}
      onDragEnd={(_event, info) =>
        commitPosition({ x: pos.x + info.offset.x, y: pos.y + info.offset.y })
      }
      animate={{ x: pos.x, y: pos.y }}
      transition={reduce ? { duration: 0 } : segmentSpring}
      className={cx(rootVariants({ orientation }), className)}
    >
      <DragHandle
        label={dragHandleLabel}
        orientation={orientation}
        size={size}
        onPointerDown={(event) => dragControls.start(event)}
        onNudge={handleNudge}
      />
      {toolbar}
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </motion.div>
  );
}

export default SegmentedToolbar;
