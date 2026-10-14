import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';

import { LocalizedInputField } from '../../../fields/LocalizedStringField.tsx';
import { REQUIRED } from '../../../form/requiredField.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import { finishSessionMessages } from './finishSessionMessages.ts';
import { useFinishMode } from './useFinishMode.ts';

const FINISH_LABEL_FIELD = 'finishLabel';
const FINISH_CONFIRMATION_FIELD = 'finishConfirmation';
const FINISH_FAILED_FIELD = 'finishFailed';

/**
 * The words a participant sees while finishing the interview: the button, the
 * question it asks, and what it says when ending fails. Each is required, and
 * starts with wording Network Canvas supplies in each of the protocol's
 * languages that it has.
 *
 * Only a stage that asks participants to confirm asks the question, so that
 * field is absent in automatic mode. The button stays: an automatic stage
 * whose finishing fails offers it to try again.
 */
export default function FinishingSection() {
  const intl = useAppIntl();
  const finishMode = useFinishMode();

  return (
    <BuilderSection
      title={intl.formatMessage(finishSessionMessages.finishingTitle)}
      description={intl.formatMessage(
        finishSessionMessages.finishingDescription,
      )}
    >
      <Field<typeof LocalizedInputField>
        name={FINISH_LABEL_FIELD}
        component={LocalizedInputField}
        label={intl.formatMessage(finishSessionMessages.finishLabelLabel)}
        required={REQUIRED}
      />
      {finishMode === 'confirmation' && (
        <Field<typeof LocalizedInputField>
          name={FINISH_CONFIRMATION_FIELD}
          component={LocalizedInputField}
          label={intl.formatMessage(
            finishSessionMessages.finishConfirmationLabel,
          )}
          required={REQUIRED}
        />
      )}
      <Field<typeof LocalizedInputField>
        name={FINISH_FAILED_FIELD}
        component={LocalizedInputField}
        label={intl.formatMessage(finishSessionMessages.finishFailedLabel)}
        required={REQUIRED}
      />
    </BuilderSection>
  );
}
