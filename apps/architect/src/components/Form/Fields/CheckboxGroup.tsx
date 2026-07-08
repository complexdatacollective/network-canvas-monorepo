/* eslint-disable react/jsx-props-no-spreading */

import { useCallback } from 'react';

import Icon from '~/lib/legacy-ui/components/Icon';
import { cx } from '~/utils/cva';

import type { CheckboxProps } from './Checkbox';
import Checkbox from './Checkbox';
import MarkdownLabel from './MarkdownLabel';
import type { Option } from './utils/options';
import { asOptionObject, getValue } from './utils/options';

type CheckboxGroupProps = {
  options?: Option[];
  className?: string | null;
  label?: string | null;
  fieldLabel?: string | null;
  input: {
    name: string;
    value?: unknown[];
    onChange: (value: unknown[]) => void;
  };
  optionComponent?: React.ComponentType<CheckboxProps>;
  meta?: {
    error?: string;
    invalid?: boolean;
    touched?: boolean;
  };
};

const CheckboxGroup = ({
  options = [],
  className = null,
  label = null,
  fieldLabel = null,
  input,
  optionComponent = Checkbox,
  meta = {},
}: CheckboxGroupProps) => {
  const { value = [] } = input;

  const handleClickOption = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option) return;
      const optionValue = getValue(option);
      const isChecked = value.includes(optionValue);
      const newValue = isChecked
        ? value.filter((val) => val !== optionValue)
        : [...value, optionValue];

      input.onChange(newValue);
    },
    [options, value, input],
  );

  const isOptionChecked = useCallback(
    (option: unknown) => {
      return value.includes(option);
    },
    [value],
  );

  const renderOption = useCallback(
    (option: Option, index: number) => {
      const OptionComponent = optionComponent;
      const {
        value: optionValue,
        label: optionLabel,
        ...optionRest
      } = asOptionObject(option);

      return (
        <OptionComponent
          key={index}
          input={{
            name: `option-${index}`,
            value: index,
            checked: isOptionChecked(optionValue),
            onChange: () => handleClickOption(index),
          }}
          label={optionLabel}
          {...optionRest}
        />
      );
    },
    [optionComponent, isOptionChecked, handleClickOption],
  );

  const { error, invalid, touched } = meta;
  const hasError = !!(invalid && touched && error);

  const anyLabel = fieldLabel || label;

  return (
    <div className={cx('m-0 block [&>h4]:m-0', className)}>
      {anyLabel && <MarkdownLabel label={anyLabel} />}
      <div
        className={cx(
          'form-field flex flex-col',
          hasError && 'border-destructive mb-0 rounded-b-none border-2',
        )}
      >
        {options.map(renderOption)}
      </div>
      {hasError && (
        <div className="bg-destructive text-destructive-contrast flex items-center rounded-b-sm px-1 py-2.5 [&_svg]:max-h-5">
          <Icon name="warning" />
          {error}
        </div>
      )}
    </div>
  );
};

export default CheckboxGroup;
