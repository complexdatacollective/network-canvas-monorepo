'use client';

import type { CreateFormFieldProps } from '../form/Field/types';
import SegmentedSwitcher, {
  type SegmentedOption,
  type SegmentedSwitcherProps,
} from './SegmentedSwitcher';

type SegmentedSwitcherFieldProps<T extends string = string> =
  CreateFormFieldProps<
    T,
    'div',
    {
      options: SegmentedOption<T>[];
      size?: SegmentedSwitcherProps<T>['size'];
      variant?: SegmentedSwitcherProps<T>['variant'];
      className?: string;
    }
  >;

/**
 * A `SegmentedSwitcher` as a field's control: one choice from a short row,
 * named by the field's label and described by its hint, both of which the
 * field hands it as `aria-labelledby` and `aria-describedby`.
 *
 * With no value, no segment is pressed. A disabled field ignores the pointer
 * and the keyboard; a read-only one shows its value and keeps it.
 */
export default function SegmentedSwitcherField<T extends string = string>({
  id,
  value,
  onChange,
  options,
  size,
  variant,
  className,
  disabled,
  readOnly,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
}: SegmentedSwitcherFieldProps<T>) {
  return (
    <SegmentedSwitcher<T | ''>
      id={id}
      size={size}
      variant={variant}
      className={className}
      disabled={disabled}
      value={value ?? ''}
      onValueChange={(next) => {
        if (readOnly || next === '') return;
        onChange?.(next);
      }}
      options={options}
      aria-describedby={ariaDescribedBy}
      {...(ariaLabelledBy === undefined
        ? { 'aria-label': ariaLabel ?? '' }
        : { 'aria-labelledby': ariaLabelledBy })}
    />
  );
}
