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

const colorPickerOwnVariants = cva({
  // Overrides `controlVariants`' single-control shape: this group wraps its
  // swatches over as many rows as it needs, and must be free to shrink with
  // the field that holds it rather than hold a content-width floor.
  base: 'w-full min-w-0 flex-wrap justify-start text-wrap',
});

const colorPickerVariants = compose(
  controlVariants,
  inputControlVariants,
  groupSpacingVariants,
  stateVariants,
  colorPickerOwnVariants,
);

/**
 * A palette of colour swatches, chosen one at a time.
 *
 * A colour is a value with a name, not a decoration: every swatch carries its
 * own accessible name from `options`, and the chosen one is marked by an
 * outline standing off the swatch in the theme's selection colour — a change
 * of shape in a colour that is not the swatch's, so the selection is legible
 * without perceiving the swatch's colour at all. Hovering an unchosen swatch
 * previews that same outline at reduced strength. Every swatch is bordered in
 * the group's foreground, so a swatch filled with the group's own background
 * colour — white, transparent — is still a disc. A swatch whose fill is
 * see-through shows the chequerboard it is painted on, so `transparent` is
 * never the same disc as the colour the group is painted in.
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
            // Pointing at a swatch grows it. The cue is the swatch's own size,
            // not a faded copy of the chosen-ring, so an offer can never be
            // read as an answer. It scales here rather than on the control so
            // the chequerboard ground grows with the disc: a see-through fill
            // would otherwise overhang the only thing that makes it legible.
            // Hover on the control reaches this ground, which encloses it, so
            // the growth is written here; it is withheld from a group that
            // cannot be chosen from, which would otherwise answer a pointer it
            // does nothing for.
            'transition-transform duration-150 ease-out motion-reduce:transition-none',
            !disabled && !readOnly && 'hover:scale-110',
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
                  // No transition. The cue below is an outline, and an
                  // outline's colour starts at `currentColor` — the group's
                  // dark foreground — so easing it swept every swatch from
                  // dark to the selection colour on hover, reading as a
                  // flash rather than as feedback. Pointer feedback here is
                  // immediate, as it is everywhere else in the system.
                  'bg-(--swatch-color)',
                  // A swatch may be filled with any CSS colour a caller has,
                  // including the group's own background — white, transparent,
                  // anything near `--input`. Such a swatch is an invisible disc
                  // on an invisible ground, so the group's foreground draws the
                  // edge of every swatch: the disc is never left to a colour
                  // that can vanish. At full strength, because whenever the
                  // fill is the ground this border is the whole of the swatch's
                  // edge, and a boundary a reader has to hunt for is not one.
                  'border border-current',
                  // Being chosen is a change of shape in the theme's own
                  // selection colour, standing off the swatch — never the
                  // swatch's own colour, which says nothing about a colour
                  // being the chosen one, and which a swatch filled with the
                  // ground has none of to draw with. It is drawn thick because
                  // the selection colour is a light one: against a pale ground
                  // it carries little contrast, so the cue is made of the
                  // amount of it rather than of its colour alone.
                  //
                  // Keyboard focus draws the SAME ring, not a competing one.
                  // Arrowing a radio group moves the choice with the focus, so
                  // the two states name one thing here; left to the system
                  // default they disagreed on colour, width and offset, and a
                  // chosen swatch changed shape merely by being focused.
                  // `--focus-color` also colours the outline while it has no
                  // width, so nothing sweeps from `currentColor` when it gains
                  // one.
                  '[--focus-color:var(--color-selected)]',
                  'focus-visible:outline-4 focus-visible:outline-offset-2',
                  state.checked &&
                    'outline-selected outline-4 outline-offset-2',
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
