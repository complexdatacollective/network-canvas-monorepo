import { Select } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import type { ComponentPropsWithoutRef } from 'react';

import { usePortalContainer } from '../../../PortalContainer';
import { dropdownItemVariants } from '../../../styles/controlVariants';
import { cx, type VariantProps } from '../../../utils/cva';
import type { FieldValueProps, InjectedFieldProps } from '../../Field/types';
import { getInputState } from '../../utils/getInputState';
import { type SelectOption, selectWrapperVariants } from './shared';

type SelectProps = FieldValueProps<string | number> &
  InjectedFieldProps & {
    placeholder?: string;
    options: SelectOption[];
    className?: string;
  } & Omit<
    ComponentPropsWithoutRef<typeof Select.Root>,
    | 'onValueChange'
    | 'items'
    | 'multiple'
    | 'value'
    | 'defaultValue'
    | 'name'
    | 'disabled'
  > &
  VariantProps<typeof selectWrapperVariants>;

function SelectField(props: SelectProps) {
  const {
    options,
    placeholder,
    size,
    className,
    onChange,
    value,
    id,
    name,
    disabled,
    readOnly,
    onBlur,
    onFocus,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    'aria-required': ariaRequired,
    'aria-disabled': ariaDisabled,
    'aria-readonly': ariaReadOnly,
    ...rest
  } = props;

  const handleValueChange = (newValue: unknown) => {
    if (newValue !== null && newValue !== undefined) {
      const isPrimitiveValue =
        typeof newValue === 'string' || typeof newValue === 'number';
      const selectedOption = options.find(
        (option) =>
          Object.is(option.value, newValue) ||
          (isPrimitiveValue && String(option.value) === String(newValue)),
      );
      onChange?.(selectedOption?.value);
    }
  };

  const portalContainer = usePortalContainer();

  return (
    <Select.Root
      {...rest}
      value={value}
      onValueChange={handleValueChange}
      disabled={disabled}
      readOnly={readOnly}
      name={name}
    >
      <Select.Trigger
        id={id}
        onBlur={onBlur}
        onFocus={onFocus}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid || undefined}
        aria-required={ariaRequired}
        aria-disabled={ariaDisabled || disabled || undefined}
        aria-readonly={ariaReadOnly || readOnly || undefined}
        className={selectWrapperVariants({
          size,
          className: cx('w-full', className),
          state: getInputState(props),
        })}
      >
        <Select.Value className="min-w-0 flex-1 truncate text-left">
          {(currentValue: string | number | null) => {
            if (
              currentValue === null ||
              currentValue === undefined ||
              currentValue === ''
            ) {
              return (
                <span className="text-input-contrast/50 italic">
                  {placeholder}
                </span>
              );
            }
            const option = options.find(
              (opt) =>
                Object.is(opt.value, currentValue) ||
                String(opt.value) === String(currentValue),
            );
            return option?.label ?? currentValue;
          }}
        </Select.Value>
        <Select.Icon className="shrink-0">
          <ChevronDown className="h-[1.2em] w-[1.2em]" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal container={portalContainer ?? undefined}>
        <Select.Positioner className="z-50" alignItemWithTrigger={false}>
          <Select.Popup
            className={cx(
              'elevation-high rounded-sm border-2 border-transparent',
              'bg-surface-popover text-surface-popover-contrast',
              'max-h-96 max-w-(--available-width) overflow-auto',
              'w-max min-w-[min(var(--anchor-width),var(--available-width))]',
            )}
          >
            <Select.List className="p-1">
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className={dropdownItemVariants()}
                >
                  <Select.ItemText className="min-w-0 flex-1 wrap-break-word whitespace-normal">
                    {option.label}
                  </Select.ItemText>
                  <Select.ItemIndicator>
                    <Check className="h-[1.2em] w-[1.2em]" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

export default SelectField;
