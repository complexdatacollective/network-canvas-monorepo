import type { ColorSwatchOption } from '@codaco/fresco-ui/form/fields/ColorPicker';
import {
  type OrdinalColorReference,
  OrdinalColorSequence,
} from '@codaco/protocol-validation';

/** The gradient an Ordinal Bin prompt starts out shaded along. */
export const FIRST_ORDINAL_COLOR: OrdinalColorReference = 'ord-color-seq-1';

/**
 * Every gradient the protocol schema's ordinal sequence offers, in its own
 * order.
 *
 * The sequence is the single source of what a gradient may be, so a shorter
 * list would have to special-case a protocol already using one of the rest.
 *
 * No `label`: these are the theme's own ordinal sequence, which the colour
 * picker names after the hue each position resolves to, so a swatch is
 * announced as "Sea Green" rather than as a position — and named in one place
 * rather than once per picker that offers the same sequence.
 */
export const ordinalColorOptions = (): ColorSwatchOption[] =>
  OrdinalColorSequence.map((value) => ({ value }));
