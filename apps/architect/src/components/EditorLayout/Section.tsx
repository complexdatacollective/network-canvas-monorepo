import type React from 'react';
import { useCallback, useEffect, useId, useState } from 'react';

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
  /**
   * Eleventh-wave Finding 3: forces the section open regardless of its
   * internal toggle state (which is preserved, and resumes once the force is
   * released). Used to surface content the user must see — e.g. a blocking
   * form error inside a section whose children are unmounted while collapsed.
   */
  forceExpanded?: boolean;
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
  forceExpanded = false,
  handleToggleChange = (state) => state,
  layout = 'horizontal',
  required = true,
}: SectionProps) => {
  const [internalOpen, setInternalOpen] = useState(startExpanded);
  // The toggle is named BY the section heading rather than carrying a name of
  // its own. Every stage editor stacks several of these, and a constant
  // ("Turn this feature on or off") made them one indistinguishable control to
  // anyone listing the page's switches. `role="switch"` plus `aria-checked`
  // already say what the control does; the heading is the only part that says
  // what it does it TO.
  const sectionLabelId = useId();
  // Eleventh-wave Finding 3: a forced expansion wins over the internal toggle
  // state without destroying it, so releasing the force restores whatever the
  // user (or startExpanded) last chose.
  const isOpen = forceExpanded || internalOpen;

  // If the startExpanded prop changes, update the state.
  // This happens when a stage is reset
  useEffect(() => {
    setInternalOpen(startExpanded);
  }, [startExpanded]);

  const changeToggleState = useCallback(async () => {
    // Save the intended state here, so that if startExpanded changes
    // in the meantime, we don't inadvertently change the open state
    // back.
    const intendedState = !isOpen;
    const result = await handleToggleChange(!isOpen);

    // If result of the callback, update the state with intendedState
    if (result) {
      setInternalOpen(intendedState);
    }
  }, [isOpen, handleToggleChange]);

  const sectionLabel = (
    <span
      id={sectionLabelId}
      className={cx(
        layout === 'vertical' &&
          headingVariants({
            level: 'label',
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
          'mb-2 flex items-center gap-4 text-right',
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
            aria-labelledby={sectionLabelId}
            value={isOpen}
            onChange={() => void changeToggleState()}
            disabled={disabled}
            className={
              disabled && layout === 'horizontal'
                ? cx(
                    '[&>span]:bg-input-contrast/60 opacity-100',
                    isOpen ? 'bg-input-contrast/40' : 'bg-input-contrast/20',
                  )
                : undefined
            }
          />
        )}
      </div>
      <div className="text-current/70">{summary}</div>
    </div>
  );

  const sectionContent = disabled ? (
    layout === 'horizontal' ? (
      <div className="bg-surface-2 text-text/70 max-tablet-landscape:rounded max-tablet-landscape:p-8 max-tablet-landscape:text-center tablet-landscape:absolute tablet-landscape:inset-0 tablet-landscape:h-full tablet-landscape:w-full flex items-center justify-center rounded font-semibold italic">
        {disabledMessage}
      </div>
    ) : (
      <div className="bg-surface-2 text-text/70 flex items-center justify-center rounded p-8 text-center font-semibold italic">
        {disabledMessage}
      </div>
    )
  ) : isOpen ? (
    <fieldset className="relative min-w-0">{children}</fieldset>
  ) : (
    toggleable &&
    layout !== 'vertical' && (
      <div className="text-text/70 max-tablet-landscape:hidden flex min-h-32 w-full items-center justify-center font-semibold italic">
        Click the toggle to enable this feature...
      </div>
    )
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
          {sectionContent}
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
      {sectionContent}
    </Surface>
  );
};

export default Section;
