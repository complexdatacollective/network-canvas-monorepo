import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';

import {
  LocalizedInputField,
  LocalizedRichTextField,
} from '../../../fields/LocalizedStringField.tsx';
import { REQUIRED } from '../../../form/requiredField.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import { anonymisationMessages } from './anonymisationMessages.ts';

/** The schema keeps this stage's explanation in one object with two parts. */
const TITLE_FIELD = 'explanationText.title';
const BODY_FIELD = 'explanationText.body';

/**
 * What the participant is told before they choose a passphrase.
 *
 * Not a capability: an anonymisation stage without an explanation is a stage
 * that asks a participant for a secret and tells them nothing about it, and
 * the protocol schema refuses it. Both halves are owned together because they
 * are the two parts of one schema object — a section owning part of a nested
 * value has to render all of it, or the part it does not render is written
 * back over on save.
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
      <Field<typeof LocalizedInputField>
        name={TITLE_FIELD}
        component={LocalizedInputField}
        label={intl.formatMessage(
          anonymisationMessages.explanationHeadingLabel,
        )}
        placeholder={intl.formatMessage(
          anonymisationMessages.explanationHeadingPlaceholder,
        )}
        required={REQUIRED}
      />
      <Field<typeof LocalizedRichTextField>
        name={BODY_FIELD}
        component={LocalizedRichTextField}
        label={intl.formatMessage(anonymisationMessages.explanationBodyLabel)}
        placeholder={intl.formatMessage(
          anonymisationMessages.explanationBodyPlaceholder,
        )}
        required={REQUIRED}
      />
    </BuilderSection>
  );
}
