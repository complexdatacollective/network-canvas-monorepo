'use client';

import * as React from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from './Tooltip';
import { cx } from './utils/cva';

type TooltipContentProps = React.ComponentPropsWithoutRef<
  typeof TooltipContent
>;

export type DefinitionProps = Omit<
  React.HTMLAttributes<HTMLElement>,
  'children' | 'tabIndex' | 'title'
> & {
  /** The term or phrase that the definition describes. */
  children: React.ReactNode;
  /** The expanded definition shown on hover, keyboard focus, or press. */
  definition: React.ReactNode;
  /** Render the term as an `abbr` element when it is an abbreviation. */
  asAbbreviation?: boolean;
  side?: TooltipContentProps['side'];
  align?: TooltipContentProps['align'];
  sideOffset?: TooltipContentProps['sideOffset'];
  showArrow?: TooltipContentProps['showArrow'];
};

const Definition = React.forwardRef<HTMLElement, DefinitionProps>(
  (
    {
      children,
      definition,
      asAbbreviation = false,
      side,
      align,
      sideOffset,
      showArrow,
      className,
      'aria-describedby': ariaDescribedByProp,
      onClick,
      ...props
    },
    ref,
  ) => {
    const [open, setOpen] = React.useState(false);
    const Element = asAbbreviation ? 'abbr' : 'span';
    const descriptionId = React.useId();
    const ariaDescribedBy = ariaDescribedByProp
      ? `${ariaDescribedByProp} ${descriptionId}`
      : descriptionId;

    return (
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger
          closeOnClick={false}
          render={
            <Element
              ref={ref}
              className={cx(
                'text-link focusable inline-block cursor-help rounded-sm underline decoration-dashed decoration-1 underline-offset-2',
                className,
              )}
              {...props}
              aria-describedby={ariaDescribedBy}
              onClick={(event) => {
                onClick?.(event);
                if (!event.defaultPrevented) {
                  setOpen(true);
                }
              }}
              tabIndex={0}
            />
          }
        >
          {children}
        </TooltipTrigger>
        <span id={descriptionId} className="sr-only">
          {definition}
        </span>
        <TooltipContent
          aria-hidden="true"
          className="w-max max-w-[min(var(--available-width),var(--container-sm))] text-pretty"
          side={side}
          align={align}
          sideOffset={sideOffset}
          showArrow={showArrow}
        >
          {definition}
        </TooltipContent>
      </Tooltip>
    );
  },
);

Definition.displayName = 'Definition';

export default Definition;
