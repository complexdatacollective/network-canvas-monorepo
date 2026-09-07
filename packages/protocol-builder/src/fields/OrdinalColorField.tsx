import { type CSSProperties, useId } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import { cx } from '@codaco/fresco-ui/utils/cva';
import {
  type OrdinalColorReference,
  OrdinalColorSequence,
} from '@codaco/protocol-validation';

import { protocolColor } from '../protocolColor.ts';

const messages = defineMessages({
  groupLabel: {
    id: 'protocolBuilder.ordinalColor.groupLabel',
    defaultMessage: 'Color gradient',
    description:
      'Accessible name of the row of colour swatches, used only where the field around it has supplied none. Each swatch is one gradient the ordered answers of a scale are shaded along.',
  },
  ordColorSeq1: {
    id: 'protocolBuilder.ordinalColor.ordColorSeq1',
    defaultMessage: 'Sea Green',
    description:
      'Name of one colour swatch, read out in place of the swatch itself. A colour name rather than a position, because the researcher picks a gradient by how it looks and then has to be able to say which one they picked.',
  },
  ordColorSeq2: {
    id: 'protocolBuilder.ordinalColor.ordColorSeq2',
    defaultMessage: 'Sea Serpent',
    description:
      'Name of one colour swatch, read out in place of the swatch itself. A blue-green.',
  },
  ordColorSeq3: {
    id: 'protocolBuilder.ordinalColor.ordColorSeq3',
    defaultMessage: 'Tomato',
    description:
      'Name of one colour swatch, read out in place of the swatch itself. A red.',
  },
  ordColorSeq4: {
    id: 'protocolBuilder.ordinalColor.ordColorSeq4',
    defaultMessage: 'Neon Carrot',
    description:
      'Name of one colour swatch, read out in place of the swatch itself. A bright orange.',
  },
  ordColorSeq5: {
    id: 'protocolBuilder.ordinalColor.ordColorSeq5',
    defaultMessage: 'Kiwi',
    description:
      'Name of one colour swatch, read out in place of the swatch itself. A yellow-green.',
  },
  ordColorSeq6: {
    id: 'protocolBuilder.ordinalColor.ordColorSeq6',
    defaultMessage: 'Cerulean Blue',
    description:
      'Name of one colour swatch, read out in place of the swatch itself. A deep sky blue.',
  },
  ordColorSeq7: {
    id: 'protocolBuilder.ordinalColor.ordColorSeq7',
    defaultMessage: 'Paradise Pink',
    description:
      'Name of one colour swatch, read out in place of the swatch itself. A warm pink.',
  },
  ordColorSeq8: {
    id: 'protocolBuilder.ordinalColor.ordColorSeq8',
    defaultMessage: 'Mustard',
    description:
      'Name of one colour swatch, read out in place of the swatch itself. A dark yellow.',
  },
  ordColorSeq9: {
    id: 'protocolBuilder.ordinalColor.ordColorSeq9',
    defaultMessage: 'Purple Pizazz',
    description:
      'Name of one colour swatch, read out in place of the swatch itself. A bright purple.',
  },
  ordColorSeq10: {
    id: 'protocolBuilder.ordinalColor.ordColorSeq10',
    defaultMessage: 'Slate Blue',
    description:
      'Name of one colour swatch, read out in place of the swatch itself. A muted violet-blue.',
  },
});

/**
 * The researcher-facing name of each swatch, keyed by the colour the protocol
 * schema stores.
 *
 * Keyed on the schema's own token rather than indexed by position: the key is
 * then stable whatever order the sequence is drawn in, and a colour added to
 * the sequence fails to typecheck here rather than falling through to a
 * name-shaped placeholder nobody wrote.
 */
const SWATCH_NAMES: Readonly<Record<OrdinalColorReference, MessageDescriptor>> =
  Object.freeze({
    'ord-color-seq-1': messages.ordColorSeq1,
    'ord-color-seq-2': messages.ordColorSeq2,
    'ord-color-seq-3': messages.ordColorSeq3,
    'ord-color-seq-4': messages.ordColorSeq4,
    'ord-color-seq-5': messages.ordColorSeq5,
    'ord-color-seq-6': messages.ordColorSeq6,
    'ord-color-seq-7': messages.ordColorSeq7,
    'ord-color-seq-8': messages.ordColorSeq8,
    'ord-color-seq-9': messages.ordColorSeq9,
    'ord-color-seq-10': messages.ordColorSeq10,
  });

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
  const intl = useAppIntl();
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
          ariaLabelledBy === undefined
            ? intl.formatMessage(messages.groupLabel)
            : undefined
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
        {OrdinalColorSequence.map((color) => {
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
                aria-label={intl.formatMessage(SWATCH_NAMES[color])}
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
