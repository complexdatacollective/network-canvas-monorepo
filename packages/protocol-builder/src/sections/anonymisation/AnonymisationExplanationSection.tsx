import { useAppIntl } from '@codaco/app-i18n/react';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

import RichTextField from '../../fields/RichTextField.tsx';
import ProtocolField from '../../form/ProtocolField.tsx';
import BuilderSection from '../BuilderSection.tsx';
import { anonymisationMessages } from './anonymisationMessages.ts';

/** The schema keeps this stage's explanation in one object with two parts. */
const TITLE_FIELD = 'explanationText.title';
const BODY_FIELD = 'explanationText.body';

/** A heading, so it has to read as one rather than as a paragraph. */
const TITLE_LIMIT = 50;

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
export default function AnonymisationExplanationSection() {
  const intl = useAppIntl();

  return (
    <BuilderSection
      title={intl.formatMessage(anonymisationMessages.explanationTitle)}
      description={intl.formatMessage(
        anonymisationMessages.explanationDescription,
      )}
    >
      <ProtocolField<typeof InputField>
        name={TITLE_FIELD}
        component={InputField}
        label={intl.formatMessage(
          anonymisationMessages.explanationHeadingLabel,
        )}
        hint={intl.formatMessage(anonymisationMessages.explanationHeadingHint)}
        placeholder={intl.formatMessage(
          anonymisationMessages.explanationHeadingPlaceholder,
        )}
        required
        maxLength={TITLE_LIMIT}
      />
      <ProtocolField<typeof RichTextField>
        name={BODY_FIELD}
        component={RichTextField}
        label={intl.formatMessage(anonymisationMessages.explanationBodyLabel)}
        hint={intl.formatMessage(anonymisationMessages.explanationBodyHint)}
        placeholder={intl.formatMessage(
          anonymisationMessages.explanationBodyPlaceholder,
        )}
        required
      />
    </BuilderSection>
  );
}
