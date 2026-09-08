import { defineMessages } from '@codaco/app-i18n/messages';
const configMessages = defineMessages({
  image: {
    id: 'architect.sections.contentGrid.options.config.image',
    defaultMessage: 'Image',
    description:
      'Presentation label or description in components/sections/ContentGrid/options.tsx. Identifiers are not translated.',
  },
  video: {
    id: 'architect.sections.contentGrid.options.config.video',
    defaultMessage: 'Video',
    description:
      'Presentation label or description in components/sections/ContentGrid/options.tsx. Identifiers are not translated.',
  },
  audio: {
    id: 'architect.sections.contentGrid.options.config.audio',
    defaultMessage: 'Audio',
    description:
      'Presentation label or description in components/sections/ContentGrid/options.tsx. Identifiers are not translated.',
  },
  text: {
    id: 'architect.sections.contentGrid.options.config.text',
    defaultMessage: 'Text',
    description:
      'Presentation label or description in components/sections/ContentGrid/options.tsx. Identifiers are not translated.',
  },
  fullSize: {
    id: 'architect.sections.contentGrid.options.config.fullSize',
    defaultMessage: 'Full size',
    description:
      'Presentation label or description in components/sections/ContentGrid/options.tsx. Identifiers are not translated.',
  },
  small: {
    id: 'architect.sections.contentGrid.options.config.small',
    defaultMessage: 'Small',
    description:
      'Presentation label or description in components/sections/ContentGrid/options.tsx. Identifiers are not translated.',
  },
  medium: {
    id: 'architect.sections.contentGrid.options.config.medium',
    defaultMessage: 'Medium',
    description:
      'Presentation label or description in components/sections/ContentGrid/options.tsx. Identifiers are not translated.',
  },
  large: {
    id: 'architect.sections.contentGrid.options.config.large',
    defaultMessage: 'Large',
    description:
      'Presentation label or description in components/sections/ContentGrid/options.tsx. Identifiers are not translated.',
  },
});

export const typeOptions = [
  { value: 'image', label: configMessages.image },
  { value: 'video', label: configMessages.video },
  { value: 'audio', label: configMessages.audio },
  { value: 'text', label: configMessages.text },
];

// Optional display-size treatment for image and video items. "Full size" (the
// empty value) leaves the item unconstrained so it renders at its natural size.
export const sizeOptions = [
  { value: '', label: configMessages.fullSize },
  { value: 'SMALL', label: configMessages.small },
  { value: 'MEDIUM', label: configMessages.medium },
  { value: 'LARGE', label: configMessages.large },
];
