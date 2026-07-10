import type React from 'react';
import { useCallback, useContext, useEffect, useState } from 'react';

import { cx } from '~/utils/cva';

import Switch from '../NewComponents/Switch';
import SectionDepthContext from './SectionDepthContext';

const containerClasses =
  'p-6 shadow-md rounded bg-(--current-surface) text-(--current-surface-contrast) relative';

// Surface tokens by nesting level (capped at surface-3). Class strings are
// written out in full so Tailwind's scanner picks up the arbitrary properties.
const surfaceClassesByLevel: Record<number, string> = {
  1: '[--current-surface-contrast:var(--surface-1-contrast)] [--current-surface:var(--surface-1)]',
  2: '[--current-surface-contrast:var(--surface-2-contrast)] [--current-surface:var(--surface-2)]',
  3: '[--current-surface-contrast:var(--surface-3-contrast)] [--current-surface:var(--surface-3)]',
};

type SectionProps = {
  id?: string | null;
  title?: React.ReactNode;
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
  required?: boolean;
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
  required = true,
}: SectionProps) => {
  const depth = useContext(SectionDepthContext);
  const surfaceLevel = Math.min(depth + 1, 3);

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

  // In the "horizontal" layout, below the tablet-landscape: breakpoint we
  // render the section as the "vertical" layout
  const classes = cx(
    layout === 'horizontal' &&
      'tablet-landscape:min-w-2xl tablet-landscape:overflow-hidden tablet-landscape:rounded tablet-landscape:bg-(--current-surface) tablet-landscape:p-6 tablet-landscape:text-(--current-surface-contrast) tablet-landscape:shadow-md',
    'relative',
  );

  return (
    <SectionDepthContext.Provider value={depth + 1}>
      <div
        id={id ?? undefined}
        data-name={typeof title === 'string' ? title : undefined}
        className={cx(
          '[--input-background:var(--surface-1)] [--slider-color:oklch(var(--charcoal))]',
          'relative',
          surfaceClassesByLevel[surfaceLevel],
          'w-full max-w-7xl min-w-0',
          layout === 'horizontal' &&
            'max-tablet-landscape:mb-4 max-tablet-landscape:flex max-tablet-landscape:flex-col max-tablet-landscape:gap-5 max-tablet-landscape:rounded max-tablet-landscape:bg-(--current-surface) max-tablet-landscape:p-6 max-tablet-landscape:text-(--current-surface-contrast) max-tablet-landscape:shadow-md tablet-landscape:grid tablet-landscape:grid-cols-[20rem_auto] tablet-landscape:gap-8',
          layout === 'vertical' && 'mb-4 flex flex-col gap-5',
          layout === 'vertical' && containerClasses,
          className,
        )}
      >
        {title != null && (
          <div>
            <div
              className={cx(
                'flex items-center gap-4 text-right',
                layout === 'vertical' && 'text-xl font-semibold tracking-tight',
                // `tablet-landscape:top-24` (6rem) pins the heading just below
                // the sticky top menu bar so it never overlaps it; `z-1` keeps
                // it above the section content but below the nav.
                layout === 'horizontal' &&
                  'tablet-landscape:small-heading tablet-landscape:bg-outline max-tablet-landscape:text-xl max-tablet-landscape:font-semibold max-tablet-landscape:tracking-tight tablet-landscape:sticky tablet-landscape:top-24 tablet-landscape:z-1 tablet-landscape:flex-row-reverse tablet-landscape:items-center tablet-landscape:justify-between tablet-landscape:rounded tablet-landscape:px-6 tablet-landscape:py-2',
              )}
            >
              <span>
                {title}
                {!toggleable && required && (
                  <span className="text-destructive ms-1">*</span>
                )}
              </span>
              {toggleable && (
                <Switch
                  title="Turn this feature on or off"
                  checked={isOpen}
                  onCheckedChange={changeToggleState}
                  disabled={disabled}
                  className={cx(
                    'shrink-0 grow-0',
                    disabled && 'cursor-not-allowed opacity-50',
                  )}
                />
              )}
            </div>
            <div className="text-current/70">{summary}</div>
          </div>
        )}
        <fieldset className={cx('min-w-0', classes)}>
          {disabled ? (
            layout === 'horizontal' ? (
              <div className="bg-outline/75 text-text/70 max-tablet-landscape:rounded max-tablet-landscape:p-8 max-tablet-landscape:text-center tablet-landscape:absolute tablet-landscape:inset-0 tablet-landscape:h-full tablet-landscape:w-full flex items-center justify-center font-semibold italic">
                {disabledMessage}
              </div>
            ) : (
              <div className="bg-outline/75 text-text/70 flex items-center justify-center rounded p-8 text-center font-semibold italic">
                {disabledMessage}
              </div>
            )
          ) : (
            <>
              {isOpen && children}
              {toggleable && !isOpen && layout !== 'vertical' && (
                <div className="bg-outline/75 text-text/70 max-tablet-landscape:hidden absolute inset-0 flex h-full w-full items-center justify-center font-semibold italic">
                  Click the toggle to enable this feature...
                </div>
              )}
            </>
          )}
        </fieldset>
      </div>
    </SectionDepthContext.Provider>
  );
};

export default Section;
