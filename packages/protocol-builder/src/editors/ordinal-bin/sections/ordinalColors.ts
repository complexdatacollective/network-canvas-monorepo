import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';
import type { ColorSwatchOption } from '@codaco/fresco-ui/form/fields/ColorPicker';
import {
  type OrdinalColorReference,
  OrdinalColorSequence,
} from '@codaco/protocol-validation';

const messages = defineMessages({
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

/** The gradient an Ordinal Bin prompt starts out shaded along. */
export const FIRST_ORDINAL_COLOR: OrdinalColorReference = 'ord-color-seq-1';

/**
 * Every gradient the protocol schema's ordinal sequence offers, in its own
 * order and each carrying a name a screen reader can read.
 *
 * The sequence is the single source of what a gradient may be, so a shorter
 * list would have to special-case a protocol already using one of the rest.
 */
export const ordinalColorOptions = (intl: IntlShape): ColorSwatchOption[] =>
  OrdinalColorSequence.map((value) => ({
    value,
    label: intl.formatMessage(SWATCH_NAMES[value]),
  }));
