import { defineMessages } from '@codaco/app-i18n/messages';

const messages = defineMessages({
  description: {
    id: 'interviewer.sampleProtocol.description',
    defaultMessage:
      'A complete reference protocol from the Network Canvas team — useful for exploring how stages, prompts, and codebooks fit together.',
    description:
      'Administration teaser description before installing the bundled sample. The actual protocol content remains unchanged.',
  },
});

export const SAMPLE_PROTOCOL = {
  // Identifies the bundled study and matches its authored name after import.
  name: 'Sample Protocol',
  description: messages.description,
} as const;
