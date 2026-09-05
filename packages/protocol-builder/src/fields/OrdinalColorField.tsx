import { type CSSProperties, useId } from 'react';

import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { OrdinalColorSequence } from '@codaco/protocol-validation';

import { protocolColor } from '../protocolColor.ts';

/**
 * The researcher-facing name of each swatch, in the sequence's own order.
 *
 * Whole names rather than "Colour 3", because the researcher picks a gradient
 * by how it looks and then has to be able to say which one they picked. The
 * list is indexed by position, so it stays in step with the schema's sequence.
 */
const SWATCH_NAMES: readonly string[] = Object.freeze([
  'Sea Green',
  'Sea Serpent',
  'Tomato',
  'Neon Carrot',
  'Kiwi',
  'Cerulean Blue',
  'Paradise Pink',
  'Mustard',
  'Purple Pizazz',
  'Slate Blue',
]);

const swatchName = (index: number): string =>
  SWATCH_NAMES[index] ?? `Gradient ${index + 1}`;

export type OrdinalColorFieldProps = CreateFormFieldProps<string, 'div'>;

type SwatchStyle = CSSProperties & { '--swatch'?: string };

/**
 * Picks the colour gradient an ordinal bin renders its values in.
 *
 * Every colour the protocol schema's ordinal sequence contains is offered, in
 * its own order — the sequence is the single source of what a gradient may be,
 * so a picker that offered a shorter list would have to special-case a
 * protocol that already uses one of the rest.
 *
 * Native radios inside their own labels, as the entity picker does: the
 * browser then owns the group's arrow-key behaviour, the checked state it
 * reports, and the click-the-swatch affordance. Each radio carries the
 * swatch's name, because a coloured circle has nothing a screen reader can
 * read.
 *
 * Labelling belongs to the surrounding field; pass `label`/`hint` to the
 * `Field` that renders this.
 */
export function OrdinalColorControl({
  id,
  name,
  value,
  onChange,
  onBlur,
  onFocus,
  disabled = false,
  readOnly = false,
  className,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
  'aria-required': ariaRequired,
}: OrdinalColorFieldProps) {
  const generatedGroupName = useId();
  const groupName = name ?? generatedGroupName;

  return (
    <div
      data-name={name}
      onBlur={onBlur}
      onFocus={onFocus}
      className={cx('flex w-full flex-col items-start gap-4', className)}
    >
      <fieldset
        id={id}
        role="radiogroup"
        aria-label={
          ariaLabelledBy === undefined ? 'Colour gradient' : undefined
        }
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-required={ariaRequired}
        aria-readonly={readOnly || undefined}
        disabled={disabled}
        className={cx(
          'bg-input text-input-contrast flex w-full min-w-0 flex-row flex-wrap gap-3 rounded border-2 p-4',
          ariaInvalid === true && 'border-destructive',
          disabled && 'opacity-50',
        )}
      >
        {OrdinalColorSequence.map((color, index) => {
          const style: SwatchStyle = { '--swatch': protocolColor(color) };
          return (
            <label
              key={color}
              className={cx(
                'inline-flex rounded-full',
                disabled || readOnly ? 'cursor-default' : 'cursor-pointer',
                readOnly && 'opacity-70',
              )}
            >
              <input
                type="radio"
                className="peer sr-only"
                name={groupName}
                value={color}
                aria-label={swatchName(index)}
                checked={value === color}
                disabled={disabled}
                aria-disabled={readOnly || undefined}
                onChange={() => {
                  if (disabled || readOnly) return;
                  onChange?.(color);
                }}
              />
              <span
                aria-hidden
                style={style}
                className={cx(
                  'size-12 rounded-full bg-(--swatch) outline-(--swatch) transition-all',
                  'peer-checked:outline-2 peer-checked:outline-offset-3',
                  'peer-focus-visible:outline-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4',
                )}
              />
            </label>
          );
        })}
      </fieldset>
    </div>
  );
}
