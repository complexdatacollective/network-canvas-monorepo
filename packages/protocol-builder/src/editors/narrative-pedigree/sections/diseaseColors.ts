import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';
import type { ColorSwatchOption } from '@codaco/fresco-ui/form/fields/ColorPicker';
import {
  type NodeColorReference,
  NodeColorSequence,
} from '@codaco/protocol-validation';

const messages = defineMessages({
  nodeColorSeq1: {
    id: 'protocolBuilder.narrativePedigree.nodeColorSeq1',
    defaultMessage: 'Neon Coral',
    description:
      'Name of one colour swatch, read out in place of the swatch itself. A colour name rather than a position, because a researcher choosing what a disease is drawn in has to be able to say which colour they chose. A pinkish red.',
  },
  nodeColorSeq2: {
    id: 'protocolBuilder.narrativePedigree.nodeColorSeq2',
    defaultMessage: 'Sea Serpent',
    description:
      'Name of one colour swatch, read out in place of the swatch itself. A blue-green.',
  },
  nodeColorSeq3: {
    id: 'protocolBuilder.narrativePedigree.nodeColorSeq3',
    defaultMessage: 'Purple Pizazz',
    description:
      'Name of one colour swatch, read out in place of the swatch itself. A bright purple.',
  },
  nodeColorSeq4: {
    id: 'protocolBuilder.narrativePedigree.nodeColorSeq4',
    defaultMessage: 'Neon Carrot',
    description:
      'Name of one colour swatch, read out in place of the swatch itself. A bright orange.',
  },
  nodeColorSeq5: {
    id: 'protocolBuilder.narrativePedigree.nodeColorSeq5',
    defaultMessage: 'Kiwi',
    description:
      'Name of one colour swatch, read out in place of the swatch itself. A yellow-green.',
  },
  nodeColorSeq6: {
    id: 'protocolBuilder.narrativePedigree.nodeColorSeq6',
    defaultMessage: 'Cerulean Blue',
    description:
      'Name of one colour swatch, read out in place of the swatch itself. A deep sky blue.',
  },
  nodeColorSeq7: {
    id: 'protocolBuilder.narrativePedigree.nodeColorSeq7',
    defaultMessage: 'Paradise Pink',
    description:
      'Name of one colour swatch, read out in place of the swatch itself. A warm pink.',
  },
  nodeColorSeq8: {
    id: 'protocolBuilder.narrativePedigree.nodeColorSeq8',
    defaultMessage: 'Mustard',
    description:
      'Name of one colour swatch, read out in place of the swatch itself. A dark yellow.',
  },
});

/**
 * The researcher-facing name of each swatch, keyed by the colour the protocol
 * schema stores.
 *
 * Keyed on the schema's own token rather than indexed by position, exactly as
 * the ordinal gradients beside the bins are: the key is then stable whatever
 * order the sequence is drawn in, and a colour added to the sequence fails to
 * typecheck here rather than falling through to a name-shaped placeholder
 * nobody wrote.
 *
 * The names are the design system's own names for the hue each position
 * resolves to — `--node-1` is `oklch(var(--neon-coral))` in
 * `tooling/tailwind/fresco/themes/default.css` — and the same names the
 * released Architect read them out under. `__tests__/colorSwatchNames.test.ts`
 * reads that stylesheet, so a reordered palette fails there rather than
 * teaching a screen-reader user that swatch 3 is "Purple Pizazz" when the
 * theme has made it green.
 */
const SWATCH_NAMES: Readonly<Record<NodeColorReference, MessageDescriptor>> =
  Object.freeze({
    'node-color-seq-1': messages.nodeColorSeq1,
    'node-color-seq-2': messages.nodeColorSeq2,
    'node-color-seq-3': messages.nodeColorSeq3,
    'node-color-seq-4': messages.nodeColorSeq4,
    'node-color-seq-5': messages.nodeColorSeq5,
    'node-color-seq-6': messages.nodeColorSeq6,
    'node-color-seq-7': messages.nodeColorSeq7,
    'node-color-seq-8': messages.nodeColorSeq8,
  });

/**
 * Every colour a disease may be drawn in, in the schema's own order and each
 * carrying a name a screen reader can read.
 */
export const diseaseColorOptions = (intl: IntlShape): ColorSwatchOption[] =>
  NodeColorSequence.map((value) => ({
    value,
    label: intl.formatMessage(SWATCH_NAMES[value]),
  }));
