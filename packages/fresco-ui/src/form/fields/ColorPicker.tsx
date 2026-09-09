'use client';

import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import {
  controlVariants,
  groupSpacingVariants,
  inputControlVariants,
  stateVariants,
} from '../../styles/controlVariants';
import { compose, cva, cx } from '../../utils/cva';
import type { CreateFormFieldProps } from '../Field/types';
import { getInputState } from '../utils/getInputState';

const messages = defineMessages({
  emptyPalette: {
    id: 'frescoUi.colorPicker.emptyPalette',
    defaultMessage: 'No colors are available to choose from.',
    description:
      'Shown in place of the swatches when the palette handed to the color picker is empty.',
  },
});

/**
 * Colour sequences the theme publishes as design tokens. A name in one of
 * these sequences is `<sequence>-color-seq-<position>`, and the variable that
 * paints it is `--<sequence>-<position>` (`node-color-seq-3` → `--node-3`).
 */
const SEQUENCE_PREFIXES = [
  'node-color-seq-',
  'edge-color-seq-',
  'ord-color-seq-',
  'cat-color-seq-',
] as const;

/**
 * The CSS colour a swatch paints with.
 *
 * A colour-sequence name resolves to its theme variable rather than to a fixed
 * colour, so a swatch re-resolves inside a themed region instead of freezing
 * one rendering of the palette. Every other value is used as a CSS colour
 * verbatim, which is what lets this picker offer a palette that is not one of
 * the theme's sequences.
 */
export function resolveSwatchColor(value: string): string {
  const prefix = SEQUENCE_PREFIXES.find((candidate) =>
    value.startsWith(candidate),
  );
  if (!prefix) return value;

  const sequence = prefix.replace('-color-seq-', '-');
  return `var(--${sequence}${value.slice(prefix.length)})`;
}

export type ColorSwatchOption = {
  /**
   * The value stored when this swatch is chosen, and the colour the swatch
   * paints with — a theme colour-sequence name such as `node-color-seq-1`, or
   * any CSS colour.
   */
  value: string;
  /** The swatch's accessible name. A colour is not one without it. */
  label: string;
};

type ColorPickerFieldProps = CreateFormFieldProps<
  string,
  'fieldset',
  {
    /** The palette, in the order the swatches are offered. */
    options: ColorSwatchOption[];
    /**
     * Only reaches the control through `UnconnectedField`; `Field` strips
     * validation props and signals the same thing via `aria-required`.
     */
    required?: boolean;
  }
>;

const colorPickerVariants = compose(
  controlVariants,
  inputControlVariants,
  groupSpacingVariants,
  stateVariants,
  cva({
    // Overrides `controlVariants`' single-control shape: this group wraps its
    // swatches over as many rows as it needs, and must be free to shrink with
    // the field that holds it rather than hold a content-width floor.
    base: 'w-full min-w-0 flex-wrap justify-start text-wrap',
  }),
);

/**
 * A palette of colour swatches, chosen one at a time.
 *
 * A colour is a value with a name, not a decoration: every swatch carries its
 * own accessible name from `options`, and the chosen one is marked by an
 * outline ring standing off the swatch — a change of shape, so the selection
 * is legible without perceiving the colour at all.
 *
 * The labelling belongs to the surrounding field: use it as the `component` of
 * a `<Field>`, or of an `UnconnectedField` when the value is not the form's.
 */
export default function ColorPickerField({
  id,
  name,
  value,
  onChange,
  onBlur,
  onFocus,
  options,
  disabled = false,
  readOnly = false,
  required = false,
  className,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
  'aria-required': ariaRequired,
}: ColorPickerFieldProps) {
  const intl = useAppIntl();
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
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid || undefined}
      aria-required={isRequired || undefined}
      className={colorPickerVariants({
        state: getInputState({
          disabled,
          readOnly,
          'aria-invalid': ariaInvalid,
        }),
        className,
      })}
    >
      {options.length === 0 && (
        <p className="text-sm text-current/70">
          {intl.formatMessage(messages.emptyPalette)}
        </p>
      )}
      {options.map((option) => (
        <Radio.Root
          key={option.value}
          value={option.value}
          disabled={disabled}
          nativeButton
          render={(renderProps, state) => (
            <button
              {...renderProps}
              type="button"
              aria-label={option.label}
              className={cx(
                'focusable relative size-12 shrink-0 rounded-full',
                // The selection ring is the design system's focus outline in
                // the swatch's own colour (never a generic primary border), so
                // the cue reads as "this colour". Hover previews it at a
                // tighter offset.
                'bg-(--swatch-color) outline-(--swatch-color) transition-all',
                state.checked
                  ? 'outline-2 outline-offset-3'
                  : 'hover:outline-2 hover:outline-offset-2',
                readOnly && 'pointer-events-none',
              )}
              style={
                {
                  '--swatch-color': resolveSwatchColor(option.value),
                } as React.CSSProperties
              }
            />
          )}
        />
      ))}
    </RadioGroup>
  );
}
