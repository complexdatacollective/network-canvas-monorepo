import type React from 'react';
import { useCallback, useEffect, useState } from 'react';

import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { headingVariants } from '@codaco/fresco-ui/typography/Heading';
import { cx } from '~/utils/cva';

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

  const sectionLabel = (
    <span
      className={cx(
        layout === 'vertical' &&
          headingVariants({
            level: 'h4',
            margin: 'none',
          }),
        layout === 'horizontal' &&
          headingVariants({
            level: 'h4',
            variant: 'all-caps',
            margin: 'none',
          }),
      )}
    >
      {title}
      {!toggleable && required && (
        <span className="text-destructive ms-1">*</span>
      )}
    </span>
  );

  const sectionHeader = title != null && (
    <div>
      <div
        className={cx(
          'flex items-center gap-4 text-right',
          // `tablet-landscape:top-24` (6rem) pins the heading just below
          // the sticky top menu bar so it never overlaps it; `z-1` keeps
          // it above the section content but below the nav.
          layout === 'horizontal' &&
            'tablet-landscape:bg-surface-2 tablet-landscape:sticky tablet-landscape:top-24 tablet-landscape:z-1 tablet-landscape:flex-row-reverse tablet-landscape:items-center tablet-landscape:justify-between tablet-landscape:rounded tablet-landscape:px-6 tablet-landscape:py-2',
        )}
      >
        {sectionLabel}
        {toggleable && (
          <ToggleField
            title="Turn this feature on or off"
            value={isOpen}
            onChange={() => void changeToggleState()}
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
  );

  const fieldsetContent = disabled ? (
    layout === 'horizontal' ? (
      <div className="bg-surface-2/75 text-text/70 max-tablet-landscape:rounded max-tablet-landscape:p-8 max-tablet-landscape:text-center tablet-landscape:absolute tablet-landscape:inset-0 tablet-landscape:h-full tablet-landscape:w-full flex items-center justify-center font-semibold italic">
        {disabledMessage}
      </div>
    ) : (
      <div className="bg-surface-2/75 text-text/70 flex items-center justify-center rounded p-8 text-center font-semibold italic">
        {disabledMessage}
      </div>
    )
  ) : (
    <>
      {isOpen && children}
      {toggleable && !isOpen && layout !== 'vertical' && (
        <div className="text-text/70 max-tablet-landscape:hidden flex min-h-32 w-full items-center justify-center font-semibold italic">
          Click the toggle to enable this feature...
        </div>
      )}
    </>
  );

  if (layout === 'horizontal') {
    return (
      <section
        id={id ?? undefined}
        data-name={typeof title === 'string' ? title : undefined}
        className={cx(
          '[--input-background:var(--surface-1)] [--slider-color:oklch(var(--charcoal))]',
          'relative w-full max-w-7xl min-w-0',
          'max-tablet-landscape:mb-4 max-tablet-landscape:flex max-tablet-landscape:flex-col max-tablet-landscape:gap-5 tablet-landscape:grid tablet-landscape:grid-cols-[20rem_minmax(0,1fr)] tablet-landscape:gap-8',
          className,
        )}
      >
        {sectionHeader}
        <Surface
          noContainer
          spacing="md"
          shadow="sm"
          className="relative overflow-visible!"
        >
          <fieldset className="relative min-w-0">{fieldsetContent}</fieldset>
        </Surface>
      </section>
    );
  }

  return (
    <Surface
      as="section"
      noContainer
      spacing="none"
      shadow="sm"
      id={id ?? undefined}
      data-name={typeof title === 'string' ? title : undefined}
      className={cx(
        'relative mb-4 flex w-full max-w-7xl min-w-0 flex-col gap-5 overflow-visible! p-6',
        className,
      )}
    >
      {sectionHeader}
      <fieldset className="relative min-w-0">{fieldsetContent}</fieldset>
    </Surface>
  );
};

export default Section;
