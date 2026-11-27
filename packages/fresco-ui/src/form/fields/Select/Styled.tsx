'use client';

import { Select } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import { type ComponentPropsWithoutRef, useId, useState } from 'react';

import {
  useDrawnOnTopWhenOpened,
  usePortalContainer,
} from '../../../PortalContainer';
import {
  presentationalTextProps,
  presentationalTextValue,
} from '../../../PresentationalText';
import { dropdownItemVariants } from '../../../styles/controlVariants';
import { cx, type VariantProps } from '../../../utils/cva';
import type { FieldValueProps, InjectedFieldProps } from '../../Field/types';
import { useFormFeedback } from '../../FormFeedbackListener';
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

  const { onOptionToggle } = useFormFeedback();
  const descriptionId = useId();

  // Base UI calls this only for the person's own choice.
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
      onOptionToggle(true);
    }
  };

  const portalContainer = usePortalContainer();
  // Base UI can mount the list before it opens (to read an autofilled value),
  // so it is moved over the popups opened before it each time it opens.
  const [listOpen, setListOpen] = useState(rest.defaultOpen ?? false);
  const [portalNode, setPortalNode] = useState<HTMLDivElement | null>(null);
  useDrawnOnTopWhenOpened(rest.open ?? listOpen, portalNode);

  // Rendering only: for one render the store can still hold the previous
  // field's value (see the render-tolerance contract on `useField`). Only a
  // primitive can name an option or be rendered as its own label — an object
  // reaching `Select.Value` below is thrown out as an invalid React child —
  // so anything else shows the placeholder.
  const selectedValue =
    typeof value === 'string' || typeof value === 'number' ? value : null;

  return (
    <Select.Root
      {...rest}
      // `null` — never `undefined`. Base UI decides controlled-ness by
      // `value !== undefined`, so an unanswered field would mount the select
      // UNCONTROLLED and then flip to controlled on the first choice, which is
      // the state React and Base UI both warn about. `null` is Base UI's own
      // "controlled, nothing selected", and `Select.Value`'s render prop below
      // already branches on it.
      value={selectedValue}
      onValueChange={handleValueChange}
      onOpenChange={(open, event) => {
        setListOpen(open);
        rest.onOpenChange?.(open, event);
      }}
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
        <Select.Value className="min-w-0 flex-1 truncate text-start">
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
            if (!option) return currentValue;
            return typeof option.label === 'string' ? (
              option.label
            ) : (
              <span {...presentationalTextProps(option.label)}>
                {option.label.text}
              </span>
            );
          }}
        </Select.Value>
        <Select.Icon className="shrink-0">
          <ChevronDown className="h-[1.2em] w-[1.2em]" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal
        ref={setPortalNode}
        container={portalContainer ?? undefined}
      >
        {/*
          On the layer popovers are drawn on (`z-3000`), so a select inside a
          popover opens its list over it, as a combobox does.
        */}
        <Select.Positioner className="z-3000" alignItemWithTrigger={false}>
          <Select.Popup
            className={cx(
              'elevation-high rounded-sm border-2 border-transparent',
              'bg-surface-popover text-surface-popover-contrast',
              'max-h-96 max-w-(--available-width) overflow-auto',
              'w-max min-w-[min(var(--anchor-width),var(--available-width))]',
            )}
          >
            <Select.List className="p-1">
              {options.map((option, index) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className={dropdownItemVariants()}
                  {...(option.description !== undefined && {
                    'aria-describedby': `${descriptionId}-${index}`,
                  })}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <Select.ItemText
                      className="wrap-break-word whitespace-normal"
                      {...presentationalTextProps(option.label)}
                    >
                      {presentationalTextValue(option.label)}
                    </Select.ItemText>
                    {option.description !== undefined && (
                      <span
                        id={`${descriptionId}-${index}`}
                        // Read as the option's description rather than as
                        // part of its name.
                        aria-hidden
                        className="text-sm whitespace-normal text-current/70"
                      >
                        {option.description}
                      </span>
                    )}
                  </span>
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
