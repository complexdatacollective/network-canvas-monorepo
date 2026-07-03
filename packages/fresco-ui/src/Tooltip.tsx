'use client';

import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import { AnimatePresence } from 'motion/react';
import * as React from 'react';

import { MotionSurface } from './layout/Surface';
import { ArrowSvg } from './Popover';
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
        >
          <AnimatePresence>
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
                  exit={{ opacity: 0, scale: 0.96 }}
                  noContainer
                  transition={{ type: 'spring', duration: 0.5 }}
                />
              }
              {...props}
            >
              {showArrow && <TooltipArrow />}
              {children}
            </BaseTooltip.Popup>
          </AnimatePresence>
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
    className={cx(
      'data-[side=bottom]:top-[-15px] data-[side=left]:right-[-20px] data-[side=left]:rotate-90 data-[side=right]:left-[-20px] data-[side=right]:-rotate-90 data-[side=top]:bottom-[-15px] data-[side=top]:rotate-180',
      className,
    )}
    {...props}
  >
    <ArrowSvg />
  </BaseTooltip.Arrow>
));
TooltipArrow.displayName = 'TooltipArrow';

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
