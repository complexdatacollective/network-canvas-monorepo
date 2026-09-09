import { type CSSProperties, useId } from 'react';

import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import { cx } from '@codaco/fresco-ui/utils/cva';
import type { ColorReference } from '@codaco/protocol-validation';

import { protocolColor } from '../protocolColor.ts';

export type ColorPickerOption = Readonly<{
  value: ColorReference;
  /**
   * What a screen reader announces for this swatch.
   *
   * The palette's colours are the study's own theme colours and have no names
   * of their own, so the caller supplies one — which is also the only name a
   * researcher who cannot see the swatch has to go on.
   */
  label: string;
}>;

export type ColorPickerProps = CreateFormFieldProps<
  string,
  'div',
  { options?: readonly ColorPickerOption[] }
>;

/** Custom properties one swatch tints itself and its selection ring through. */
type SwatchStyle = CSSProperties & { '--swatch'?: string };

/**
 * Picks one protocol colour, shown as the colour it is.
 *
 * A list of names is not a colour picker. The palette entries have no names of
 * their own — they are the study's theme colours, counted rather than called
 * anything — so offered as "Color 1" to "Color 8" in a select, the researcher
 * chooses the shade the participant will see without being shown any of them,
 * and finds out which one it was only after the row is saved. Architect's own
 * pedigree editor has always shown swatches here, and this is that control
 * carried into the package.
 *
 * Native radios in their own labels, which is the pattern `EntitySelectControl`
 * uses in this package for the same shape of problem: the browser then owns the
 * group's roving arrow-key behaviour, the checked state it reports and the
 * click-the-label affordance, and the swatch is free to be the whole visible
 * control. The selection ring is the swatch's own colour rather than a generic
 * border, so the cue reads as "this colour".
 *
 * A stored colour the caller does not offer shows as nothing chosen, exactly
 * as the select it replaces did: which colours a picker offers is the caller's
 * decision, and this control has no name to give one it was never told about.
 *
 * Labelling belongs to the surrounding field; pass `label`/`hint` to the
 * `Field` that renders this.
 */
export function ColorPickerControl({
  id,
  name,
  value,
  onChange,
  onBlur,
  onFocus,
  options = [],
  disabled = false,
  readOnly = false,
  className,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-required': ariaRequired,
}: ColorPickerProps) {
  const generatedGroupName = useId();
  const groupName = name ?? generatedGroupName;

  return (
    <div
      data-name={name}
      onBlur={onBlur}
      onFocus={onFocus}
      className={cx('flex w-full flex-col items-start', className)}
    >
      <fieldset
        id={id}
        role="radiogroup"
        aria-label={
          ariaLabelledBy === undefined && ariaLabel !== undefined
            ? ariaLabel
            : undefined
        }
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-required={ariaRequired}
        aria-readonly={readOnly || undefined}
        disabled={disabled}
        className={cx(
          'bg-input text-input-contrast flex w-full min-w-0 flex-row flex-wrap items-start gap-3 rounded border-2 p-4',
          ariaInvalid === true && 'border-destructive',
          disabled && 'opacity-50',
          readOnly && 'opacity-70',
        )}
      >
        {options.map((option) => {
          const swatchStyle: SwatchStyle = {
            '--swatch': protocolColor(option.value),
          };
          return (
            <label
              key={option.value}
              className={cx(
                'inline-flex rounded-full',
                disabled || readOnly ? 'cursor-default' : 'cursor-pointer',
              )}
            >
              <input
                type="radio"
                className="peer sr-only"
                name={groupName}
                value={option.value}
                // The palette's own counted name, stated on the control: what
                // a screen reader could otherwise recover from a swatch is a
                // circle with no text in it.
                aria-label={option.label}
                checked={value === option.value}
                disabled={disabled}
                aria-disabled={readOnly || undefined}
                onChange={() => {
                  if (disabled || readOnly) return;
                  onChange?.(option.value);
                }}
              />
              <span
                className={cx(
                  'block size-12 shrink-0 rounded-full bg-(--swatch)',
                  // The selection ring is the swatch's own colour, so the cue
                  // reads as "this colour" rather than as a generic border.
                  'outline-(--swatch) peer-checked:outline-2 peer-checked:outline-offset-3',
                  'peer-focus-visible:outline-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4',
                )}
                style={swatchStyle}
              />
            </label>
          );
        })}
      </fieldset>
    </div>
  );
}
