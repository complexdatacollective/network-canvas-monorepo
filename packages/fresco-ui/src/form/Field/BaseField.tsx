'use client';

import type { ReactNode } from 'react';

import { cx } from '../../utils/cva';
import FieldErrors from '../FieldErrors';
import { FieldLabel } from '../FieldLabel';
import Hint from '../Hint';
import { fieldElementIds } from './fieldElements';

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
  const elementIds = fieldElementIds(id);
  // The label and the hint carry the type scale's own bottom margins (the
  // label style's 0.5em, a paragraph's 1em), so whatever follows each of them
  // is spaced by the typography rather than by this container. Those margins
  // only apply to an element with a following sibling, so a stacked field
  // renders label, hint, and control as siblings; an inline field groups the
  // label and hint into the left column and spaces the column itself when
  // it stacks.
  const labelBlock = (
    <>
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
          Required
        </span>
      )}
      {(hint ?? validationSummary) && (
        <Hint id={elementIds.hint}>
          {hint}
          {validationSummary}
        </Hint>
      )}
    </>
  );
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
      {inline ? (
        <div className="@container flex flex-col">
          {/*
            `inline` fields lay out as two columns (label | control) once the
            field's own CONTAINER is wide enough, and stack when it's narrow —
            a container query, not a viewport breakpoint, so a field adapts to
            where it's placed (e.g. a narrow sidebar) rather than the screen.
          */}
          <div className="flex flex-col @min-lg:flex-row @min-lg:justify-between @min-lg:gap-4">
            {/* The column's last child has no following sibling, so the
                column spaces itself from the control when it stacks. */}
            <div className="min-w-0 @max-lg:mb-2">{labelBlock}</div>
            <div className="shrink-0">{children}</div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col">
          {labelBlock}
          <div>{children}</div>
        </div>
      )}
      <FieldErrors
        id={elementIds.error}
        name={name}
        errors={errors}
        show={showErrors}
      />
    </div>
  );
}
