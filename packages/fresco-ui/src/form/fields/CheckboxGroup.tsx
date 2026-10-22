'use client';

import { type ReactNode, useId } from 'react';

import {
  type PresentationalText,
  presentationalTextProps,
  presentationalTextValue,
} from '../../PresentationalText';
import { RenderMarkdown } from '../../RenderMarkdown';
import {
  controlLabelVariants,
  controlVariants,
  groupOptionVariants,
  groupSpacingVariants,
  inputControlVariants,
  interactiveStateVariants,
  orientationVariants,
  stateVariants,
} from '../../styles/controlVariants';
import { cva, cx, type VariantProps } from '../../utils/cva';
import type { CreateFormFieldProps } from '../Field/types';
import { getInputState } from '../utils/getInputState';
import { omitWidgetOnlyAria } from '../utils/omitWidgetOnlyAria';
import Checkbox from './Checkbox';

const checkboxGroupOwnVariants = cva({
  base: 'items-start',
});

// Compose fieldset wrapper variants
const checkboxGroupComposedVariants = cva({
  composes: [
    controlVariants,
    inputControlVariants,
    groupSpacingVariants,
    stateVariants,
    interactiveStateVariants,
    orientationVariants,
    checkboxGroupOwnVariants,
  ],
});

type CheckboxOption = {
  value: string | number;
  label: PresentationalText;
  disabled?: boolean;
};

type CheckboxGroupProps = CreateFormFieldProps<
  (string | number)[],
  'fieldset',
  {
    options: CheckboxOption[];
    /**
     * Shown inside the group when there are no options to tick.
     *
     * Inside it, rather than in place of it: the group is what the field's
     * label names (`aria-labelledby`) and what its hint describes, and a
     * caller that swapped the `<fieldset>` for a paragraph would drop both —
     * leaving the field with no accessible name at the moment it most needs
     * to say which list has nothing in it.
     */
    emptyState?: ReactNode;
    defaultValue?: (string | number)[];
    orientation?: 'horizontal' | 'vertical';
    size?: 'sm' | 'md' | 'lg' | 'xl';
    useColumns?: boolean;
  }
> &
  VariantProps<typeof checkboxGroupComposedVariants>;

export default function CheckboxGroupField(props: CheckboxGroupProps) {
  const {
    id,
    className,
    name,
    options,
    emptyState,
    value,
    defaultValue,
    onChange,
    orientation = 'vertical',
    size = 'md',
    useColumns = false,
    disabled,
    readOnly,
    ...fieldsetProps
  } = props;

  const handleChange = (optionValue: string | number, checked: boolean) => {
    if (readOnly) return;
    const currentValues = Array.isArray(value) ? value : [];
    const newValues = checked
      ? [...currentValues, optionValue]
      : currentValues.filter((v) => v !== optionValue);
    onChange?.(newValues);
  };

  // Determine if this is controlled or uncontrolled
  const isControlled = value !== undefined;
  const suppliedValues = isControlled ? value : (defaultValue ?? []);
  const currentValues = Array.isArray(suppliedValues) ? suppliedValues : [];

  const optionIdPrefix = useId();

  return (
    <div className="@container w-full">
      <fieldset
        id={id}
        // A `<fieldset>` is `role="group"`, which allows neither
        // `aria-readonly` nor `aria-required`. Each checkbox below carries the
        // read-only state; the group's required-ness stays with the label's
        // marker and the "Required" element named in `aria-describedby`,
        // because it is the answer that is required, not any one checkbox.
        {...omitWidgetOnlyAria(fieldsetProps)}
        className={checkboxGroupComposedVariants({
          size,
          orientation,
          useColumns,
          state: getInputState(props),
          className,
        })}
        disabled={disabled}
      >
        {options.length === 0 && emptyState}
        {options.map((option, index) => {
          const isOptionDisabled =
            Boolean(disabled) || Boolean(option.disabled);
          const isChecked = currentValues.includes(option.value);
          // Positional, not the option's value: an option value is whatever
          // the researcher typed, and an element id may not contain whitespace.
          const optionId = `${optionIdPrefix}-${index}`;

          return (
            <label
              key={option.value}
              htmlFor={optionId}
              className={groupOptionVariants({
                size,
                disabled: isOptionDisabled,
                readOnly: Boolean(readOnly),
              })}
            >
              <Checkbox
                id={optionId}
                name={name}
                {...(isControlled
                  ? { checked: isChecked }
                  : { defaultChecked: isChecked })}
                disabled={isOptionDisabled}
                readOnly={readOnly}
                aria-readonly={readOnly || undefined}
                onCheckedChange={(checked) => {
                  if (!isOptionDisabled && !readOnly) {
                    handleChange(option.value, checked);
                  }
                }}
                size={size}
              />
              <span
                className={cx(
                  controlLabelVariants({ size }),
                  'cursor-[inherit] transition-colors duration-200',
                  isOptionDisabled && 'opacity-50',
                )}
                {...presentationalTextProps(option.label)}
              >
                <RenderMarkdown>
                  {presentationalTextValue(option.label)}
                </RenderMarkdown>
              </span>
            </label>
          );
        })}
      </fieldset>
    </div>
  );
}
