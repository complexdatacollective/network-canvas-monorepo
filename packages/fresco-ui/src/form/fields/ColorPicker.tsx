'use client';

import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';
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
 * The hues the theme's colour sequences are built from, each named as the
 * design system names it.
 *
 * A colour is a value with a name: a swatch announced as "Color 3" tells a
 * reader who cannot see it nothing at all, and a position is not something a
 * researcher can say to a colleague. The names live here rather than at each
 * caller because the sequences are the THEME's — every picker offering
 * `node-color-seq-2` is offering the same hue — so naming them per caller is
 * how the same colour ends up called two things.
 */
const hueMessages = defineMessages({
  neonCoral: {
    id: 'frescoUi.colorPicker.neonCoral',
    defaultMessage: 'Neon Coral',
    description:
      'Name of one colour swatch, announced in place of the swatch itself. A warm red-pink.',
  },
  seaSerpent: {
    id: 'frescoUi.colorPicker.seaSerpent',
    defaultMessage: 'Sea Serpent',
    description:
      'Name of one colour swatch, announced in place of the swatch itself. A blue-green.',
  },
  purplePizazz: {
    id: 'frescoUi.colorPicker.purplePizazz',
    defaultMessage: 'Purple Pizazz',
    description:
      'Name of one colour swatch, announced in place of the swatch itself. A bright purple.',
  },
  neonCarrot: {
    id: 'frescoUi.colorPicker.neonCarrot',
    defaultMessage: 'Neon Carrot',
    description:
      'Name of one colour swatch, announced in place of the swatch itself. A bright orange.',
  },
  kiwi: {
    id: 'frescoUi.colorPicker.kiwi',
    defaultMessage: 'Kiwi',
    description:
      'Name of one colour swatch, announced in place of the swatch itself. A yellow-green.',
  },
  ceruleanBlue: {
    id: 'frescoUi.colorPicker.ceruleanBlue',
    defaultMessage: 'Cerulean Blue',
    description:
      'Name of one colour swatch, announced in place of the swatch itself. A deep sky blue.',
  },
  paradisePink: {
    id: 'frescoUi.colorPicker.paradisePink',
    defaultMessage: 'Paradise Pink',
    description:
      'Name of one colour swatch, announced in place of the swatch itself. A warm pink.',
  },
  mustard: {
    id: 'frescoUi.colorPicker.mustard',
    defaultMessage: 'Mustard',
    description:
      'Name of one colour swatch, announced in place of the swatch itself. A dark yellow.',
  },
  tomato: {
    id: 'frescoUi.colorPicker.tomato',
    defaultMessage: 'Tomato',
    description:
      'Name of one colour swatch, announced in place of the swatch itself. A red.',
  },
  slateBlue: {
    id: 'frescoUi.colorPicker.slateBlue',
    defaultMessage: 'Slate Blue',
    description:
      'Name of one colour swatch, announced in place of the swatch itself. A muted violet-blue.',
  },
  seaGreen: {
    id: 'frescoUi.colorPicker.seaGreen',
    defaultMessage: 'Sea Green',
    description:
      'Name of one colour swatch, announced in place of the swatch itself. A green.',
  },
  barbiePink: {
    id: 'frescoUi.colorPicker.barbiePink',
    defaultMessage: 'Barbie Pink',
    description:
      'Name of one colour swatch, announced in place of the swatch itself. A vivid pink.',
  },
});

/**
 * Every position each colour sequence defines, named after the hue the theme
 * resolves it to.
 *
 * Not invented: `--node-1` is `oklch(var(--neon-coral))` in
 * `tooling/tailwind/fresco/themes/default.css`, so the first node swatch IS
 * Neon Coral. `ColorPicker.test.tsx` reads that stylesheet and fails if a
 * sequence is reordered underneath these names — a swatch announcing the wrong
 * colour is worse than one announcing a position. Complete over each sequence,
 * even where an individual picker offers only part of it.
 */
export const COLOR_SEQUENCE_HUE_NAMES: Readonly<
  Record<string, readonly MessageDescriptor[]>
> = Object.freeze({
  'node-color-seq': [
    hueMessages.neonCoral,
    hueMessages.seaSerpent,
    hueMessages.purplePizazz,
    hueMessages.neonCarrot,
    hueMessages.kiwi,
    hueMessages.ceruleanBlue,
    hueMessages.paradisePink,
    hueMessages.mustard,
  ],
  'edge-color-seq': [
    hueMessages.mustard,
    hueMessages.purplePizazz,
    hueMessages.neonCoral,
    hueMessages.kiwi,
    hueMessages.paradisePink,
    hueMessages.tomato,
    hueMessages.seaSerpent,
    hueMessages.slateBlue,
    hueMessages.seaGreen,
    hueMessages.ceruleanBlue,
  ],
  'ord-color-seq': [
    hueMessages.seaGreen,
    hueMessages.seaSerpent,
    hueMessages.tomato,
    hueMessages.neonCarrot,
    hueMessages.kiwi,
    hueMessages.ceruleanBlue,
    hueMessages.paradisePink,
    hueMessages.mustard,
    hueMessages.purplePizazz,
    hueMessages.slateBlue,
  ],
  'cat-color-seq': [
    hueMessages.seaSerpent,
    hueMessages.purplePizazz,
    hueMessages.mustard,
    hueMessages.paradisePink,
    hueMessages.kiwi,
    hueMessages.ceruleanBlue,
    hueMessages.neonCarrot,
    hueMessages.barbiePink,
    hueMessages.tomato,
    hueMessages.slateBlue,
  ],
});

/**
 * What a theme colour-sequence swatch is called, or `undefined` for a value
 * that is not one of the sequences — a caller's own CSS colour, which only the
 * caller can name.
 */
export function colorSequenceHueName(
  value: string,
  intl: IntlShape,
): string | undefined {
  const prefix = SEQUENCE_PREFIXES.find((candidate) =>
    value.startsWith(candidate),
  );
  if (!prefix) return undefined;

  const position = Number(value.slice(prefix.length));
  const name = COLOR_SEQUENCE_HUE_NAMES[prefix.slice(0, -1)]?.[position - 1];
  return name ? intl.formatMessage(name) : undefined;
}

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
  /**
   * The swatch's accessible name. A colour is not one without it — but a
   * swatch drawn from one of the theme's colour sequences already has a name,
   * so this is only for a palette of the caller's own colours. Supplied for a
   * sequence colour, it wins.
   */
  label?: string;
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
 * is legible without perceiving the colour at all. Every swatch also carries a
 * hairline in the group's foreground, and the chosen one a ring in it, so a
 * swatch filled with the group's own background colour is still a swatch and
 * can still be seen to be the chosen one. A swatch whose fill is see-through
 * shows the chequerboard it is painted on, so `transparent` is never the same
 * disc as the colour the group is painted in.
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
        // What the swatch is painted on. A fill is any CSS colour a caller
        // has, and a colour is free to be see-through — `transparent`, or
        // anything carrying an alpha channel. Painted straight onto the group,
        // such a swatch is the group's own background: the same disc as one
        // filled with `--input` itself, and nothing a reader can tell it apart
        // from, since the difference lives only in the accessible name. This
        // layer shows through exactly as much as the fill lets it, in the one
        // pattern that already reads as "see-through", and an opaque fill
        // covers it completely.
        <span
          key={option.value}
          className={cx(
            'relative block size-12 shrink-0 rounded-full',
            'bg-input [--swatch-check:color-mix(in_oklab,var(--input-contrast)_60%,transparent)]',
            '[background-image:conic-gradient(var(--swatch-check)_0_25%,transparent_0_50%,var(--swatch-check)_0_75%,transparent_0)]',
            'bg-size-[--spacing(3)_--spacing(3)]',
          )}
        >
          <Radio.Root
            value={option.value}
            disabled={disabled}
            nativeButton
            render={(renderProps, state) => (
              <button
                {...renderProps}
                type="button"
                aria-label={
                  option.label ??
                  colorSequenceHueName(option.value, intl) ??
                  option.value
                }
                className={cx(
                  'focusable relative block size-full rounded-full',
                  // The selection ring is the design system's focus outline in
                  // the swatch's own colour (never a generic primary border),
                  // so the cue reads as "this colour". Hover previews it at a
                  // tighter offset.
                  'bg-(--swatch-color) outline-(--swatch-color) transition-all',
                  // A swatch may be filled with any CSS colour a caller has,
                  // including the group's own background — white, transparent,
                  // anything near `--input`. Such a swatch is an invisible disc
                  // on an invisible ground, and a ring in its own colour cannot
                  // say it is the chosen one. So the group's foreground draws a
                  // hairline round every swatch and a full ring round the
                  // chosen one: neither the swatch nor its chosen state is ever
                  // left to a colour that can vanish. At full strength, because
                  // the hairline is the whole of the swatch's edge whenever the
                  // fill is the ground, and a boundary a reader has to hunt for
                  // is not one — faded, it clears none of the 3:1 that telling
                  // a control from its background asks for.
                  'inset-ring-input-contrast inset-ring-1',
                  // Focus is the same promise, and belongs to the reader rather
                  // than to the palette: never the swatch's colour.
                  'focus-visible:outline-input-contrast',
                  state.checked
                    ? 'ring-input-contrast ring-2 outline-2 outline-offset-3'
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
        </span>
      ))}
    </RadioGroup>
  );
}
