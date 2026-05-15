import type React from 'react';
import { useCallback, useEffect, useState } from 'react';

import { cn } from '~/utils/cn';

import IssueAnchor from '../IssueAnchor';
import Switch from '../NewComponents/Switch';

const containerClasses =
  'p-6 shadow-md rounded bg-(--current-surface) text-(--current-surface-foreground) relative';

type SectionProps = {
  id?: string | null;
  title: string;
  summary?: React.ReactNode;
  disabled?: boolean;
  disabledMessage?: string;
  group?: boolean;
  children: React.ReactNode;
  className?: string;
  toggleable?: boolean;
  startExpanded?: boolean;
  handleToggleChange?: (state: boolean) => Promise<boolean> | boolean;
  layout?: 'horizontal' | 'vertical';
};

const Section = ({
  id = null,
  title,
  summary = null,
  disabled = false,
  disabledMessage = 'Complete the required options above to enable this section.',
  group: _group = false,
  children,
  className = '',
  toggleable = false,
  startExpanded = true,
  handleToggleChange = (state) => state,
  layout = 'horizontal',
}: SectionProps) => {
  const [isOpen, setIsOpen] = useState(startExpanded);

  // If the startExpanded prop changes, update the state.
  // This happens when a stage is reset
  useEffect(() => {
    setIsOpen(startExpanded);
  }, [startExpanded]);

  const changeToggleState = useCallback(async () => {
    // Save the intended state here, so that if startExpanded changes
    // in the meantime, we don't inadvertently change the open state
    // back.
    const intendedState = !isOpen;
    const result = await handleToggleChange(!isOpen);

    // If result of the callback, update the state with intendedState
    if (result) {
      setIsOpen(intendedState);
    }
  }, [isOpen, handleToggleChange]);

  // In the "horizontal" layout, below the lg: breakpoint we render the section
  // as the "vertical" layout
  const classes = cn(
    layout === 'horizontal' &&
      'lg:min-w-2xl lg:rounded lg:bg-(--current-surface) lg:p-6 lg:text-(--current-surface-foreground) lg:shadow-md',
    'relative',
  );

  return (
    <div
      className={cn(
        '[--input-background:var(--color-surface-1)] [--slider-color:hsl(var(--charcoal))]',
        'relative [--current-surface-foreground:var(--color-surface-1-foreground)] [--current-surface:var(--color-surface-1)]',
        'w-full max-w-7xl',
        layout === 'horizontal' &&
          'max-lg:mb-4 max-lg:flex max-lg:flex-col max-lg:gap-(--space-md) max-lg:rounded max-lg:bg-(--current-surface) max-lg:p-6 max-lg:text-(--current-surface-foreground) max-lg:shadow-md lg:grid lg:grid-cols-[20rem_auto] lg:gap-8',
        layout === 'vertical' && 'mb-4 flex flex-col gap-(--space-md)',
        layout === 'vertical' && containerClasses,
        className,
      )}
    >
      <div>
        <legend
          className={cn(
            'flex items-center gap-4 text-right',
            layout === 'vertical' && 'text-xl font-semibold tracking-tight',
            layout === 'horizontal' &&
              'lg:small-heading lg:bg-border max-lg:text-xl max-lg:font-semibold max-lg:tracking-tight lg:sticky lg:top-2 lg:flex-row-reverse lg:items-center lg:justify-between lg:rounded lg:px-6 lg:py-2',
          )}
        >
          <span>
            {title}
            {!toggleable && <span className="text-error ms-1">*</span>}
          </span>
          {toggleable && (
            <Switch
              title="Turn this feature on or off"
              checked={isOpen}
              onCheckedChange={changeToggleState}
              disabled={disabled}
              className={cn(
                'shrink-0 grow-0',
                disabled && 'cursor-not-allowed opacity-50',
              )}
            />
          )}
        </legend>
        <div className="text-current/70">{summary}</div>
      </div>
      <fieldset className={classes}>
        {disabled ? (
          layout === 'horizontal' ? (
            <div className="bg-border/75 text-foreground/70 flex items-center justify-center rounded font-semibold italic max-lg:p-8 max-lg:text-center lg:absolute lg:inset-0 lg:h-full lg:w-full">
              {disabledMessage}
            </div>
          ) : (
            <div className="bg-border/75 text-foreground/70 flex items-center justify-center rounded p-8 text-center font-semibold italic">
              {disabledMessage}
            </div>
          )
        ) : (
          <>
            {isOpen && children}
            {toggleable && !isOpen && layout !== 'vertical' && (
              <div className="bg-border/75 text-foreground/70 absolute inset-0 flex h-full w-full items-center justify-center font-semibold italic max-lg:hidden">
                Click the toggle to enable this feature...
              </div>
            )}
          </>
        )}
        {id && <IssueAnchor fieldName={id} description={title} />}
      </fieldset>
    </div>
  );
};

export default Section;
