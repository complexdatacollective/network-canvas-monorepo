'use client';

import * as React from 'react';

import { Button, type ButtonProps } from './Button';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import { cx } from './utils/cva';

type SplitButtonSegmentPosition = 'left' | 'right';

type SplitButtonPopoverOpenProps = Pick<
  React.ComponentProps<typeof Popover>,
  'defaultOpen' | 'onOpenChange' | 'open'
>;

type SplitButtonPopoverProps = Omit<
  React.ComponentProps<typeof PopoverContent>,
  'children' | 'content'
> & {
  content: React.ReactNode;
};

type SplitButtonSegmentBaseProps = Omit<
  ButtonProps,
  | 'aria-label'
  | 'asChild'
  | 'children'
  | 'color'
  | 'icon'
  | 'iconPosition'
  | 'popover'
  | 'size'
  | 'type'
  | 'variant'
> & {
  iconPosition?: ButtonProps['iconPosition'];
  position?: SplitButtonSegmentPosition;
};

export type SplitButtonSegmentProps =
  | (SplitButtonSegmentBaseProps & {
      'aria-label': string;
      'children'?: undefined;
      'icon': React.ReactNode;
    })
  | (SplitButtonSegmentBaseProps & {
      'aria-label'?: string;
      'children': React.ReactNode;
      'icon'?: React.ReactNode;
    });

export type SplitButtonProps = Omit<ButtonProps, 'asChild' | 'popover'> &
  SplitButtonPopoverOpenProps & {
    /**
     * Popover shown when the split segment is activated.
     */
    popover: SplitButtonPopoverProps;
    /**
     * Content, position, and accessible name for the split segment.
     */
    segment: SplitButtonSegmentProps;
  };

function hasVisibleContent(children: React.ReactNode): boolean {
  return children !== undefined && children !== null && children !== false;
}

function getPopoverContentProps<T extends { content: React.ReactNode }>({
  content: _content,
  ...contentProps
}: T): Omit<T, 'content'> {
  return contentProps;
}

function splitSegmentPaddingClass(size: ButtonProps['size']): string {
  switch (size) {
    case undefined:
      return 'px-4!';
    case 'sm':
      return 'px-3!';
    case 'lg':
      return 'px-5!';
    case 'xl':
      return 'px-6!';
    case 'md':
    default:
      return 'px-4!';
  }
}

function splitButtonGapClass(size: ButtonProps['size']): string {
  switch (size) {
    case 'sm':
      return 'gap-[0.16em] text-sm';
    case 'lg':
      return 'gap-[0.16em] text-lg';
    case 'xl':
      return 'gap-[0.16em] text-xl';
    case undefined:
    case 'md':
    default:
      return 'gap-[0.16em] text-base';
  }
}

function mainButtonRadiusClass(
  segmentPosition: SplitButtonSegmentPosition,
): string {
  return segmentPosition === 'left' ? 'rounded-l-none!' : 'rounded-r-none!';
}

function popoverSegmentRadiusClass(
  segmentPosition: SplitButtonSegmentPosition,
): string {
  return segmentPosition === 'left' ? 'rounded-r-none!' : 'rounded-l-none!';
}

function iconOnlySegmentAlignmentClass(
  segmentPosition: SplitButtonSegmentPosition,
): string {
  return segmentPosition === 'left'
    ? '[&>.lucide]:translate-x-0.5'
    : '[&>.lucide]:-translate-x-0.5';
}

const SplitButton = React.forwardRef<HTMLButtonElement, SplitButtonProps>(
  (
    {
      children,
      className,
      color,
      defaultOpen,
      disabled,
      icon,
      iconPosition,
      onOpenChange,
      open,
      popover,
      segment,
      size = 'md',
      type = 'button',
      variant,
      ...buttonProps
    },
    ref,
  ) => {
    const popoverContentProps = getPopoverContentProps(popover);
    const {
      'aria-label': segmentAriaLabel,
      className: segmentClassName,
      children: segmentChildren,
      disabled: segmentOwnDisabled,
      icon: segmentIcon,
      iconPosition: segmentIconPosition,
      position: segmentPositionProp,
      ...segmentProps
    } = segment;
    const segmentPosition = segmentPositionProp ?? 'right';
    const segmentHasVisibleContent = hasVisibleContent(segmentChildren);
    const segmentDisabled = disabled || segmentOwnDisabled;
    const segmentLabel = segmentHasVisibleContent
      ? segmentAriaLabel
      : (segmentAriaLabel ?? 'Open options');

    const mainButton = (
      <Button
        ref={ref}
        color={color}
        disabled={disabled}
        icon={icon}
        iconPosition={iconPosition}
        size={size}
        type={type}
        variant={variant}
        className={cx(
          'relative focus-visible:z-10',
          mainButtonRadiusClass(segmentPosition),
          className,
        )}
        {...buttonProps}
      >
        {children}
      </Button>
    );

    const popoverSegmentButton = (
      <Button
        aria-label={segmentLabel}
        color={color}
        disabled={segmentDisabled}
        icon={segmentIcon}
        iconPosition={segmentIconPosition}
        size={size}
        type="button"
        variant={variant}
        className={cx(
          'relative focus-visible:z-10',
          segmentHasVisibleContent
            ? splitSegmentPaddingClass(size)
            : 'aspect-square p-0!',
          segmentHasVisibleContent
            ? undefined
            : iconOnlySegmentAlignmentClass(segmentPosition),
          popoverSegmentRadiusClass(segmentPosition),
          segmentClassName,
        )}
        {...segmentProps}
      >
        {segmentHasVisibleContent ? segmentChildren : null}
      </Button>
    );

    return (
      <Popover
        defaultOpen={defaultOpen}
        onOpenChange={onOpenChange}
        open={open}
      >
        <div
          className={cx(
            'inline-flex shrink-0 items-stretch',
            splitButtonGapClass(size),
          )}
        >
          {segmentPosition === 'left' ? (
            <PopoverTrigger
              disabled={segmentDisabled}
              render={popoverSegmentButton}
            />
          ) : null}
          {mainButton}
          {segmentPosition === 'right' ? (
            <PopoverTrigger
              disabled={segmentDisabled}
              render={popoverSegmentButton}
            />
          ) : null}
        </div>
        <PopoverContent
          {...popoverContentProps}
          align={
            popoverContentProps.align ??
            (segmentPosition === 'left' ? 'start' : 'end')
          }
          side={popoverContentProps.side ?? 'bottom'}
        >
          {popover.content}
        </PopoverContent>
      </Popover>
    );
  },
);
SplitButton.displayName = 'SplitButton';

export default SplitButton;
export { SplitButton };
