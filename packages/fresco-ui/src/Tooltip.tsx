'use client';

import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import * as React from 'react';

import { MotionSurface } from './layout/Surface';
import { ArrowSvg } from './Popover';
import {
  POPOVER_ARROW_CLASS_NAME,
  POPOVER_ARROW_PADDING,
} from './popoverArrow';
import { usePortalContainer } from './PortalContainer';
import { cx } from './utils/cva';

const TooltipProvider = BaseTooltip.Provider;

const Tooltip = BaseTooltip.Root;

const TooltipTrigger = BaseTooltip.Trigger;

type TooltipContentProps = Omit<
  React.ComponentPropsWithoutRef<typeof BaseTooltip.Popup>,
  'children'
> & {
  sideOffset?: number;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  showArrow?: boolean;
  children?: React.ReactNode;
};

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof BaseTooltip.Popup>,
  TooltipContentProps
>(
  (
    {
      className,
      sideOffset = 10,
      side = 'top',
      align = 'center',
      showArrow = true,
      children,
      ...props
    },
    ref,
  ) => {
    const portalContainer = usePortalContainer();
    return (
      <BaseTooltip.Portal container={portalContainer ?? undefined}>
        <BaseTooltip.Positioner
          side={side}
          sideOffset={sideOffset}
          align={align}
          arrowPadding={POPOVER_ARROW_PADDING}
        >
          {/* Deliberately no exit animation: Base UI keeps a closing popup
              mounted until its animations finish, so an exit tween lets stale
              tooltips pile up when the provider group short-circuits the delay
              (fast scrubbing across a toolbar). Closing instantly guarantees a
              newly opened tooltip is the only one visible. */}
          <BaseTooltip.Popup
            ref={ref}
            render={
              <MotionSurface
                floating
                spacing="sm"
                shadow="sm"
                className={cx(
                  'max-w-(--available-width) overflow-visible text-sm',
                  className,
                )}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                noContainer
                transition={{ type: 'spring', duration: 0.5 }}
              />
            }
            {...props}
          >
            {showArrow && <TooltipArrow />}
            {children}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    );
  },
);
TooltipContent.displayName = 'TooltipContent';

type TooltipArrowProps = React.ComponentPropsWithoutRef<
  typeof BaseTooltip.Arrow
>;

const TooltipArrow = React.forwardRef<
  React.ElementRef<typeof BaseTooltip.Arrow>,
  TooltipArrowProps
>(({ className, ...props }, ref) => (
  <BaseTooltip.Arrow
    ref={ref}
    className={cx(POPOVER_ARROW_CLASS_NAME, className)}
    {...props}
  >
    <ArrowSvg />
  </BaseTooltip.Arrow>
));
TooltipArrow.displayName = 'TooltipArrow';

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
