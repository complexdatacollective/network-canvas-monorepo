import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * The words for a One-to-Many Dyad Census's one behaviour: whether a person
 * the participant has been asked about stays in the list. The stage editor
 * and the printable protocol summary both name it.
 */
export const removeAfterConsiderationMessages = defineMessages({
  title: {
    id: 'protocolBuilder.removeAfterConsideration.title',
    defaultMessage: 'Node availability',
    description:
      'Names this section of the stage editor, in the editor’s outline and to assistive technology. A node is one member of the network the participant is building; this section decides whether one they have already been asked about stays available to be asked about again.',
  },
  description: {
    id: 'protocolBuilder.removeAfterConsideration.description',
    defaultMessage:
      'Choose whether a focal node remains available after it has been considered.',
    description: 'Description of the section named above.',
  },
  fieldLabel: {
    id: 'protocolBuilder.removeAfterConsideration.fieldLabel',
    defaultMessage: 'Removal behavior',
    description:
      'Label of the two-answer control that decides what becomes of a person the participant has already been asked about.',
  },
  removeLabel: {
    id: 'protocolBuilder.removeAfterConsideration.removeLabel',
    defaultMessage: 'Remove them from the list',
    description:
      'The answer that takes a person out of the list the participant chooses from once they have been asked about.',
  },
  keepLabel: {
    id: 'protocolBuilder.removeAfterConsideration.keepLabel',
    defaultMessage: 'Keep them in the list',
    description:
      'The answer that leaves a person in the list the participant chooses from after they have been asked about, so an answer can be revisited.',
  },
});
