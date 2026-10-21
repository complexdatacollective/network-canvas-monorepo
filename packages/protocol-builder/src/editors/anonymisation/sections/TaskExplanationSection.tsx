import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';

import { LocalizedRichTextField } from '../../../fields/LocalizedStringField.tsx';
import { REQUIRED } from '../../../form/requiredField.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import { anonymisationMessages } from './anonymisationMessages.ts';

const EXPLANATION_FIELD = 'explanationText';

/**
 * What the participant is told before they choose a passphrase, heading
 * included: the text is markdown, and its first line is usually a heading.
 *
 * Not a capability: an anonymisation stage without an explanation is a stage
 * that asks a participant for a secret and tells them nothing about it, and
 * the protocol schema refuses it.
 */
export default function TaskExplanationSection() {
  const intl = useAppIntl();

  return (
    <BuilderSection
      title={intl.formatMessage(anonymisationMessages.explanationTitle)}
      description={intl.formatMessage(
        anonymisationMessages.explanationDescription,
      )}
    >
      <Field<typeof LocalizedRichTextField>
        name={EXPLANATION_FIELD}
        component={LocalizedRichTextField}
        dynamicValues="stageText"
        label={intl.formatMessage(anonymisationMessages.explanationTextLabel)}
        placeholder={intl.formatMessage(
          anonymisationMessages.explanationBodyPlaceholder,
        )}
        required={REQUIRED}
      />
    </BuilderSection>
  );
}
