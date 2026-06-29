'use client';

import { Toolbar } from '@base-ui/react/toolbar';
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

export type SeparatorSegment = {
  type: 'separator';
  id: string;
};

export type ToolbarSegment = ButtonSegment | SeparatorSegment;

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

function renderSegment(
  segment: ToolbarSegment,
  size: SegmentSize,
  orientation: 'horizontal' | 'vertical',
) {
  switch (segment.type) {
    case 'separator':
      return (
        <Toolbar.Separator
          key={segment.id}
          orientation={orientation === 'horizontal' ? 'vertical' : 'horizontal'}
          className={cx(
            'shrink-0 rounded-full bg-current/20',
            orientation === 'horizontal' ? 'mx-1 h-6 w-px' : 'my-1 h-px w-6',
          )}
        />
      );
    case 'button':
      return (
        <ToolbarButtonSegment key={segment.id} segment={segment} size={size} />
      );
  }
}

export function SegmentedToolbar({
  label,
  items,
  orientation = 'horizontal',
  size = 'md',
  className,
}: SegmentedToolbarProps) {
  return (
    <Toolbar.Root
      orientation={orientation}
      aria-label={label}
      className={cx(rootVariants({ orientation }), className)}
    >
      {items.map((segment) => renderSegment(segment, size, orientation))}
    </Toolbar.Root>
  );
}

export default SegmentedToolbar;
