'use client';

import type { ReactNode } from 'react';

import { cx } from '../../utils/cva';
import FieldErrors from '../FieldErrors';
import { FieldLabel } from '../FieldLabel';
import Hint from '../Hint';

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
  children,
  containerProps,
}: BaseFieldProps) {
  return (
    <div
      {...containerProps}
      className={cx(
        'group @container w-full grow not-last:mb-8',
        'flex flex-col',
      )}
    >
      <div
        className={cx(
          // `inline` fields lay out as two columns (label | control) once the
          // field's own CONTAINER is wide enough, and stack when it's narrow —
          // a container query, not a viewport breakpoint, so a field adapts to
          // where it's placed (e.g. a narrow sidebar) rather than the screen.
          inline &&
            '@min-[28rem]:flex-row @min-[28rem]:items-center @min-[28rem]:justify-between @min-[28rem]:gap-4',
          'flex flex-col',
        )}
      >
        <div className={cx(inline && 'min-w-0', !inline && 'mb-2')}>
          <FieldLabel id={`${id}-label`} htmlFor={id} required={required}>
            {label}
          </FieldLabel>
          {required && (
            <span id={`${id}-required`} className="sr-only">
              Required
            </span>
          )}
          {(hint ?? validationSummary) && (
            <Hint id={`${id}-hint`}>
              {hint}
              {validationSummary}
            </Hint>
          )}
        </div>
        <div className={cx(inline && 'shrink-0')}>{children}</div>
      </div>
      <FieldErrors
        id={`${id}-error`}
        name={name}
        errors={errors}
        show={showErrors}
      />
    </div>
  );
}
