'use client';

import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import * as React from 'react';

import { Popover, PopoverContent, PopoverTrigger } from './Popover';
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
  /** The expanded definition shown on hover or keyboard focus. */
  definition: React.ReactNode;
  /** Use an accessible popover when the definition contains links or controls. */
  interactive?: boolean;
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
      interactive = false,
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
    const [tooltipHandle] = React.useState(() => BaseTooltip.createHandle());
    const [interactiveOpen, setInteractiveOpen] = React.useState(false);
    const interactiveTriggerRef = React.useRef<HTMLElement | null>(null);
    const interactiveContentRef = React.useRef<HTMLDivElement | null>(null);
    const Element = asAbbreviation ? 'abbr' : 'span';
    const descriptionId = React.useId();
    const triggerId = React.useId();
    const setInteractiveTriggerRef = React.useCallback(
      (element: HTMLElement | null) => {
        interactiveTriggerRef.current = element;

        if (typeof ref === 'function') {
          ref(element);
        } else if (ref) {
          ref.current = element;
        }
      },
      [ref],
    );
    const keepInteractivePopoverOpen = React.useCallback(
      (nextFocusedElement: EventTarget | null) => {
        if (!(nextFocusedElement instanceof Node)) {
          return false;
        }

        return Boolean(
          interactiveTriggerRef.current?.contains(nextFocusedElement) ||
          interactiveContentRef.current?.contains(nextFocusedElement),
        );
      },
      [],
    );
    const ariaDescribedBy = ariaDescribedByProp
      ? `${ariaDescribedByProp} ${descriptionId}`
      : descriptionId;

    if (interactive) {
      return (
        <Popover
          open={interactiveOpen}
          triggerId={triggerId}
          onOpenChange={setInteractiveOpen}
        >
          <PopoverTrigger
            id={triggerId}
            openOnHover
            nativeButton={false}
            render={
              <Element
                ref={setInteractiveTriggerRef}
                className={cx(
                  'text-link focusable inline-block cursor-help rounded-sm underline decoration-dashed decoration-2 underline-offset-3',
                  className,
                )}
                {...props}
                aria-describedby={ariaDescribedByProp}
                onFocus={() => setInteractiveOpen(true)}
                onBlur={(event) => {
                  if (!keepInteractivePopoverOpen(event.relatedTarget)) {
                    setInteractiveOpen(false);
                  }
                }}
                onClick={(
                  event: React.MouseEvent<HTMLElement> & {
                    preventBaseUIHandler?: () => void;
                  },
                ) => {
                  onClick?.(event);
                  event.preventBaseUIHandler?.();
                }}
                tabIndex={0}
              >
                {children}
              </Element>
            }
          />
          <PopoverContent
            ref={interactiveContentRef}
            className="w-max max-w-[min(var(--available-width),var(--container-sm))] text-pretty"
            side={side}
            align={align}
            sideOffset={sideOffset}
            showArrow={showArrow}
            initialFocus={false}
            onFocus={() => setInteractiveOpen(true)}
            onBlur={(event) => {
              if (!keepInteractivePopoverOpen(event.relatedTarget)) {
                setInteractiveOpen(false);
              }
            }}
          >
            {definition}
          </PopoverContent>
        </Popover>
      );
    }

    return (
      <Tooltip handle={tooltipHandle}>
        <TooltipTrigger
          closeOnClick={false}
          handle={tooltipHandle}
          id={triggerId}
          render={
            <Element
              ref={ref}
              className={cx(
                'text-link focusable inline-block cursor-help rounded-sm underline decoration-dashed decoration-2 underline-offset-3',
                className,
              )}
              {...props}
              aria-describedby={ariaDescribedBy}
              {...(onClick ? { onClick } : {})}
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
