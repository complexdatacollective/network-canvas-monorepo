import { defineMessages } from '@codaco/app-i18n/messages';
import { ASSET_BLOCK_SIZES, type AssetBlockSize } from '@codaco/shared-consts';

// The ids these messages had as the settings of an item in a page's list of
// blocks, before a page became one text: the words are the same, so their
// translations still stand.
export const messages = defineMessages({
  unusable: {
    id: 'protocolBuilder.contentBlock.previewUnusable',
    defaultMessage:
      'This block’s resource is not in this protocol, or is not something a page can show.',
    description:
      'Shown in the text of a page participants read, in place of an image, audio recording or video placed in that text, when it points at a file the protocol no longer holds, or at one a page cannot present — a roster of people, a map layer, a key.',
  },
  descriptionLabel: {
    id: 'protocolBuilder.contentBlock.descriptionLabel',
    defaultMessage: 'Description',
    description:
      'Label of the control, in the settings of an image, audio recording or video placed in the text of a page, holding the words that stand in for the file for a participant who cannot see or hear it.',
  },
  imageDescriptionHint: {
    id: 'protocolBuilder.contentBlock.imageDescriptionHint',
    defaultMessage:
      'This is read aloud to participants who use screen reader technology. Leave it blank if the image is decorative.',
    description:
      'Guidance under the description control of an image placed in the text of a page. Decorative means the picture adds nothing a participant would miss.',
  },
  audioDescriptionHint: {
    id: 'protocolBuilder.contentBlock.audioDescriptionHint',
    defaultMessage:
      'This is read aloud, in place of the file’s name, to participants who use screen reader technology.',
    description:
      'Guidance under the description control of an audio recording placed in the text of a page.',
  },
  videoDescriptionHint: {
    id: 'protocolBuilder.contentBlock.videoDescriptionHint',
    defaultMessage:
      'This is read aloud, in place of the file’s name, to participants who use screen reader technology.',
    description:
      'Guidance under the description control of a video placed in the text of a page.',
  },
  sizeLabel: {
    id: 'protocolBuilder.assetBlock.sizeLabel',
    defaultMessage: 'Display size',
    description:
      'Label of the control, in the settings of an image or video placed in the text of a page, that chooses how tall it is drawn: Full size, Small, Medium or Large.',
  },
  sizeHint: {
    id: 'protocolBuilder.assetBlock.sizeHint',
    defaultMessage:
      'How tall this is shown on the page. Full size shows it at its natural height. You can also drag the handle at its corner.',
    description:
      'Guidance under the Display size control of an image or video placed in the text of a page. "This" is the image or video. The handle is a small round dot at a bottom corner of the selected image or video.',
  },
  alignLabel: {
    id: 'protocolBuilder.assetBlock.alignLabel',
    defaultMessage: 'Alignment',
    description:
      'Label of the control, in the settings of an image, audio recording or video placed in the text of a page, that chooses where it sits across the page: where a line of text starts, in the middle, or where a line ends.',
  },
  imageFileLabel: {
    id: 'protocolBuilder.assetBlock.imageFileLabel',
    defaultMessage: 'Image',
    description:
      'Label of the control, in the settings of an image placed in the text of a page, that shows which image file it is and lets another be chosen in its place.',
  },
  audioFileLabel: {
    id: 'protocolBuilder.assetBlock.audioFileLabel',
    defaultMessage: 'Audio',
    description:
      'Label of the control, in the settings of an audio recording placed in the text of a page, that shows which audio file it is and lets another be chosen in its place.',
  },
  videoFileLabel: {
    id: 'protocolBuilder.assetBlock.videoFileLabel',
    defaultMessage: 'Video',
    description:
      'Label of the control, in the settings of a video placed in the text of a page, that shows which video file it is and lets another be chosen in its place.',
  },
  fileHint: {
    id: 'protocolBuilder.assetBlock.fileHint',
    defaultMessage:
      'The file shown here. Choosing another keeps the description and other settings.',
    description:
      'Guidance under the control that shows which file an image, audio recording or video placed in the text of a page is, and lets another be chosen in its place. "Here" is this place in the text. "The description and other settings" are this image, recording or video\'s own settings in the same panel (its description, display size, alignment and playback); they stay as they are when a different file is chosen.',
  },
  sizeFull: {
    id: 'protocolBuilder.contentBlock.sizeFull',
    defaultMessage: 'Full size',
    description:
      'Choice offered for how tall a picture or video on a page is drawn: however tall it naturally is, unconstrained.',
  },
  sizeSmall: {
    id: 'protocolBuilder.contentBlock.sizeSmall',
    defaultMessage: 'Small',
    description:
      'Choice offered for how tall a picture or video on a page is drawn.',
  },
  sizeMedium: {
    id: 'protocolBuilder.contentBlock.sizeMedium',
    defaultMessage: 'Medium',
    description:
      'Choice offered for how tall a picture or video on a page is drawn.',
  },
  sizeLarge: {
    id: 'protocolBuilder.contentBlock.sizeLarge',
    defaultMessage: 'Large',
    description:
      'Choice offered for how tall a picture or video on a page is drawn.',
  },
  autoplay: {
    id: 'protocolBuilder.assetBlock.autoplay',
    defaultMessage: 'Start playing automatically',
    description:
      'Label of a checkbox in the settings of an audio recording or video placed in the text of a page participants read. When ticked, the recording starts by itself as the participant reaches the page; when clear, the participant starts it.',
  },
  loop: {
    id: 'protocolBuilder.assetBlock.loop',
    defaultMessage: 'Repeat when it ends',
    description:
      'Label of a checkbox in the settings of an audio recording or video placed in the text of a page participants read. When ticked, the recording starts again from the beginning each time it finishes.',
  },
  remove: {
    id: 'protocolBuilder.assetBlock.remove',
    defaultMessage: 'Delete',
    description:
      'Button in the settings of an image, audio recording or video placed in the text of a page. It takes the image, recording or video out of the text; the file itself stays in the protocol.',
  },
});

export const DESCRIPTION_HINTS = {
  image: messages.imageDescriptionHint,
  audio: messages.audioDescriptionHint,
  video: messages.videoDescriptionHint,
} as const;

export const FILE_LABELS = {
  image: messages.imageFileLabel,
  audio: messages.audioFileLabel,
  video: messages.videoFileLabel,
} as const;

/** A size a picture can be drawn at: one of a block's, or its own. */
export type SizeChoice = AssetBlockSize | 'full';

// As they are offered: as the file is, then smallest first.
export const SIZE_CHOICES = ['full', ...ASSET_BLOCK_SIZES] as const;

export const SIZE_LABELS = {
  full: messages.sizeFull,
  small: messages.sizeSmall,
  medium: messages.sizeMedium,
  large: messages.sizeLarge,
} as const;
