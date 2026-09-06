import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * The geospatial sections' copy that leaves this family.
 *
 * The four sentences `PromptsSection` says on this family's behalf. A
 * geospatial prompt asks the participant WHERE something is and stores the
 * answer in one location attribute, which is a different thing from the
 * question-and-answer the shared section is worded for — so the sentences are
 * whole rather than a noun swapped into a shared frame, and they are
 * descriptors rather than strings so a translator ever sees them.
 */
export const geospatialMessages = defineMessages({
  promptsDescription: {
    id: 'protocolBuilder.geospatial.promptsDescription',
    defaultMessage:
      'Write the questions this stage asks about places, and drag them into the order the participant answers them.',
    description:
      'Description of the prompts section on a geospatial stage, whose prompts ask about locations on a map. Replaces the generic prompts description.',
  },
  promptsWaitingDescription: {
    id: 'protocolBuilder.geospatial.promptsWaitingDescription',
    defaultMessage:
      'Choose the type this stage works with before writing its prompts.',
    description:
      'Shown in place of the geospatial prompts description while the researcher has not yet chosen which node or edge type the stage is about, so there is nothing for a prompt to be written against.',
  },
  promptsFieldHint: {
    id: 'protocolBuilder.geospatial.promptsFieldHint',
    defaultMessage:
      'Each prompt asks for one place and records it in one location attribute. Add at least one.',
    description:
      'Guidance under the geospatial prompt list. A location attribute is the codebook variable the chosen place is stored in.',
  },
  promptsEmptyState: {
    id: 'protocolBuilder.geospatial.promptsEmptyState',
    defaultMessage:
      'No prompts yet. Create one to ask the participant where something is.',
    description:
      'Shown in place of the geospatial prompt list while the stage asks nothing yet.',
  },
});
