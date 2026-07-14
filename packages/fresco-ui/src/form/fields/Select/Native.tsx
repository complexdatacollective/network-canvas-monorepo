import { nativeSelectVariants } from '../../../styles/controlVariants';
import { cx, type VariantProps } from '../../../utils/cva';
import type { CreateFormFieldProps } from '../../Field/types';
import { getInputState } from '../../utils/getInputState';
import { type SelectOption, selectWrapperVariants } from './shared';

type SelectProps = CreateFormFieldProps<
  string | number,
  'select',
  {
    placeholder?: string;
    options: SelectOption[];
    size?: VariantProps<typeof selectWrapperVariants>['size'];
  }
>;

export default function SelectField(props: SelectProps) {
  const {
    options,
    placeholder,
    size,
    name,
    disabled,
    readOnly,
    onChange,
    className,
    value,
    ...rest
  } = props;

  // Normalize undefined to "" so the placeholder option is selected
  const normalizedValue = value ?? '';

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = event.target.value;
    const selectedOption = options.find(
      (option) => String(option.value) === selectedValue,
    );
    onChange?.(selectedOption?.value ?? selectedValue);
  };

  const valueMatchesOption = options.some(
    (option) => String(option.value) === String(normalizedValue),
  );

  // Fall back to the placeholder when the value matches no option, so a stale
  // value can't leave the browser showing the first option as if selected.
  const displayValue = valueMatchesOption ? normalizedValue : '';
  const hasValue = displayValue !== '';
  const placeholderLabel = placeholder ?? 'Select an option…';
  const showPlaceholderOption =
    placeholder !== undefined || !valueMatchesOption;

  return (
    <div
      className={selectWrapperVariants({
        size,
        className: cx('w-full', className),
        state: getInputState(props),
      })}
    >
      <select
        autoComplete="off"
        {...rest}
        name={name}
        value={displayValue}
        disabled={Boolean(disabled) || Boolean(readOnly)}
        aria-readonly={readOnly || rest['aria-readonly'] || undefined}
        onChange={handleChange}
        className={cx(
          'w-full',
          nativeSelectVariants(),
          !hasValue && 'text-current/50 italic',
        )}
      >
        {showPlaceholderOption && <option value="">{placeholderLabel}</option>}
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
