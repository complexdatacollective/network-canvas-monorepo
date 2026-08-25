import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { range } from 'es-toolkit';

import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import {
  type ColorReference,
  ColorReferenceSchema,
} from '@codaco/protocol-validation';
import { getColorSwatchName } from '~/config';
import { cx } from '~/utils/cva';
import { resolveProtocolColor } from '~/utils/resolveProtocolColor';

type ColorOption = {
  label: string;
  value: ColorReference;
};

type ColorPickerProps = CreateFormFieldProps<
  string,
  'fieldset',
  {
    /** Generates swatches `${palette}-1` … `${palette}-${paletteRange}`. */
    palette?: string;
    paletteRange?: number;
    /** Explicit swatches. Ignored when `palette` is supplied. */
    options?: ColorOption[];
    /** Only reaches the control through `UnconnectedField`; `Field` strips
     * validation props and signals the same thing via `aria-required`. */
    required?: boolean;
  }
>;

const asColorOption = (name: string): ColorOption => {
  const value = ColorReferenceSchema.parse(name);
  return { label: getColorSwatchName(value), value };
};

/**
 * Protocol-colour swatch picker. Labelling belongs to the surrounding field —
 * pass it through `ArchitectField`'s `label`/`hint`.
 */
const ColorPicker = ({
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
}: ColorPickerProps) => {
  // range() is end-exclusive, so run to paletteRange + 1 — otherwise the
  // palette's last colour can never be picked.
  const offered = palette
    ? range(1, paletteRange + 1).map((index) =>
        asColorOption(`${palette}-${index}`),
      )
    : options;

  const isRequired = required || Boolean(ariaRequired);

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
      required={isRequired}
      onBlur={onBlur}
      onFocus={onFocus}
      render={<fieldset />}
      aria-labelledby={ariaLabelledBy ?? (id ? `${id}-label` : undefined)}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid || undefined}
      aria-required={isRequired || undefined}
      className={cx(
        'bg-input text-input-contrast @container flex w-full flex-wrap gap-3 rounded border-2 p-4',
        ariaInvalid && 'border-destructive',
        disabled && 'cursor-not-allowed opacity-50',
        readOnly && 'cursor-default opacity-70',
      )}
    >
      {offered.map((color) => (
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
                'focusable relative size-12 shrink-0 rounded-full',
                // The selection ring is the design-system focus outline in the
                // swatch's own colour (not a generic primary border), so the cue
                // reads as "this colour". Hover previews it at a tighter offset.
                'bg-(--color) outline-(--color) transition-all',
                state.checked
                  ? 'outline-2 outline-offset-3'
                  : 'hover:outline-2 hover:outline-offset-2',
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

export default ColorPicker;
