import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { range } from 'es-toolkit';
import type { ComponentType, FocusEventHandler } from 'react';
import type { WrappedFieldProps } from 'redux-form';

import { cx } from '~/utils/cva';
import { resolveProtocolColor } from '~/utils/resolveProtocolColor';

import FrescoReduxField from '../FrescoReduxField';

type ColorOption = {
  label: string;
  value: string;
};

type ColorPickerControlProps = {
  'id'?: string;
  'name'?: string;
  'value'?: string;
  'onChange'?: (value: string) => void;
  'onBlur'?: FocusEventHandler;
  'onFocus'?: FocusEventHandler;
  'palette'?: string;
  'paletteRange'?: number;
  'options'?: ColorOption[];
  'disabled'?: boolean;
  'readOnly'?: boolean;
  'required'?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-labelledby'?: string;
  'aria-required'?: boolean;
};

const asColorOption = (name: string): ColorOption => ({
  label: name,
  value: name,
});

const ColorPickerControl = ({
  id,
  name,
  value,
  onChange,
  onBlur,
  onFocus,
  palette,
  paletteRange = 0,
  options = [],
  disabled = false,
  readOnly = false,
  required = false,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
  'aria-required': ariaRequired,
}: ColorPickerControlProps) => {
  // range() is end-exclusive, so run to paletteRange + 1 — otherwise the
  // palette's last colour can never be picked.
  const colors = palette
    ? range(1, paletteRange + 1).map((index) =>
        asColorOption(`${palette}-${index}`),
      )
    : options;

  return (
    <RadioGroup
      id={id}
      name={name}
      value={value ?? ''}
      onValueChange={(nextValue) => {
        if (!readOnly && typeof nextValue === 'string') onChange?.(nextValue);
      }}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      onBlur={onBlur}
      onFocus={onFocus}
      render={<fieldset />}
      aria-labelledby={ariaLabelledBy ?? (id ? `${id}-label` : undefined)}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid || undefined}
      aria-required={ariaRequired || required || undefined}
      className={cx(
        'bg-input text-input-contrast @container flex w-full flex-wrap gap-3 rounded border-2 p-4',
        'border-transparent',
        ariaInvalid && 'border-destructive',
        disabled && 'cursor-not-allowed opacity-50',
        readOnly && 'cursor-default opacity-70',
      )}
    >
      {colors.map((color) => (
        <Radio.Root
          key={color.value}
          value={color.value}
          disabled={disabled}
          nativeButton
          render={(renderProps, state) => (
            <button
              {...renderProps}
              type="button"
              aria-label={color.label}
              className={cx(
                'focusable relative size-12 shrink-0 rounded-full border-4 border-transparent',
                'bg-(--color) transition-colors',
                'hover:border-input-contrast/40',
                state.checked && 'border-primary',
                readOnly && 'pointer-events-none',
              )}
              style={
                {
                  '--color': resolveProtocolColor(color.value),
                } as React.CSSProperties
              }
            />
          )}
        />
      ))}
    </RadioGroup>
  );
};

type ColorPickerProps = WrappedFieldProps & {
  palette?: string;
  paletteRange?: number;
  options?: ColorOption[];
  label?: string;
  disabled?: boolean;
  readOnly?: boolean;
};

const FrescoColorPickerControl = ColorPickerControl as ComponentType<
  Record<string, unknown>
>;
const ReduxFieldAdapter = FrescoReduxField as unknown as ComponentType<
  Record<string, unknown>
>;

const ColorPicker = ({ label = 'Color', ...props }: ColorPickerProps) => (
  <ReduxFieldAdapter
    {...props}
    label={label}
    fieldComponent={FrescoColorPickerControl}
  />
);

export default ColorPicker;
