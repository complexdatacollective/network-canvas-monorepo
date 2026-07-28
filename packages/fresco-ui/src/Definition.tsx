'use client';

import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
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
  /** Replace the term element, typically with a router link. */
  render?: React.ReactElement<React.RefAttributes<HTMLElement>>;
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
      render,
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
    const [tooltipHandle] = React.useState(() => BaseTooltip.createHandle());
    const Element = asAbbreviation ? 'abbr' : 'span';
    const descriptionId = React.useId();
    const triggerId = React.useId();
    const ariaDescribedBy = ariaDescribedByProp
      ? `${ariaDescribedByProp} ${descriptionId}`
      : descriptionId;

    return (
      <Tooltip handle={tooltipHandle}>
        <TooltipTrigger
          closeOnClick={Boolean(render)}
          handle={tooltipHandle}
          id={triggerId}
          className={cx(
            'text-link focusable inline-block rounded-sm underline decoration-dashed decoration-2 underline-offset-3',
            render ? 'cursor-pointer' : 'cursor-help',
            className,
          )}
          {...props}
          aria-describedby={ariaDescribedBy}
          onClick={(event) => {
            onClick?.(event);
            if (!render && !event.defaultPrevented) {
              tooltipHandle.open(triggerId);
            }
          }}
          tabIndex={render ? undefined : 0}
          render={
            render ? React.cloneElement(render, { ref }) : <Element ref={ref} />
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
