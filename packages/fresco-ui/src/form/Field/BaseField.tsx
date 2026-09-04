'use client';

import type { ReactNode } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import { cx } from '../../utils/cva';
import FieldErrors from '../FieldErrors';
import { FieldLabel } from '../FieldLabel';
import Hint from '../Hint';
import { fieldElementIds } from './fieldElements';

const messages = defineMessages({
  required: {
    id: 'frescoUi.field.required',
    defaultMessage: 'Required',
    description:
      'Visually hidden marker announced alongside the label of a field that must be answered.',
  },
});

// Exclude event handlers that conflict with Framer Motion
type ExcludeMotionConflicts<T> = Omit<
  T,
  | 'onAnimationStart'
  | 'onAnimationEnd'
  | 'onAnimationIteration'
  | 'onDrag'
  | 'onDragEnd'
  | 'onDragEnter'
  | 'onDragExit'
  | 'onDragLeave'
  | 'onDragOver'
  | 'onDragStart'
  | 'onDrop'
>;

type BaseFieldProps = {
  id: string;
  name?: string;
  label: string;
  hint?: ReactNode;
  validationSummary?: ReactNode;
  required?: boolean;
  errors?: string[];
  showErrors?: boolean;
  inline?: boolean;
  /**
   * Visually hide the label while keeping it as the control's accessible name.
   * Use when a surrounding heading already names the field, so the redundant
   * visible label is dropped but screen-reader users still hear a name.
   */
  labelHidden?: boolean;
  children: ReactNode;
  // TODO: the data attributes should be typed based on the return value of useField.
  containerProps?: ExcludeMotionConflicts<
    Omit<React.HTMLAttributes<HTMLDivElement>, 'className'>
  > &
    Record<`data-${string}`, string | boolean | undefined>;
};

/**
 * BaseField provides the shared markup/layout for form fields.
 * Used internally by Field (connected) and UnconnectedField (standalone).
 */
export function BaseField({
  id,
  name,
  label,
  hint,
  validationSummary,
  required,
  errors = [],
  showErrors = false,
  inline = false,
  labelHidden = false,
  children,
  containerProps,
}: BaseFieldProps) {
  const intl = useAppIntl();
  const hasVisibleHint = Boolean(hint ?? validationSummary);
  const elementIds = fieldElementIds(id);
  return (
    <div
      {...containerProps}
      className={cx('group/field w-full grow not-last:mb-8', 'flex flex-col')}
    >
      {/*
        Only `inline` fields query this element (see the `@min-lg:`
        utilities below), so only they make it a query container. Every other
        container-query consumer in the design system establishes its own
        container, so nothing else is scoped to this one.

        Making EVERY field a size container also has a cost beyond the
        redundant containment: Chromium lays a size container's subtree out on
        a separate, interleaved path, and can lose the invalidation for it
        when a large sibling subtree mounts in the same commit — the subtree
        keeps its computed styles but loses its layout boxes entirely, so the
        control renders at zero height and never recovers. Architect's
        quick-add variable picker hit exactly that when picking a variable
        mounted the codebook validation section beside it.
      */}
      <div className={cx(inline && '@container', 'flex flex-col')}>
        <div
          className={cx(
            // `inline` fields lay out as two columns (label | control) once the
            // field's own CONTAINER is wide enough, and stack when it's narrow —
            // a container query, not a viewport breakpoint, so a field adapts to
            // where it's placed (e.g. a narrow sidebar) rather than the screen.
            inline && '@min-lg:flex-row @min-lg:justify-between @min-lg:gap-4',
            'flex flex-col',
          )}
        >
          <div
            className={cx(
              inline && 'min-w-0',
              // Keep the gap below the label block only when something visible
              // remains there — the label itself, or a hint under a hidden label.
              !inline && (!labelHidden || hasVisibleHint) && 'mb-2',
              // inline needs bottom margin too, but must correspond to when it switches to stacked layout
              inline && '@max-lg:mb-2',
            )}
          >
            <FieldLabel
              id={elementIds.label}
              htmlFor={id}
              required={required}
              className={labelHidden ? 'sr-only' : undefined}
            >
              {label}
            </FieldLabel>
            {required && (
              <span id={elementIds.required} className="sr-only">
                {intl.formatMessage(messages.required)}
              </span>
            )}
            {(hint ?? validationSummary) && (
              <Hint id={elementIds.hint}>
                {hint}
                {validationSummary}
              </Hint>
            )}
          </div>
          <div className={cx(inline && 'shrink-0')}>{children}</div>
        </div>
      </div>
      <FieldErrors
        id={elementIds.error}
        name={name}
        errors={errors}
        show={showErrors}
      />
    </div>
  );
}
