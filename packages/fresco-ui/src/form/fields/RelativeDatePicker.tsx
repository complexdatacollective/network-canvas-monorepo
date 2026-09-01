import {
  dateWithinPickerRange,
  RELATIVE_DATE_PICKER_DEFAULT_AFTER,
  RELATIVE_DATE_PICKER_DEFAULT_BEFORE,
} from '@codaco/shared-consts';

import { cx } from '../../utils/cva';
import type { CreateFormFieldProps } from '../Field/types';
import { todayYmd } from '../utils/ymd';
import InputField from './InputField';

type RelativeDatePickerFieldProps = CreateFormFieldProps<
  string,
  'input',
  {
    anchor?: string; // ISO date string (YYYY-MM-DD)
    before?: number; // days before anchor
    after?: number; // days after anchor
    size?: 'sm' | 'md' | 'lg';
    placeholder?: string;
  }
>;

export default function RelativeDatePickerField(
  props: RelativeDatePickerFieldProps,
) {
  const {
    anchor,
    before = RELATIVE_DATE_PICKER_DEFAULT_BEFORE,
    after = RELATIVE_DATE_PICKER_DEFAULT_AFTER,
    value,
    onChange,
    name,
    size = 'md',
    placeholder,
    className,
    id,
    disabled,
    readOnly,
    ...rest
  } = props;

  const anchorYmd = anchor && typeof anchor === 'string' ? anchor : todayYmd();
  // Held inside the calendar the input can offer: an anchor late enough that
  // `after` steps past year 9999 derives `10000-01-01`, which this input cannot
  // display and the form's max validator does not read as a date at all — it
  // compares lexically instead, where a leading `1` sorts below every
  // four-digit year and the field rejects every value it can hold.
  const minYmd = dateWithinPickerRange(anchorYmd, -before);
  const maxYmd = dateWithinPickerRange(anchorYmd, after);

  return (
    <InputField
      id={id}
      type="date"
      size={size}
      min={minYmd}
      max={maxYmd}
      value={value}
      onChange={(inputValue) => onChange?.(String(inputValue))}
      name={name ?? ''}
      placeholder={placeholder}
      className={cx('outline-input-contrast', className)}
      disabled={disabled}
      readOnly={readOnly}
      aria-invalid={rest['aria-invalid']}
      aria-describedby={rest['aria-describedby']}
      aria-required={rest['aria-required']}
    />
  );
}
