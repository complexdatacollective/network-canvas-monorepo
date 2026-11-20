import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import BooleanField from '@codaco/fresco-ui/form/fields/Boolean';

import { REQUIRED } from '../../../form/requiredField.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import { removeAfterConsiderationMessages as messages } from './removeAfterConsiderationMessages.ts';

/** The schema holds this stage's one behaviour inside its own object. */
const FIELD = 'behaviours.removeAfterConsideration';

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
      sectionKey="node-availability"
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
