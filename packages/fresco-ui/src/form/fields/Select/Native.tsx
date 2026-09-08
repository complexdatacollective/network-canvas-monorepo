'use client';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import { nativeSelectVariants } from '../../../styles/controlVariants';
import { cx, type VariantProps } from '../../../utils/cva';
import type { CreateFormFieldProps } from '../../Field/types';
import { getInputState } from '../../utils/getInputState';
import {
  flattenSelectOptions,
  isSelectOptionGroup,
  type SelectOptionOrGroup,
  selectWrapperVariants,
} from './shared';

const messages = defineMessages({
  placeholder: {
    id: 'frescoUi.selectField.placeholder',
    defaultMessage: 'Select an option…',
    description: 'Default placeholder option of a native select.',
  },
});

type SelectProps = CreateFormFieldProps<
  string | number,
  'select',
  {
    placeholder?: string;
    /**
     * A flat list, or a list of `<optgroup>`s. Group and option may be mixed
     * in one list; only one level of nesting is supported, which is all a
     * native `<select>` has.
     */
    options: SelectOptionOrGroup[];
    size?: VariantProps<typeof selectWrapperVariants>['size'];
  }
>;

export default function SelectField(props: SelectProps) {
  const intl = useAppIntl();
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

  // Selection is a property of the options themselves, not of how they are
  // grouped, so every lookup below runs against the flattened list.
  const selectableOptions = flattenSelectOptions(options);

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = event.target.value;
    const selectedOption = selectableOptions.find(
      (option) => String(option.value) === selectedValue,
    );
    onChange?.(selectedOption?.value ?? selectedValue);
  };

  const valueMatchesOption = selectableOptions.some(
    (option) => String(option.value) === String(normalizedValue),
  );

  // Fall back to the placeholder when the value matches no option, so a stale
  // value can't leave the browser showing the first option as if selected.
  const displayValue = valueMatchesOption ? normalizedValue : '';
  const hasValue = displayValue !== '';
  const placeholderLabel =
    placeholder ?? intl.formatMessage(messages.placeholder);
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
        {options.map((option) =>
          isSelectOptionGroup(option) ? (
            // Keyed by label: a group carries no value, and its label is what
            // distinguishes it from its siblings.
            <optgroup key={`group:${option.label}`} label={option.label}>
              {option.options.map((groupedOption) => (
                <option
                  key={groupedOption.value}
                  value={groupedOption.value}
                  disabled={groupedOption.disabled}
                  lang={groupedOption.lang}
                >
                  {groupedOption.label}
                </option>
              ))}
            </optgroup>
          ) : (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
              lang={option.lang}
            >
              {option.label}
            </option>
          ),
        )}
      </select>
    </div>
  );
}
