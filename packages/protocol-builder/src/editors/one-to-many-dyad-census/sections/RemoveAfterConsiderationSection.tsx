import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import BooleanField from '@codaco/fresco-ui/form/fields/Boolean';

import { REQUIRED } from '../../../form/requiredField.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';

/** The schema holds this stage's one behaviour inside its own object. */
const FIELD = 'behaviours.removeAfterConsideration';

const messages = defineMessages({
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

/**
 * What becomes of a person the participant has already been asked about.
 *
 * Not a capability: the protocol schema requires an answer either way, so
 * there is nothing here to switch off — a One-to-Many Dyad Census that does
 * not say is a stage the schema refuses. Both answers are therefore offered as
 * choices rather than one of them being a switch with an implied default.
 *
 * Where it sits in the editor is the one thing that differs from Architect,
 * and the editor that mounts it says why.
 */
export default function RemoveAfterConsiderationSection() {
  const intl = useAppIntl();

  return (
    <BuilderSection
      title={intl.formatMessage(messages.title)}
      description={intl.formatMessage(messages.description)}
    >
      <Field<typeof BooleanField>
        name={FIELD}
        component={BooleanField}
        label={intl.formatMessage(messages.fieldLabel)}
        required={REQUIRED}
        options={[
          { value: true, label: intl.formatMessage(messages.removeLabel) },
          { value: false, label: intl.formatMessage(messages.keepLabel) },
        ]}
      />
    </BuilderSection>
  );
}
